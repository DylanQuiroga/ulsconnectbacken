const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

// Fallback storage when MongoDB is not available
const USERS_FILE = path.join(__dirname, '..', '.dev-users.json');

async function _readUsers() {
  try {
    const exists = await fs.pathExists(USERS_FILE);
    if (!exists) return [];
    const data = await fs.readJson(USERS_FILE);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

async function _writeUsers(users) {
  await fs.outputJson(USERS_FILE, users, { spaces: 2 });
}

async function findByCorreo(correo) {
  const users = await _readUsers();
  return users.find(u => u.correoUniversitario === correo) || null;
}

async function findById(id) {
  const users = await _readUsers();
  return users.find(u => u._id === id) || null;
}

async function createUser({ correoUniversitario, contrasena, nombre, rol = 'estudiante', telefono = null, carrera = '', intereses = [] }) {
  const users = await _readUsers();
  const hash = await bcrypt.hash(contrasena, 10);
  const newUser = {
    _id: Date.now().toString(),
    correoUniversitario,
    contrasena: hash,
    nombre,
    rol,
    telefono,
    carrera,
    intereses,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
  };
  users.push(newUser);
  await _writeUsers(users);
  return newUser;
}

async function comparePassword(correo, plain) {
  const user = await findByCorreo(correo);
  if (!user) return false;
  return bcrypt.compare(plain, user.contrasena);
}

module.exports = { findByCorreo, findById, createUser, comparePassword };
