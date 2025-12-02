// Lógica para crear, tomar, actualizar y refrescar listas de asistencia
const Attendance = require('./schema/Attendance');
const Inscripcion = require('./schema/Inscripcion');

class AttendanceModel {
  static _validAsistencias() {
    return ['presente', 'ausente', 'justificada'];
  }

  // Crear un documento de asistencia para una actividad.
  // - actividadId: ObjectId/string
  // - sessionUserId: ObjectId/string (quién crea la lista)
  // La lista de inscripciones se obtiene de los documentos Inscripcion con estado 'activa'.
  static async createAttendanceList(actividadId, sessionUserId) {
    try {
      if (!actividadId) throw new Error('actividadId requerido');
      if (!sessionUserId) throw new Error('sessionUserId requerido');

      // Asegurarse de que no exista ya una lista de asistencia para esta actividad
      const existing = await Attendance.findOne({ actividad: actividadId });
      if (existing) { 
        return await Attendance.findById(existing._id)
          .populate('actividad')
          .populate('inscripciones.usuario')
          .populate('registradoPor'); 
      }

      const inscripciones = await Inscripcion.find({ actividad: actividadId, estado: 'activa' });

      const inscripcionesData = inscripciones.map(i => ({
        usuario: i.usuario,
        asistencia: 'ausente' // valor inicial por defecto (el schema también default a 'ausente')
      }));

      const attendance = new Attendance({
        actividad: actividadId,
        inscripciones: inscripcionesData,
        fecha: new Date(),
        registradoPor: sessionUserId
      });

      await attendance.save();

      return await Attendance.findById(attendance._id)
        .populate('actividad')
        .populate('inscripciones.usuario')
        .populate('registradoPor');
    } catch (error) {
      throw new Error(`Error creando lista de asistencia: ${error.message}`);
    }
  }

  // takeAttendance: marcar presentes/ausentes/justificados en un registro de asistencia existente.
  // - attendanceId: id del documento de asistencia
  // - payload: { presentes: [userId], ausentes: [userId], justificadas: [userId] }
  // - sessionUserId: quién toma la asistencia
  static async takeAttendance(attendanceId, payload = {}, sessionUserId) {
    try {
      if (!attendanceId) throw new Error('attendanceId requerido');
      if (!sessionUserId) throw new Error('sessionUserId requerido');

      const attendance = await Attendance.findById(attendanceId).catch(() => null);
      
      if (!attendance) throw new Error('Registro de asistencia no encontrado');

      const { presentes = [], ausentes = [], justificadas = [] } = payload || {};

      // Construir un mapa userId -> asistencia
      const map = Object.create(null);
      (presentes || []).forEach(id => { if (id) map[id.toString()] = 'presente'; });
      (ausentes || []).forEach(id => { if (id) map[id.toString()] = 'ausente'; });
      (justificadas || []).forEach(id => { if (id) map[id.toString()] = 'justificada'; });

      const valid = AttendanceModel._validAsistencias();

      // Marcar todas las entradas como 'ausente' por defecto y luego aplicar el mapa
      attendance.inscripciones.forEach(entry => {
        const uid = entry.usuario ? entry.usuario.toString() : '';
        entry.asistencia = 'ausente';
        if (map[uid] && valid.includes(map[uid])) {
          entry.asistencia = map[uid];
        }
      });

      attendance.fecha = new Date();
      attendance.registradoPor = sessionUserId;

      await attendance.save();

      return await Attendance.findById(attendance._id)
        .populate('actividad')
        .populate('inscripciones.usuario')
        .populate('registradoPor');
    } catch (error) {
      throw new Error(`Error tomando asistencia: ${error.message}`);
    }
  }

  // updateAttendanceEntries: actualizar la asistencia de usuarios específicos en un registro dado.
  // - attendanceId: id del documento de asistencia
  // - updates: [{ usuario: userId, asistencia: 'presente'|'ausente'|'justificada' }, ...]
  // - sessionUserId: quién actualiza
  // Retorna el documento actualizado y un array de usuarios no encontrados (skipped)
  static async updateAttendanceEntries(attendanceId, updates = [], sessionUserId) {
    try {
      if (!attendanceId) throw new Error('attendanceId requerido');
      if (!Array.isArray(updates)) throw new Error('updates debe ser un array');

      if (!sessionUserId) throw new Error('sessionUserId requerido');

      const attendance = await Attendance.findById(attendanceId);
      if (!attendance) throw new Error('Registro de asistencia no encontrado');

      const valid = AttendanceModel._validAsistencias();
      const skipped = [];

      const updateMap = new Map();
      updates.forEach(u => {
        if (!u || !u.usuario) return;
        const asis = u.asistencia || 'presente';
        if (!valid.includes(asis)) return;
        updateMap.set(u.usuario.toString(), asis);
      });

      attendance.inscripciones.forEach(entry => {
        const uid = entry.usuario ? entry.usuario.toString() : '';
        if (updateMap.has(uid)) {
          entry.asistencia = updateMap.get(uid);
        }
      });

      // Determinar ids omitidos (presentes en updateMap pero no en inscripciones)
      for (const key of updateMap.keys()) {
        const found = attendance.inscripciones.some(e => (e.usuario && e.usuario.toString()) === key);
        if (!found) skipped.push(key);
      }

      attendance.fecha = new Date();
      attendance.registradoPor = sessionUserId;

      await attendance.save();

      const populated = await Attendance.findById(attendance._id)
        .populate('actividad')
        .populate('inscripciones.usuario')
        .populate('registradoPor');

      return { attendance: populated, skipped };
    } catch (error) {
      throw new Error(`Error actualizando entradas de asistencia: ${error.message}`);
    }
  }

  // refreshAttendanceList: refrescar la lista de inscripciones obteniendo las inscripciones activas
  // - attendanceId: id del documento de asistencia
  // - sessionUserId: quién refresca la lista
  static async refreshAttendanceList(attendanceId, sessionUserId) {
    try {
      if (!attendanceId) throw new Error('attendanceId requerido');

      if (!sessionUserId) throw new Error('sessionUserId requerido');

      const attendance = await Attendance.findById(attendanceId);
      if (!attendance) throw new Error('Registro de asistencia no encontrado');

      const actividadId = attendance.actividad;

      // Obtener todas las inscripciones activas de la actividad
      const inscripciones = await Inscripcion.find({ actividad: actividadId, estado: 'activa' });

      // Crear nuevas inscripciones con asistencia por defecto
      const inscripcionesData = inscripciones.map(i => ({
        usuario: i.usuario,
        asistencia: 'ausente'
      }));

      // Actualizar la lista de asistencia
      attendance.inscripciones = inscripcionesData;
      attendance.fecha = new Date();
      attendance.registradoPor = sessionUserId;

      await attendance.save();

      return await Attendance.findById(attendance._id)
        .populate('actividad')
        .populate('inscripciones.usuario')
        .populate('registradoPor');
    } catch (error) {
      throw new Error(`Error refrescando lista de asistencia: ${error.message}`);
    }
  }
}

module.exports = AttendanceModel;
