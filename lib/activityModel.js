const Actividad = require('./models/Actividad');

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
      throw new Error(`Error al obtener actividades por área: ${error.message}`);
    }
  }

  static async obtenerPorEstado(estado) {
    try {
      return await Actividad.find({ estado }).populate('creadoPor');
    } catch (error) {
      throw new Error(`Error al obtener actividades por estado: ${error.message}`);
    }
  }
}

module.exports = ActividadModel;