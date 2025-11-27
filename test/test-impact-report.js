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
const ReporteImpacto = require('../lib/schema/ReporteImpacto');

const ADMIN_EMAIL = 'admin.impact@test.userena.cl';
const ADMIN_PASSWORD = 'AdminImpactPass123!';
const ADMIN_NAME = 'Admin Impact Tester';

const STUDENT_EMAIL = 'student.impact@test.userena.cl';
const STUDENT_PASSWORD = 'StudentImpactPass123!';
const STUDENT_NAME = 'Impact Student';

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
          // keep raw text
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
  await Usuario.deleteMany({ correoUniversitario: ADMIN_EMAIL });
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = new Usuario({
    correoUniversitario: ADMIN_EMAIL,
    contrasena: hash,
    nombre: ADMIN_NAME,
    rol: 'admin'
  });
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
    rol: 'estudiante'
  });
  await student.save();
  return student;
}

async function seedData(admin, student) {
  const now = Date.now();

  await Actividad.deleteMany({ titulo: /Impact Report Test Activity/ });

  const actividad = new Actividad({
    titulo: `Impact Report Test Activity ${now}`,
    descripcion: 'Actividad para probar reporte de impacto',
    area: 'Comunidad',
    tipo: 'Voluntariado',
    fechaInicio: new Date(now - 3 * 60 * 60 * 1000),
    fechaFin: new Date(now - 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'Coquimbo',
      nombreLugar: 'Campus',
      lng: -70.601
    },
    capacidad: 15,
    estado: 'closed',
    creadoPor: admin._id
  });
  await actividad.save();

  await Enrollment.deleteMany({ idActividad: actividad._id });
  const enrollment = new Enrollment({
    idActividad: actividad._id,
    idUsuario: student._id,
    estado: 'confirmado',
    respuestas: { motivacion: 'Medir impacto' }
  });
  await enrollment.save();

  await RegistroAsistencia.deleteMany({ idActividad: actividad._id });
  const attendanceRecord = new RegistroAsistencia({
    idActividad: actividad._id,
    idUsuario: student._id,
    evento: 'final',
    fecha: new Date(now - 2.5 * 60 * 60 * 1000),
    registradoPor: admin._id
  });
  await attendanceRecord.save();

  await ReporteImpacto.deleteMany({ idActividad: actividad._id });

  return { actividad, enrollment, attendanceRecord };
}

async function cleanup(activityId, studentId) {
  await ReporteImpacto.deleteMany({ idActividad: activityId });
  await RegistroAsistencia.deleteMany({ idActividad: activityId, idUsuario: studentId });
  await Enrollment.deleteMany({ idActividad: activityId, idUsuario: studentId });
  await Actividad.findByIdAndDelete(activityId);
  await Usuario.deleteMany({ correoUniversitario: STUDENT_EMAIL });
  await Usuario.deleteMany({ correoUniversitario: ADMIN_EMAIL });
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

    const impactRes = await httpRequest('POST', '/admin/impact-reports', {
      actividadId: actividad._id,
      beneficiarios: 10,
      notas: 'Observaciones finales del coordinador'
    }, sessionCookie);
    console.log('IMPACT REPORT STATUS', impactRes.status);
    if (impactRes.status !== 201 || !impactRes.body || !impactRes.body.success) {
      console.error('Impact report creation failed', impactRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const metricas = impactRes.body.reporte && impactRes.body.reporte.metricas ? impactRes.body.reporte.metricas : null;
    if (!metricas || metricas.voluntariosInvitados !== 1 || metricas.voluntariosConfirmados !== 1 || metricas.voluntariosAsistieron !== 1) {
      console.error('Impact metrics not calculated as expected', metricas);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }
    if (typeof metricas.horasTotales !== 'number' || metricas.horasTotales <= 0) {
      console.error('Total hours not calculated correctly', metricas.horasTotales);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const duplicateRes = await httpRequest('POST', '/admin/impact-reports', {
      actividadId: actividad._id
    }, sessionCookie);
    if (duplicateRes.status !== 409) {
      console.error('Duplicate report should be rejected', duplicateRes.status, duplicateRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const panelRes = await httpRequest('GET', '/admin/panel', null, sessionCookie);
    console.log('PANEL STATUS', panelRes.status);
    if (panelRes.status !== 200 || !panelRes.body || !panelRes.body.success) {
      console.error('Panel request failed after creating impact report', panelRes.body);
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    const reports = panelRes.body.panel && Array.isArray(panelRes.body.panel.impactReports)
      ? panelRes.body.panel.impactReports
      : [];
    const reportFound = reports.find((item) => item.activityId === String(actividad._id));
    if (!reportFound) {
      console.error('Impact report not returned in admin panel payload');
      await cleanup(actividad._id, student._id);
      process.exit(1);
    }

    console.log('Impact report test passed');
    await cleanup(actividad._id, student._id);
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
