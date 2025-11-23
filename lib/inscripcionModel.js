const path = require('path');
const Enrollment = require(path.join(__dirname, 'models', 'Enrollment'));

/**
 * Crea una nueva inscripción
 */
async function crear(usuarioId, actividadId) {
  // Verificar si ya existe una inscripción
  const existente = await Enrollment.findOne({
    idUsuario: usuarioId,
    idActividad: actividadId
  });

  if (existente) {
    throw new Error('Ya estás inscrito en esta actividad');
  }

  const inscripcion = new Enrollment({
    idUsuario: usuarioId,
    idActividad: actividadId,
    estado: 'inscrito',
    fechaInscripcion: new Date()
  });

  await inscripcion.save();

  // Retornar con populate
  return await Enrollment.findById(inscripcion._id)
    .populate('idUsuario', 'nombre correoUniversitario')
    .populate('idActividad');
}

/**
 * Obtiene todas las inscripciones de un usuario
 */
async function obtenerPorUsuario(usuarioId) {
  return await Enrollment.find({ idUsuario: usuarioId })
    .populate('idActividad')
    .populate('idUsuario', 'nombre correoUniversitario')
    .sort({ creadoEn: -1 });
}

/**
 * Obtiene las inscripciones activas de un usuario (no canceladas)
 * ✅ CORREGIDO: Hacer populate de idActividad
 */
async function obtenerActivas(usuarioId) {
  return await Enrollment.find({
    idUsuario: usuarioId,
    estado: { $ne: 'cancelado' }
  })
    .populate({
      path: 'idActividad',
      select: 'titulo descripcion area tipo fechaInicio fechaTermino horaInicio horaTermino ubicacion cuposDisponibles estado imagenUrl requisitos contacto'
    })
    .populate('idUsuario', 'nombre correoUniversitario')
    .sort({ creadoEn: -1 });
}

/**
 * Obtiene las inscripciones de una actividad específica
 */
async function obtenerPorActividad(actividadId) {
  return await Enrollment.find({ idActividad: actividadId })
    .populate('idUsuario', 'nombre correoUniversitario rut carrera')
    .populate('idActividad')
    .sort({ creadoEn: -1 });
}

/**
 * Obtiene una inscripción por su ID
 */
async function obtenerPorId(inscripcionId) {
  return await Enrollment.findById(inscripcionId)
    .populate('idUsuario', 'nombre correoUniversitario')
    .populate('idActividad');
}

/**
 * Cancela una inscripción
 */
async function cancelar(inscripcionId, motivo) {
  const inscripcion = await Enrollment.findById(inscripcionId);
  if (!inscripcion) {
    throw new Error('Inscripción no encontrada');
  }

  inscripcion.estado = 'cancelado';
  if (motivo) {
    inscripcion.motivoCancelacion = motivo;
  }

  await inscripcion.save();

  // Retornar con populate
  return await Enrollment.findById(inscripcionId)
    .populate('idUsuario', 'nombre correoUniversitario')
    .populate('idActividad');
}

module.exports = {
  crear,
  obtenerPorUsuario,
  obtenerActivas,
  obtenerPorActividad,
  obtenerPorId,
  cancelar
};