const Inscripcion = require('./models/Inscripcion');
const ActividadModel = require('./activityModel');
const Actividad = require('./models/Actividad');

class InscripcionModel {
  static async crear(usuarioId, actividadId) {
    try {
      if (!usuarioId || !actividadId) {
        throw new Error('usuarioId y actividadId son requeridos');
      }

      // Verificar que la actividad existe y tiene capacidad
      const actividad = await Actividad.findById(actividadId);
      if (!actividad) {
        throw new Error('Actividad no encontrada');
      }

      // Verificar que la actividad esté activa
      if (actividad.estado !== 'activa') {
        throw new Error('No es posible inscribirse: la actividad no está activa');
      }

      if (actividad.capacidad !== null && actividad.capacidad <= 0) {
        throw new Error('La actividad no tiene capacidad disponible');
      }

      // Evitar duplicados antes de intentar guardar
      const existe = await Inscripcion.exists({ usuario: usuarioId, actividad: actividadId });
      if (existe) {
        throw new Error('Ya estás inscrito en esta actividad');
      }

      // Crear inscripción
      const inscripcion = new Inscripcion({
        usuario: usuarioId,
        actividad: actividadId
      });

      try {
        await inscripcion.save();
      } catch (err) {
        if (err.code === 11000) throw new Error('Ya estás inscrito en esta actividad');
        throw err;
      }

      // Reducir capacidad de la actividad
      if (actividad.capacidad !== null) {
        await Actividad.findByIdAndUpdate(actividadId, { $inc: { capacidad: -1 } });
      }

      // Retornar inscripción con populate (hacer una consulta para poder usar populate)
      return await Inscripcion.findById(inscripcion._id).populate('usuario').populate('actividad');
    } catch (error) {
      throw new Error(`Error al crear inscripción: ${error.message}`);
    }
  }

  static async obtenerPorId(id) {
    try {
      return await Inscripcion.findById(id).populate('usuario').populate('actividad');
    } catch (error) {
      throw new Error(`Error al obtener inscripción: ${error.message}`);
    }
  }

  static async obtenerPorUsuario(usuarioId) {
    try {
      return await Inscripcion.find({ usuario: usuarioId }).populate('actividad');
    } catch (error) {
      throw new Error(`Error al obtener inscripciones del usuario: ${error.message}`);
    }
  }

  static async obtenerPorActividad(actividadId) {
    try {
      return await Inscripcion.find({ actividad: actividadId }).populate('usuario');
    } catch (error) {
      throw new Error(`Error al obtener inscripciones de la actividad: ${error.message}`);
    }
  }

  static async cancelar(id, motivo = null) {
    try {
      const inscripcion = await Inscripcion.findById(id);
      if (!inscripcion) {
        throw new Error('Inscripción no encontrada');
      }

      // Actualizar inscripción
      const resultado = await Inscripcion.findByIdAndUpdate(
        id,
        { estado: 'cancelada', motivoCancelacion: motivo },
        { new: true }
      );

      // Aumentar capacidad de la actividad
      const actividad = await Actividad.findById(inscripcion.actividad);
      if (actividad && actividad.capacidad !== null) {
        await Actividad.findByIdAndUpdate(inscripcion.actividad, { $inc: { capacidad: 1 } });
      }

      return await resultado.populate('usuario').populate('actividad');
    } catch (error) {
      throw new Error(`Error al cancelar inscripción: ${error.message}`);
    }
  }

  static async obtenerActivas(usuarioId) {
    try {
      return await Inscripcion.find({ usuario: usuarioId, estado: 'activa' }).populate('actividad');
    } catch (error) {
      throw new Error(`Error al obtener inscripciones activas: ${error.message}`);
    }
  }
}

module.exports = InscripcionModel;