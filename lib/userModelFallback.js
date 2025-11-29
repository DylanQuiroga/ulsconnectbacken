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

async function createUser({ correoUniversitario, contrasena, nombre, rol = 'estudiante', telefono = null, carrera = '', intereses = [], comuna = '', direccion = '', edad = null, status = '' }) {
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
    comuna,
    direccion,
    edad,
    status,
    bloqueado: false,
    puntos: 0,
    historialPuntos: [],
    creadoEn: new Date(),
    actualizadoEn: new Date(),
  };
  users.push(newUser);
  await _writeUsers(users);
  return newUser;
}

async function createUserFromHash({ correoUniversitario, contrasenaHash, nombre, rol = 'estudiante', telefono = null, carrera = '', intereses = [], comuna = '', direccion = '', edad = null, status = '' }) {
  const users = await _readUsers();
  const newUser = {
    _id: Date.now().toString(),
    correoUniversitario,
    contrasena: contrasenaHash,
    nombre,
    rol,
    telefono,
    carrera,
    intereses,
    comuna,
    direccion,
    edad,
    status,
    bloqueado: false,
    puntos: 0,
    historialPuntos: [],
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

async function findAllStudents() {
  const users = await _readUsers();
  return users
    .filter((u) => (u.rol || 'estudiante') === 'estudiante')
    .map((u) => {
      const { contrasena, ...rest } = u;
      return rest;
    });
}

async function updatePassword(userId, plainPassword) {
  const users = await _readUsers();
  const index = users.findIndex(u => u._id === userId);
  if (index === -1) return null;
  const hash = await bcrypt.hash(plainPassword, 10);
  users[index].contrasena = hash;
  users[index].actualizadoEn = new Date();
  await _writeUsers(users);
  return users[index];
}

async function updateProfile(userId, updates = {}) {
  const users = await _readUsers();
  const index = users.findIndex(u => u._id === userId);
  if (index === -1) return null;

  const allowedFields = ['nombre', 'telefono', 'carrera', 'intereses', 'comuna', 'direccion', 'edad', 'status'];
  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      users[index][field] = updates[field];
    }
  });

  users[index].actualizadoEn = new Date();
  await _writeUsers(users);
  return users[index];
}

async function listUsers({ search = '', role = null, blocked = null, limit = 100, skip = 0 } = {}) {
  const users = await _readUsers();
  let filtered = [...users];

  if (role) {
    filtered = filtered.filter(u => (u.rol || 'estudiante') === role);
  }
  if (blocked !== null) {
    filtered = filtered.filter(u => Boolean(u.bloqueado) === Boolean(blocked));
  }
  if (search && typeof search === 'string' && search.trim()) {
    const s = search.trim().toLowerCase();
    filtered = filtered.filter((u) => {
      const nombre = (u.nombre || '').toLowerCase();
      const correo = (u.correoUniversitario || '').toLowerCase();
      return nombre.includes(s) || correo.includes(s);
    });
  }

  const total = filtered.length;
  const paginated = filtered
    .sort((a, b) => new Date(b.creadoEn || 0) - new Date(a.creadoEn || 0))
    .slice(skip, skip + limit)
    .map(({ contrasena, ...rest }) => rest);

  return { users: paginated, total };
}

async function updateRole(userId, role) {
  const users = await _readUsers();
  const index = users.findIndex(u => u._id === userId);
  if (index === -1) return null;
  users[index].rol = role;
  users[index].actualizadoEn = new Date();
  await _writeUsers(users);
  const { contrasena, ...rest } = users[index];
  return rest;
}

async function setBlocked(userId, blocked) {
  const users = await _readUsers();
  const index = users.findIndex(u => u._id === userId);
  if (index === -1) return null;
  users[index].bloqueado = Boolean(blocked);
  users[index].actualizadoEn = new Date();
  await _writeUsers(users);
  const { contrasena, ...rest } = users[index];
  return rest;
}

async function adjustScore(userId, delta, { motivo = '', actividadId = null, registradoPor = null, dedupeByActivity = false } = {}) {
  const users = await _readUsers();
  const index = users.findIndex(u => u._id === userId);
  if (index === -1) return { applied: false, user: null };

  const user = users[index];
  if (!Array.isArray(user.historialPuntos)) user.historialPuntos = [];
  if (typeof user.puntos !== 'number') user.puntos = 0;

  if (dedupeByActivity && actividadId) {
    const exists = user.historialPuntos.some(entry => String(entry.actividad || '') === String(actividadId));
    if (exists) {
      return { applied: false, user };
    }
  }

  user.puntos += Number(delta) || 0;
  user.historialPuntos.unshift({
    cambio: Number(delta) || 0,
    motivo,
    actividad: actividadId || null,
    registradoPor: registradoPor || null,
    fecha: new Date()
  });
  user.historialPuntos = user.historialPuntos.slice(0, 50);
  user.actualizadoEn = new Date();

  users[index] = user;
  await _writeUsers(users);

  const { contrasena, ...rest } = user;
  return { applied: true, user: rest };
}

async function getScore(userId, limit = 20) {
  const users = await _readUsers();
  const user = users.find(u => u._id === userId);
  if (!user) return null;
  const { contrasena, ...rest } = user;
  return {
    puntos: user.puntos || 0,
    historial: Array.isArray(user.historialPuntos)
      ? user.historialPuntos.slice(0, Math.max(0, limit))
      : [],
    usuario: rest
  };
}

async function getLeaderboard(limit = 10) {
  const users = await _readUsers();
  return users
    .filter((u) => (u.rol || 'estudiante') === 'estudiante')
    .sort((a, b) => (b.puntos || 0) - (a.puntos || 0))
    .slice(0, Math.max(1, limit))
    .map(({ contrasena, ...rest }) => rest);
}

module.exports = {
  findByCorreo,
  findById,
  createUser,
  createUserFromHash,
  comparePassword,
  findAllStudents,
  updatePassword,
  updateProfile,
  listUsers,
  updateRole,
  setBlocked,
  adjustScore,
  getScore,
  getLeaderboard
};
