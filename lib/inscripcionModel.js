// Lógica de negocio para inscripciones de usuarios a actividades
const Inscripcion = require('./schema/Inscripcion');
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

      // Verificar que la actividad esta activa
      if (actividad.estado !== 'activa') {
        throw new Error('No es posible inscribirse: la actividad no esta activa');
      }

      if (actividad.capacidad !== null && actividad.capacidad <= 0) {
        throw new Error('La actividad no tiene capacidad disponible');
      }

      // Evitar duplicados antes de intentar guardar
      const existe = await Inscripcion.exists({ usuario: usuarioId, actividad: actividadId });
      if (existe) {
        throw new Error('Ya estas inscrito en esta actividad');
      }

      // Crear inscripcion
      const inscripcion = new Inscripcion({
        usuario: usuarioId,
        actividad: actividadId
      });

      try {
        await inscripcion.save();
      } catch (err) {
        if (err.code === 11000) throw new Error('Ya estas inscrito en esta actividad');
        throw err;
      }

      // Reducir capacidad de la actividad
      if (actividad.capacidad !== null) {
        await Actividad.findByIdAndUpdate(actividadId, { $inc: { capacidad: -1 } });
      }

      // Retornar inscripcion con populate
      return await Inscripcion.findById(inscripcion._id).populate('usuario').populate('actividad');
    } catch (error) {
      throw new Error(`Error al crear inscripcion: ${error.message}`);
    }
  }

  static async obtenerPorId(id) {
    try {
      return await Inscripcion.findById(id).populate('usuario').populate('actividad');
    } catch (error) {
      throw new Error(`Error al obtener inscripcion: ${error.message}`);
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
      if (!id) throw new Error('ID de inscripcion requerido');

      // Marcar como cancelada y obtener el documento actualizado
      const updated = await Inscripcion.findByIdAndUpdate(
        id,
        { estado: 'cancelada', motivoCancelacion: motivo },
        { new: true }
      );

      if (!updated) throw new Error('Inscripcion no encontrada');

      await updated.populate('usuario');
      await updated.populate('actividad');

      return updated;
    } catch (error) {
      console.error('Error al cancelar inscripcion:', error);
      throw new Error(`Error al cancelar inscripcion: ${error.message}`);
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
