require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

// Start server
require('../app');

const db = require('../lib/db');
const Usuario = require('../lib/schema/Usuario');
const Actividad = require('../lib/schema/Actividad');
const Enrollment = require('../lib/schema/Enrollment');

const TEST_EMAIL = 'volunteer.panel@test.userena.cl';
const TEST_PASSWORD = 'PanelPass123!';
const TEST_NAME = 'Volunteer Panel Tester';

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
          // leave as string
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

async function ensureStudent() {
  await db.connect();

  let user = await Usuario.findOne({ correoUniversitario: TEST_EMAIL });
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  if (!user) {
    user = new Usuario({
      correoUniversitario: TEST_EMAIL,
      contrasena: passwordHash,
      nombre: TEST_NAME,
      rol: 'estudiante'
    });
  } else {
    user.contrasena = passwordHash;
    user.rol = 'estudiante';
  }
  await user.save();
  await Enrollment.deleteMany({ idUsuario: user._id });
  await Actividad.deleteMany({ titulo: /Panel Test Activity/ });
  return user;
}

async function createEnrollment(user) {
  const now = Date.now();
  const actividad = new Actividad({
    titulo: `Panel Test Activity ${now}`,
    descripcion: 'Actividad de prueba para panel',
    area: 'Comunidad',
    tipo: 'Servicio',
    fechaInicio: new Date(now + 60 * 60 * 1000), // 1 hour in future
    fechaFin: new Date(now + 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'La Serena',
      nombreLugar: 'Campus',
      lng: -70.675
    },
    capacidad: 20,
    estado: 'activa',
    creadoPor: user._id
  });
  await actividad.save();

  const enrollment = new Enrollment({
    idActividad: actividad._id,
    idUsuario: user._id,
    estado: 'inscrito',
    registrosAsistencia: [
      {
        fecha: new Date(now - 24 * 60 * 60 * 1000),
        metodo: 'manual',
        registradoPor: user._id
      }
    ],
    notas: 'Test enrollment'
  });
  await enrollment.save();
  return { actividad, enrollment };
}

async function run() {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const user = await ensureStudent();
    const { actividad } = await createEnrollment(user);

    const loginRes = await httpRequest('POST', '/login', {
      correoUniversitario: TEST_EMAIL,
      contrasena: TEST_PASSWORD
    });
    console.log('LOGIN STATUS', loginRes.status);
    if (loginRes.status !== 200) {
      console.error('Login failed', loginRes.body);
      process.exit(1);
    }
    const sessionCookie = loginRes.setCookie && loginRes.setCookie.length ? loginRes.setCookie[0].split(';')[0] : null;
    if (!sessionCookie) {
      console.error('Missing session cookie');
      process.exit(1);
    }

    const panelRes = await httpRequest('GET', '/volunteer/panel', null, sessionCookie);
    console.log('PANEL STATUS', panelRes.status);
    console.log('PANEL BODY', JSON.stringify(panelRes.body, null, 2));

    if (panelRes.status !== 200 || !panelRes.body || !panelRes.body.success) {
      console.error('Panel request failed');
      process.exit(1);
    }

    const enrollments = panelRes.body.panel && Array.isArray(panelRes.body.panel.enrollments)
      ? panelRes.body.panel.enrollments
      : [];
    const match = enrollments.find((item) => item.activityId === String(actividad._id));

    if (!match) {
      console.error('Created enrollment not found in panel response');
      process.exit(1);
    }

    if (match.attendanceCount !== 1 || match.activityTitle !== actividad.titulo) {
      console.error('Panel data did not match expectations', match);
      process.exit(1);
    }

    console.log('Volunteer panel test passed');
    await Actividad.findByIdAndDelete(actividad._id);
    await Enrollment.deleteMany({ idActividad: actividad._id, idUsuario: user._id });
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
