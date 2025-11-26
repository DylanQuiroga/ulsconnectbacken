require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

// Start server
require('../app');

const db = require('../lib/db');
const Usuario = require('../lib/schema/Usuario');
const Actividad = require('../lib/schema/Actividad');

const ADMIN_EMAIL = 'admin.events@test.userena.cl';
const ADMIN_PASSWORD = 'AdminEventsPass123!';
const ADMIN_NAME = 'Admin Events Tester';

const STUDENT_EMAIL = 'student.events@test.userena.cl';
const STUDENT_PASSWORD = 'StudentEventsPass123!';
const STUDENT_NAME = 'Events Panel Student';

function httpRequest(method, path, data = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (cookie) options.headers.Cookie = cookie;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request(options, (res) => {
      let resp = '';
      const setCookie = res.headers['set-cookie'];
      res.on('data', (chunk) => { resp += chunk; });
      res.on('end', () => {
        let parsed = resp;
        try {
          parsed = resp ? JSON.parse(resp) : {};
        } catch (err) {
          // keep raw string (CSV not expected here)
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          setCookie
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureAdmin() {
  await db.connect();
  let admin = await Usuario.findOne({ correoUniversitario: ADMIN_EMAIL });
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (!admin) {
    admin = new Usuario({
      correoUniversitario: ADMIN_EMAIL,
      contrasena: hash,
      nombre: ADMIN_NAME,
      rol: 'admin'
    });
  } else {
    admin.contrasena = hash;
    admin.rol = 'admin';
  }
  await admin.save();
  return admin;
}

async function ensureStudent() {
  await db.connect();
  await Usuario.deleteMany({ correoUniversitario: STUDENT_EMAIL });
  const hash = await bcrypt.hash(STUDENT_PASSWORD, 10);

  const student = new Usuario({
    correoUniversitario: STUDENT_EMAIL,
    contrasena: hash,
    nombre: STUDENT_NAME,
    rol: 'estudiante',
    carrera: 'Ingenieria',
    intereses: ['voluntariado'],
    comuna: 'La Serena'
  });
  await student.save();
  return student;
}

async function seedActivity(admin) {
  const now = Date.now();

  await Actividad.deleteMany({ titulo: /Admin Events Test Activity/ });
  const actividad = new Actividad({
    titulo: `Admin Events Test Activity ${now}`,
    descripcion: 'Actividad para probar listado de eventos',
    area: 'Comunidad',
    tipo: 'Taller',
    fechaInicio: new Date(now + 60 * 60 * 1000),
    fechaFin: new Date(now + 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'La Serena',
      nombreLugar: 'Campus Andres Bello',
      lng: -70.601
    },
    capacidad: 30,
    estado: 'activa',
    creadoPor: admin._id
  });
  await actividad.save();
  return actividad;
}

async function cleanup(activityId) {
  if (activityId) {
    await Actividad.findByIdAndDelete(activityId);
  }
  await Usuario.deleteMany({ correoUniversitario: STUDENT_EMAIL });
}

async function run() {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const admin = await ensureAdmin();
    const student = await ensureStudent();
    const actividad = await seedActivity(admin);

    const loginRes = await httpRequest('POST', '/login', {
      correoUniversitario: ADMIN_EMAIL,
      contrasena: ADMIN_PASSWORD
    });
    console.log('LOGIN STATUS', loginRes.status);
    if (loginRes.status !== 200) {
      console.error('Login failed', loginRes.body);
      await cleanup(actividad._id);
      process.exit(1);
    }

    const sessionCookieHeader = Array.isArray(loginRes.setCookie)
      ? loginRes.setCookie.find((c) => c.startsWith('connect.sid='))
      : null;
    const sessionCookie = sessionCookieHeader ? sessionCookieHeader.split(';')[0] : null;
    console.log('SESSION COOKIE', sessionCookie);
    if (!sessionCookie) {
      console.error('Missing session cookie');
      await cleanup(actividad._id);
      process.exit(1);
    }

    const eventsRes = await httpRequest('GET', '/admin/events', null, sessionCookie);
    console.log('EVENTS STATUS', eventsRes.status);
    if (eventsRes.status !== 200 || !eventsRes.body || !eventsRes.body.success) {
      console.error('Events endpoint failed', eventsRes.body);
      await cleanup(actividad._id);
      process.exit(1);
    }

    const eventos = Array.isArray(eventsRes.body.eventos) ? eventsRes.body.eventos : [];
    const foundEvent = eventos.find((item) => item.id === String(actividad._id));
    if (!foundEvent) {
      console.error('Created activity not present in events list');
      await cleanup(actividad._id);
      process.exit(1);
    }
    if (foundEvent.imagen !== undefined) {
      console.error('Image buffer should not be included in events response');
      await cleanup(actividad._id);
      process.exit(1);
    }

    const studentsRes = await httpRequest('GET', '/admin/students', null, sessionCookie);
    console.log('STUDENTS STATUS', studentsRes.status);
    if (studentsRes.status !== 200 || !studentsRes.body || !studentsRes.body.success) {
      console.error('Students endpoint failed', studentsRes.body);
      await cleanup(actividad._id);
      process.exit(1);
    }

    const estudiantes = Array.isArray(studentsRes.body.estudiantes) ? studentsRes.body.estudiantes : [];
    const foundStudent = estudiantes.find((item) => item.correoUniversitario === STUDENT_EMAIL);
    if (!foundStudent) {
      console.error('Test student not returned by students endpoint');
      await cleanup(actividad._id);
      process.exit(1);
    }
    if (Object.prototype.hasOwnProperty.call(foundStudent, 'contrasena')) {
      console.error('Students endpoint should not expose contrasena field');
      await cleanup(actividad._id);
      process.exit(1);
    }

    console.log('Admin events/students tests passed');
    await cleanup(actividad._id);
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
