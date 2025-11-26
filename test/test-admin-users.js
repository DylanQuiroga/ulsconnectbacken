require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

// Start server
require('../app');

const db = require('../lib/db');
const Usuario = require('../lib/schema/Usuario');

const ADMIN_EMAIL = 'admin.users@test.userena.cl';
const ADMIN_PASSWORD = 'AdminUsersPass123!';
const ADMIN_NAME = 'Admin Users Tester';

const TARGET_EMAIL = 'student.manage@test.userena.cl';
const TARGET_PASSWORD = 'ManageUsersPass123!';
const TARGET_NAME = 'Manage Users Target';

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
          // keep raw string
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
      rol: 'admin',
      bloqueado: false
    });
  } else {
    admin.contrasena = hash;
    admin.rol = 'admin';
    admin.bloqueado = false;
  }
  await admin.save();
  return admin;
}

async function ensureTargetUser() {
  await db.connect();
  await Usuario.deleteMany({ correoUniversitario: TARGET_EMAIL });
  const hash = await bcrypt.hash(TARGET_PASSWORD, 10);
  const user = new Usuario({
    correoUniversitario: TARGET_EMAIL,
    contrasena: hash,
    nombre: TARGET_NAME,
    rol: 'estudiante',
    bloqueado: false
  });
  await user.save();
  return user;
}

async function cleanupTarget() {
  await Usuario.deleteMany({ correoUniversitario: TARGET_EMAIL });
}

async function run() {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const admin = await ensureAdmin();
    const target = await ensureTargetUser();

    const loginRes = await httpRequest('POST', '/login', {
      correoUniversitario: ADMIN_EMAIL,
      contrasena: ADMIN_PASSWORD
    });
    console.log('ADMIN LOGIN STATUS', loginRes.status);
    if (loginRes.status !== 200) {
      console.error('Admin login failed', loginRes.body);
      await cleanupTarget();
      process.exit(1);
    }

    const sessionCookieHeader = Array.isArray(loginRes.setCookie)
      ? loginRes.setCookie.find((c) => c.startsWith('connect.sid='))
      : null;
    const sessionCookie = sessionCookieHeader ? sessionCookieHeader.split(';')[0] : null;
    if (!sessionCookie) {
      console.error('Missing admin session cookie');
      await cleanupTarget();
      process.exit(1);
    }

    const usersRes = await httpRequest('GET', `/admin/users?search=${encodeURIComponent(TARGET_EMAIL)}`, null, sessionCookie);
    console.log('LIST USERS STATUS', usersRes.status);
    if (usersRes.status !== 200 || !usersRes.body || !usersRes.body.success) {
      console.error('Users list failed', usersRes.body);
      await cleanupTarget();
      process.exit(1);
    }

    const usuarios = Array.isArray(usersRes.body.usuarios) ? usersRes.body.usuarios : [];
    const managedUser = usuarios.find((u) => u.correoUniversitario === TARGET_EMAIL);
    if (!managedUser) {
      console.error('Target user not returned in users list');
      await cleanupTarget();
      process.exit(1);
    }

    const roleRes = await httpRequest('PATCH', `/admin/users/${managedUser.id}/role`, { rol: 'staff' }, sessionCookie);
    console.log('UPDATE ROLE STATUS', roleRes.status);
    if (roleRes.status !== 200 || !roleRes.body || !roleRes.body.success) {
      console.error('Role update failed', roleRes.body);
      await cleanupTarget();
      process.exit(1);
    }
    if (roleRes.body.usuario && roleRes.body.usuario.rol !== 'staff') {
      console.error('Role not updated to staff', roleRes.body.usuario);
      await cleanupTarget();
      process.exit(1);
    }

    const blockRes = await httpRequest('PATCH', `/admin/users/${managedUser.id}/block`, { bloqueado: true }, sessionCookie);
    console.log('BLOCK STATUS', blockRes.status);
    if (blockRes.status !== 200 || !blockRes.body || !blockRes.body.success) {
      console.error('Block user failed', blockRes.body);
      await cleanupTarget();
      process.exit(1);
    }
    if (!blockRes.body.usuario || blockRes.body.usuario.bloqueado !== true) {
      console.error('Blocked flag not true', blockRes.body.usuario);
      await cleanupTarget();
      process.exit(1);
    }

    const blockedLogin = await httpRequest('POST', '/login', {
      correoUniversitario: TARGET_EMAIL,
      contrasena: TARGET_PASSWORD
    });
    console.log('BLOCKED LOGIN STATUS', blockedLogin.status);
    if (blockedLogin.status !== 403) {
      console.error('Blocked user login should fail with 403', blockedLogin.body);
      await cleanupTarget();
      process.exit(1);
    }

    const unblockRes = await httpRequest('PATCH', `/admin/users/${managedUser.id}/block`, { bloqueado: false }, sessionCookie);
    console.log('UNBLOCK STATUS', unblockRes.status);
    if (unblockRes.status !== 200 || !unblockRes.body || !unblockRes.body.success) {
      console.error('Unblock user failed', unblockRes.body);
      await cleanupTarget();
      process.exit(1);
    }

    const loginOk = await httpRequest('POST', '/login', {
      correoUniversitario: TARGET_EMAIL,
      contrasena: TARGET_PASSWORD
    });
    console.log('UNBLOCKED LOGIN STATUS', loginOk.status);
    if (loginOk.status !== 200) {
      console.error('Unblocked user login failed', loginOk.body);
      await cleanupTarget();
      process.exit(1);
    }

    console.log('Admin users management test passed');
    await cleanupTarget();
    process.exit(0);
  } catch (err) {
    console.error('TEST ERROR', err && err.message ? err.message : err);
    await cleanupTarget();
    process.exit(1);
  }
}

run();
