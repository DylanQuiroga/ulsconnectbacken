require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

// Start server
require('../app');

const db = require('../lib/db');
const Usuario = require('../lib/schema/Usuario');
const Actividad = require('../lib/schema/Actividad');
const Enrollment = require('../lib/schema/Enrollment');
const RegistroAsistencia = require('../lib/schema/RegistroAsistencia');

const ADMIN_EMAIL = 'admin.panel@test.userena.cl';
const ADMIN_PASSWORD = 'AdminPanelPass123!';
const ADMIN_NAME = 'Admin Panel Tester';

const STUDENT_EMAIL = 'student.panel@test.userena.cl';
const STUDENT_PASSWORD = 'StudentPanelPass123!';
const STUDENT_NAME = 'Admin Panel Student';

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
          // leave as string for CSV endpoints
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
  let student = await Usuario.findOne({ correoUniversitario: STUDENT_EMAIL });
  const hash = await bcrypt.hash(STUDENT_PASSWORD, 10);

  if (!student) {
    student = new Usuario({
      correoUniversitario: STUDENT_EMAIL,
      contrasena: hash,
      nombre: STUDENT_NAME,
      rol: 'estudiante'
    });
  } else {
    student.contrasena = hash;
    student.rol = 'estudiante';
  }
  await student.save();
  return student;
}

async function seedData(admin, student) {
  const now = Date.now();

  await Actividad.deleteMany({ titulo: /Admin Panel Test Activity/ });

  const actividad = new Actividad({
    titulo: `Admin Panel Test Activity ${now}`,
    descripcion: 'Actividad para probar el panel administrativo',
    area: 'Comunidad',
    tipo: 'Taller',
    fechaInicio: new Date(now + 60 * 60 * 1000),
    fechaFin: new Date(now + 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'La Serena',
      nombreLugar: 'Campus Andres Bello',
      lng: -70.601
    },
    capacidad: 25,
    estado: 'activa',
    creadoPor: admin._id
  });
  await actividad.save();

  await Enrollment.deleteMany({ idActividad: actividad._id });
  const enrollment = new Enrollment({
    idActividad: actividad._id,
    idUsuario: student._id,
    estado: 'confirmado',
    respuestas: { motivacion: 'Medir panel administrativo' }
  });
  await enrollment.save();

  await RegistroAsistencia.deleteMany({ idActividad: actividad._id });
  const attendanceRecord = new RegistroAsistencia({
    idActividad: actividad._id,
    idUsuario: student._id,
    evento: 'sesion_inicial',
    fecha: new Date(now - 30 * 60 * 1000),
    registradoPor: admin._id
  });
  await attendanceRecord.save();

  return { actividad, enrollment, attendanceRecord };
}

async function cleanup(activityId, studentId) {
  await RegistroAsistencia.deleteMany({ idActividad: activityId, idUsuario: studentId });
  await Enrollment.deleteMany({ idActividad: activityId, idUsuario: studentId });
  await Actividad.findByIdAndDelete(activityId);
}

async function run() {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const admin = await ensureAdmin();
    const student = await ensureStudent();
    const { actividad } = await seedData(admin, student);

    const loginRes = await httpRequest('POST', '/login', {
      correoUniversitario: ADMIN_EMAIL,
      contrasena: ADMIN_PASSWORD
    });
    console.log('LOGIN STATUS', loginRes.status);
    if (loginRes.status !== 200) {
      console.error('Login failed', loginRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const sessionCookieHeader = Array.isArray(loginRes.setCookie)
      ? loginRes.setCookie.find((c) => c.startsWith('connect.sid='))
      : null;
    const sessionCookie = sessionCookieHeader ? sessionCookieHeader.split(';')[0] : null;
    if (!sessionCookie) {
      console.error('Missing session cookie');
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const panelRes = await httpRequest('GET', '/admin/panel', null, sessionCookie);
    console.log('PANEL STATUS', panelRes.status);
    if (panelRes.status !== 200 || !panelRes.body || !panelRes.body.success) {
      console.error('Panel request failed', panelRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const panel = panelRes.body.panel;
    if (!panel || !panel.summary || typeof panel.summary.totalActivities !== 'number') {
      console.error('Panel payload missing summary data');
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const areaMetrics = panel.metrics && Array.isArray(panel.metrics.byArea) ? panel.metrics.byArea : [];
    const areaEntry = areaMetrics.find((item) => item.area === actividad.area);
    if (!areaEntry) {
      console.error('Area metrics missing test activity area', areaMetrics);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const latestEnrollments = panel.enrollments && Array.isArray(panel.enrollments.latest) ? panel.enrollments.latest : [];
    const enrollmentFound = latestEnrollments.find((item) => item.activityId === String(actividad._id));
    if (!enrollmentFound) {
      console.error('Created enrollment not listed in admin panel response');
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const recentAttendance = panel.attendance && Array.isArray(panel.attendance.recent) ? panel.attendance.recent : [];
    const attendanceFound = recentAttendance.find((item) => item.activityId === String(actividad._id));
    if (!attendanceFound) {
      console.error('Attendance record not reflected in admin panel response');
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    if (!panel.exports || !panel.exports.enrollmentsCsv || !panel.exports.attendanceCsv) {
      console.error('Export links missing from panel response', panel.exports);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const csvEnrollRes = await httpRequest('GET', panel.exports.enrollmentsCsv, null, sessionCookie);
    console.log('ENROLLMENT CSV STATUS', csvEnrollRes.status);
    if (csvEnrollRes.status !== 200 || !csvEnrollRes.headers['content-type'].includes('text/csv')) {
      console.error('Enrollment CSV export failed', csvEnrollRes.status, csvEnrollRes.headers);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }
    if (typeof csvEnrollRes.body !== 'string' || !csvEnrollRes.body.includes('ID Inscripcion')) {
      console.error('Enrollment CSV export unexpected payload', csvEnrollRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const csvAttendanceRes = await httpRequest('GET', panel.exports.attendanceCsv, null, sessionCookie);
    console.log('ATTENDANCE CSV STATUS', csvAttendanceRes.status);
    if (csvAttendanceRes.status !== 200 || !csvAttendanceRes.headers['content-type'].includes('text/csv')) {
      console.error('Attendance CSV export failed', csvAttendanceRes.status, csvAttendanceRes.headers);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }
    if (typeof csvAttendanceRes.body !== 'string' || !csvAttendanceRes.body.includes('ID Registro')) {
      console.error('Attendance CSV export unexpected payload', csvAttendanceRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    console.log('Admin panel test passed');
    await cleanup(actividad._id, student._id);
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
