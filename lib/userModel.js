const bcrypt = require('bcryptjs');
const Usuario = require('./schema/Usuario');
const db = require('./db');
const fallback = require('./userModelFallback');

let useFallback = false;

const ROLE_MAP = {
  estudiante: 'estudiante',
  student: 'estudiante',
  admin: 'admin',
  administrator: 'admin',
  administrador: 'admin',
  staff: 'staff',
  coordinator: 'staff',
  coordinador: 'staff'
};

function normalizeRole(role) {
  if (role === undefined || role === null) return null;
  const key = String(role).trim().toLowerCase();
  return ROLE_MAP[key] || null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureConnection() {
  try {
    await db.connect();
    useFallback = false;
  } catch (err) {
    console.warn('MongoDB unavailable, using file-based fallback for development');
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

async function listUsers({ search = '', role = null, blocked = null, limit = 100, skip = 0 } = {}) {
  await ensureConnection();
  const normalizedRole = normalizeRole(role);
  const blockedValue = blocked === null || blocked === undefined ? null : Boolean(blocked);

  if (useFallback && typeof fallback.listUsers === 'function') {
    return fallback.listUsers({ search, role: normalizedRole, blocked: blockedValue, limit, skip });
  }

  const filters = [];
  if (normalizedRole) filters.push({ rol: normalizedRole });
  if (blockedValue !== null) {
    filters.push(
      blockedValue
        ? { bloqueado: true }
        : { $or: [{ bloqueado: false }, { bloqueado: { $exists: false } }] }
    );
  }
  if (search && typeof search === 'string' && search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), 'i');
    filters.push({ $or: [{ nombre: regex }, { correoUniversitario: regex }] });
  }

  const queryFilter = filters.length ? { $and: filters } : {};

  const [users, total] = await Promise.all([
    Usuario.find(queryFilter)
      .sort({ creadoEn: -1 })
      .skip(skip)
      .limit(limit)
      .select('-contrasena')
      .lean(),
    Usuario.countDocuments(queryFilter)
  ]);

  return { users, total };
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
async function createUserFromHash({ correoUniversitario, contrasenaHash, nombre, rol = 'estudiante', telefono = null, carrera = '', intereses = [], comuna = '', direccion = '', edad = null, status = '' }) {
  await ensureConnection();
  if (useFallback) return fallback.createUserFromHash ? fallback.createUserFromHash({ correoUniversitario, contrasenaHash, nombre, rol, telefono, carrera, intereses, comuna, direccion, edad, status }) : null;
  const u = new Usuario({ correoUniversitario, contrasena: contrasenaHash, nombre, rol, telefono, carrera, intereses, comuna, direccion, edad, status });
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

async function findAllStudents() {
  await ensureConnection();
  if (useFallback && typeof fallback.findAllStudents === 'function') {
    return fallback.findAllStudents();
  }

  // Exclude password hashes before returning
  return Usuario.find({ rol: 'estudiante' })
    .select('-contrasena')
    .lean();
}

async function updatePassword(userId, plainPassword) {
  if (!userId || !plainPassword) throw new Error('User ID and password are required');
  await ensureConnection();
  if (useFallback) return fallback.updatePassword(userId, plainPassword);
  const hash = await bcrypt.hash(plainPassword, 10);
  const updated = await Usuario.findByIdAndUpdate(userId, { contrasena: hash }, { new: true });
  return updated ? updated.toObject() : null;
}

async function updateProfile(userId, profileData = {}) {
  if (!userId) throw new Error('User ID is required');
  await ensureConnection();

  const allowedFields = ['nombre', 'telefono', 'carrera', 'intereses', 'comuna', 'direccion', 'edad', 'status'];
  const payload = {};

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(profileData, field)) {
      payload[field] = profileData[field];
    }
  });

  if (!Object.keys(payload).length) {
    if (useFallback) return fallback.findById(userId);
    return Usuario.findById(userId).lean();
  }

  if (useFallback && typeof fallback.updateProfile === 'function') {
    return fallback.updateProfile(userId, payload);
  }

  const updated = await Usuario.findByIdAndUpdate(userId, payload, { new: true, lean: true });
  return updated;
}

async function updateRole(userId, role) {
  if (!userId) throw new Error('User ID is required');
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) throw new Error('Rol invalido');

  await ensureConnection();
  if (useFallback && typeof fallback.updateRole === 'function') {
    return fallback.updateRole(userId, normalizedRole);
  }

  return Usuario.findByIdAndUpdate(
    userId,
    { rol: normalizedRole },
    { new: true, lean: true, select: '-contrasena' }
  );
}

async function setBlocked(userId, blocked) {
  if (!userId) throw new Error('User ID is required');
  const blockedValue = Boolean(blocked);

  await ensureConnection();
  if (useFallback && typeof fallback.setBlocked === 'function') {
    return fallback.setBlocked(userId, blockedValue);
  }

  return Usuario.findByIdAndUpdate(
    userId,
    { bloqueado: blockedValue },
    { new: true, lean: true, select: '-contrasena' }
  );
}

module.exports = {
  findByCorreo,
  findById,
  listUsers,
  createUser,
  createUserFromHash,
  comparePassword,
  findAllStudents,
  updatePassword,
  updateProfile,
  updateRole,
  setBlocked,
  normalizeRole
};
