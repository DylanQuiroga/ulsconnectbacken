const Attendance = require('./schema/Attendance');
const Inscripcion = require('./schema/Inscripcion');

class AttendanceModel {
  static _validAsistencias() {
    return ['presente', 'ausente', 'justificada'];
  }

  // Create an attendance document for an activity.
  // - actividadId: ObjectId/string
  // - sessionUserId: ObjectId/string (who creates the list)
  // The inscripciones list is taken from Inscripcion documents with estado 'activa'.
  static async createAttendanceList(actividadId, sessionUserId) {
    try {
      if (!actividadId) throw new Error('actividadId requerido');
      if (!sessionUserId) throw new Error('sessionUserId requerido');

      const inscripciones = await Inscripcion.find({ actividad: actividadId, estado: 'activa' });

      const inscripcionesData = inscripciones.map(i => ({
        usuario: i.usuario,
        asistencia: 'ausente' // default initial value (schema also defaults to 'ausente')
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

  // takeAttendance: mark presentes/ausentes/justificados in an existing attendance record.
  // - attendanceId: id of attendance document
  // - payload: { presentes: [userId], ausentes: [userId], justificadas: [userId] }
  // - sessionUserId: who takes the attendance
  static async takeAttendance(attendanceId, payload = {}, sessionUserId) {
    try {
      if (!attendanceId) throw new Error('attendanceId requerido');
      if (!sessionUserId) throw new Error('sessionUserId requerido');

      const attendance = await Attendance.findById(attendanceId);
      
      if (!attendance) throw new Error('Registro de asistencia no encontrado');

      const { presentes = [], ausentes = [], justificadas = [] } = payload || {};

      // Build map of userId -> asistencia
      const map = Object.create(null);
      (presentes || []).forEach(id => { if (id) map[id.toString()] = 'presente'; });
      (ausentes || []).forEach(id => { if (id) map[id.toString()] = 'ausente'; });
      (justificadas || []).forEach(id => { if (id) map[id.toString()] = 'justificada'; });

      const valid = AttendanceModel._validAsistencias();

      // Default all entries to 'ausente' to ensure explicit marking, then apply map
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

  // updateAttendanceEntries: update specific users' asistencia in a given attendance record.
  // - attendanceId: id of attendance document
  // - updates: [{ usuario: userId, asistencia: 'presente'|'ausente'|'justificada' }, ...]
  // - sessionUserId: who updates
  // Returns updated document and array of skipped (not found) userIds
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

      // Determine skipped ids (those present in updateMap but not found in inscripciones)
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

  // refreshAttendanceList: refresh the inscripciones list by fetching active enrollments for the activity
  // - attendanceId: id of attendance document
  // - sessionUserId: who refreshes the attendance
  static async refreshAttendanceList(attendanceId, sessionUserId) {
    try {
      if (!attendanceId) throw new Error('attendanceId requerido');

      if (!sessionUserId) throw new Error('sessionUserId requerido');

      const attendance = await Attendance.findById(attendanceId);
      if (!attendance) throw new Error('Registro de asistencia no encontrado');

      const actividadId = attendance.actividad;

      // Fetch all active enrollments for the activity
      const inscripciones = await Inscripcion.find({ actividad: actividadId, estado: 'activa' });

      // Create new inscripciones data with default asistencia
      const inscripcionesData = inscripciones.map(i => ({
        usuario: i.usuario,
        asistencia: 'ausente' // default initial value
      }));

      // Update the attendance list
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
