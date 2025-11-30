const Inscripcion = require('./schema/Inscripcion');
const ActividadModel = require('./activityModel');
const Actividad = require('./schema/Actividad');

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

      console.log('UsuarioId:', usuarioId, 'ActividadId:', actividadId);

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
      if (!id) throw new Error('ID de inscripción requerido');

      // Marcar como cancelada y obtener el documento actualizado
      const updated = await Inscripcion.findByIdAndUpdate(
        id,
        { estado: 'cancelada', motivoCancelacion: motivo },
        { new: true }
      );

      if (!updated) throw new Error('Inscripción no encontrada');

      // Poblar de forma explícita y secuencial (evita chaining sobre Promise)
      await updated.populate('usuario');
      await updated.populate('actividad');

      return updated;
    } catch (error) {
      console.error('Error al cancelar inscripción:', error);
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