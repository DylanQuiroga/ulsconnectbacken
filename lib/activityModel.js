// Operaciones de negocio para actividades (CRUD, busquedas y cierre de convocatoria)
const Actividad = require('./schema/Actividad');

class ActividadModel {
  static async crear(datosActividad) {
    try {
      const actividad = new Actividad(datosActividad);
      return await actividad.save();
    } catch (error) {
      throw new Error(`Error al crear actividad: ${error.message}`);
    }
  }

  static async obtenerPorId(id) {
    try {
      return await Actividad.findById(id).populate('creadoPor');
    } catch (error) {
      throw new Error(`Error al obtener actividad: ${error.message}`);
    }
  }

  static async obtenerTodas(filtros = {}) {
    try {
      return await Actividad.find(filtros).populate('creadoPor');
    } catch (error) {
      throw new Error(`Error al obtener actividades: ${error.message}`);
    }
  }

  static async actualizar(id, datosActualizados) {
    try {
      return await Actividad.findByIdAndUpdate(id, datosActualizados, { new: true }).populate('creadoPor');
    } catch (error) {
      throw new Error(`Error al actualizar actividad: ${error.message}`);
    }
  }

  static async eliminar(id) {
    try {
      return await Actividad.findByIdAndDelete(id);
    } catch (error) {
      throw new Error(`Error al eliminar actividad: ${error.message}`);
    }
  }

  static async obtenerPorArea(area) {
    try {
      return await Actividad.find({ area }).populate('creadoPor');
    } catch (error) {
      throw new Error(`Error al obtener actividades por area: ${error.message}`);
    }
  }

  static async obtenerPorEstado(estado) {
    try {
      return await Actividad.find({ estado }).populate('creadoPor');
    } catch (error) {
      throw new Error(`Error al obtener actividades por estado: ${error.message}`);
    }
  }

  // Cerrar convocatoria (Caso de Uso 9)
  static async cerrarConvocatoria(id, motivo = 'fecha_alcanzada') {
    try {
      const actividad = await Actividad.findByIdAndUpdate(
        id,
        {
          estado: 'closed',
          fechaCierre: new Date(),
          motivoCierre: motivo
        },
        { new: true }
      ).populate('creadoPor');
      return actividad;
    } catch (error) {
      throw new Error(`Error al cerrar convocatoria: ${error.message}`);
    }
  }

  // Verificar si convocatoria esta activa
  static async estaActiva(id) {
    try {
      const actividad = await Actividad.findById(id);
      return actividad && actividad.estado !== 'closed';
    } catch (error) {
      throw new Error(`Error al verificar estado: ${error.message}`);
    }
  }
}

module.exports = ActividadModel;
