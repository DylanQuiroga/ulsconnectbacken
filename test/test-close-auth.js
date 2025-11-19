// One-shot auth integration test: ensure admin user, login, POST to /events/:id/close
require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

// Start the app
require('../app');

const USER_EMAIL = 'admin-test@userena.cl';
const USER_PASS = 'AdminPass123!';
const USER_NAME = 'Admin Test';

async function ensureAdmin() {
  const mongoose = require('../lib/db').mongoose;
  const Usuario = require('../lib/models/Usuario');
  await require('../lib/db').connect();

  let user = await Usuario.findOne({ correoUniversitario: USER_EMAIL });
  if (user) {
    if (user.rol !== 'admin') {
      user.rol = 'admin';
      await user.save();
    }
    return;
  }

  const hash = await bcrypt.hash(USER_PASS, 10);
  const u = new Usuario({ correoUniversitario: USER_EMAIL, contrasena: hash, nombre: USER_NAME, rol: 'admin' });
  await u.save();
}

function httpRequest(method, path, data = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);
    if (cookie) options.headers['Cookie'] = cookie;

    const req = http.request(options, (res) => {
      let resp = '';
      const setCookie = res.headers['set-cookie'];
      res.on('data', (c) => resp += c);
      res.on('end', () => {
        let parsed; try { parsed = resp ? JSON.parse(resp) : {}; } catch (e) { parsed = resp; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, setCookie });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  try {
    await new Promise(r => setTimeout(r, 1500));
    await ensureAdmin();
    // login (auth routes are mounted at '/login')
    const loginRes = await httpRequest('POST', '/login', { correoUniversitario: USER_EMAIL, contrasena: USER_PASS });
    console.log('LOGIN STATUS', loginRes.status);
    console.log('LOGIN BODY', loginRes.body);
    if (!loginRes.setCookie || loginRes.setCookie.length === 0) {
      console.error('No session cookie returned');
      process.exit(1);
    }
    const sessionCookie = loginRes.setCookie[0].split(';')[0];

    // Create a new activity so we can close it
    const actividadPayload = {
      titulo: 'Actividad de prueba - cierre',
      descripcion: 'Descripción de prueba',
      area: 'Test',
      tipo: 'Taller',
      fechaInicio: new Date().toISOString(),
      fechaFin: new Date(Date.now() + 3600 * 1000).toISOString(),
      ubicacion: { nombreComuna: 'Comuna', nombreLugar: 'Lugar', lng: -70.0 },
      creadoPor: loginRes.body.user.id
    };

    const createRes = await httpRequest('POST', '/events/create', actividadPayload, sessionCookie);
    console.log('CREATE STATUS', createRes.status);
    console.log('CREATE BODY', JSON.stringify(createRes.body, null, 2));
    if (!createRes.body || !createRes.body.data || !createRes.body.data._id) {
      console.error('Failed to create activity for test');
      process.exit(1);
    }
    const actividadId = createRes.body.data._id;

    // Now call close endpoint for the created activity
    const closeRes = await httpRequest('POST', `/events/${actividadId}/close`, { motivo: 'fecha_alcanzada' }, sessionCookie);
    console.log('CLOSE STATUS', closeRes.status);
    console.log('CLOSE BODY', JSON.stringify(closeRes.body, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
