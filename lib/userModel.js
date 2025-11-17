const bcrypt = require('bcryptjs');
const Usuario = require('./models/Usuario');
const db = require('./db');
const fallback = require('./userModelFallback');

let useFallback = false;

async function ensureConnection() {
  try {
    await db.connect();
    useFallback = false;
  } catch (err) {
    console.warn('⚠️  MongoDB unavailable, using file-based fallback for development');
    useFallback = true;
  }
}

async function findByCorreo(correo) {
  await ensureConnection();
  if (useFallback) return fallback.findByCorreo(correo);
  return Usuario.findOne({ correoUniversitario: correo }).lean();
}

async function findById(id) {
  await ensureConnection();
  if (useFallback) return fallback.findById(id);
  return Usuario.findById(id).lean();
}

async function createUser({ correoUniversitario, contrasena, nombre, rol = 'estudiante', telefono = null, carrera = '', intereses = [], comuna = '', direccion = '', edad = null, status = '' }) {
  await ensureConnection();
  if (useFallback) return fallback.createUser({ correoUniversitario, contrasena, nombre, rol, telefono, carrera, intereses, comuna, direccion, edad, status });
  const hash = await bcrypt.hash(contrasena, 10);
  const u = new Usuario({ correoUniversitario, contrasena: hash, nombre, rol, telefono, carrera, intereses, comuna, direccion, edad, status });
  await u.save();
  return u.toObject();
}

// Create user using a pre-hashed password (used when approving registration requests)
async function createUserFromHash({ correoUniversitario, contrasenaHash, nombre, rol = 'estudiante', telefono = null, carrera = '', intereses = [] }) {
  await ensureConnection();
  if (useFallback) return fallback.createUserFromHash ? fallback.createUserFromHash({ correoUniversitario, contrasenaHash, nombre, rol, telefono, carrera, intereses }) : null;
  const u = new Usuario({ correoUniversitario, contrasena: contrasenaHash, nombre, rol, telefono, carrera, intereses });
  await u.save();
  return u.toObject();
}

async function comparePassword(correo, plain) {
  await ensureConnection();
  if (useFallback) return fallback.comparePassword(correo, plain);
  const user = await Usuario.findOne({ correoUniversitario: correo });
  if (!user) return false;
  return bcrypt.compare(plain, user.contrasena);
}

module.exports = { findByCorreo, findById, createUser, createUserFromHash, comparePassword };
