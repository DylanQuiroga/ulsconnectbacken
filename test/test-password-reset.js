require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

require('../app');

const db = require('../lib/db');
const Usuario = require('../lib/schema/Usuario');
const PasswordResetToken = require('../lib/schema/PasswordResetToken');
const passwordResetService = require('../lib/passwordResetService');

const TEST_EMAIL = 'password.reset@test.userena.cl';
const INITIAL_PASSWORD = 'InitialReset123!';
const NEW_PASSWORD = 'ResetPass987!';
const TEST_NAME = 'Password Reset Tester';

function httpRequest(method, path, data = null) {
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
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request(options, (res) => {
      let resp = '';
      res.on('data', chunk => { resp += chunk; });
      res.on('end', () => {
        let parsed = resp;
        try {
          parsed = resp ? JSON.parse(resp) : {};
        } catch (err) {
          // ignore - plain string response
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureTestUser() {
  await db.connect();
  let user = await Usuario.findOne({ correoUniversitario: TEST_EMAIL });
  const hash = await bcrypt.hash(INITIAL_PASSWORD, 10);

  if (!user) {
    user = new Usuario({
      correoUniversitario: TEST_EMAIL,
      contrasena: hash,
      nombre: TEST_NAME,
      rol: 'estudiante'
    });
  } else {
    user.contrasena = hash;
    user.rol = 'estudiante';
  }
  await user.save();
  return user;
}

async function clearTokens(userId) {
  try {
    await PasswordResetToken.deleteMany({ userId });
  } catch (err) {
    console.warn('Unable to delete password reset tokens for cleanup', err.message);
  }
}

async function run() {
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const user = await ensureTestUser();
    await clearTokens(user._id);

    const forgotRes = await httpRequest('POST', '/password/forgot', { correoUniversitario: TEST_EMAIL });
    console.log('FORGOT STATUS', forgotRes.status);
    if (forgotRes.status !== 200 || !forgotRes.body || !forgotRes.body.success) {
      console.error('Forgot password endpoint failed', forgotRes.body);
      process.exit(1);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
    const storedToken = await PasswordResetToken.findOne({ userId: user._id }).lean();
    if (!storedToken) {
      console.error('Password reset token not stored for user');
      process.exit(1);
    }
    await clearTokens(user._id);

    const { token } = await passwordResetService.createResetTokenForUser(user._id, { ip: '127.0.0.1' });
    const resetRes = await httpRequest('POST', '/password/reset', { token, contrasena: NEW_PASSWORD });
    console.log('RESET STATUS', resetRes.status);
    if (resetRes.status !== 200 || !resetRes.body || !resetRes.body.success) {
      console.error('Password reset failed', resetRes.body);
      process.exit(1);
    }

    const loginRes = await httpRequest('POST', '/login', {
      correoUniversitario: TEST_EMAIL,
      contrasena: NEW_PASSWORD
    });
    console.log('LOGIN STATUS', loginRes.status);
    if (loginRes.status !== 200 || !loginRes.body || !loginRes.body.success) {
      console.error('Login with new password failed', loginRes.body);
      process.exit(1);
    }

    await Usuario.findByIdAndUpdate(user._id, { contrasena: await bcrypt.hash(INITIAL_PASSWORD, 10) });
    await clearTokens(user._id);
    console.log('Password reset test passed');
    process.exit(0);
  } catch (err) {
    console.error('PASSWORD RESET TEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
