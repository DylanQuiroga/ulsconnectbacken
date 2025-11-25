const express = require('express');
const path = require('path');
const router = express.Router();

const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const AttendanceModel = require(path.join(__dirname, '..', 'lib', 'AttendanceModel'));
const Attendance = require(path.join(__dirname, '..', 'lib', 'schema', 'Attendance'));

// POST /attendance/create
// Body: { actividadId: "..." }
router.post('/create', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const actividadId = req.body && (req.body.actividadId);
    if (!actividadId) return res.status(400).json({ success: false, message: 'actividadId requerido' });

    const sessionUser = req.session && req.session.user;
    const userId = sessionUser ? sessionUser.id : null;

    const created = await AttendanceModel.createAttendanceList(actividadId, userId);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('create attendance error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /attendance/take
// Body: { attendanceId: "...", presentes: [...], ausentes: [...], justificadas: [...] }
router.post('/take', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { attendanceId, presentes, ausentes, justificadas } = req.body;

    if (!attendanceId) return res.status(400).json({ success: false, message: 'attendanceId requerido' });

    const payload = {
      presentes: Array.isArray(presentes) ? presentes : [],
      ausentes: Array.isArray(ausentes) ? ausentes : [],
      justificadas: Array.isArray(justificadas) ? justificadas : []
    };

    const userId = req.session?.user?.id || null;

    const updated = await AttendanceModel.takeAttendance(attendanceId, payload, userId);

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('take attendance error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /attendance/update
// Body: { attendanceId: "...", updates: [ { usuario: id, asistencia: 'presente' }, ... ] }
router.post('/update', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const attendanceId = req.body && (req.body.attendanceId);
    const updates = Array.isArray(req.body.updates) ? req.body.updates : (req.body.updates ? JSON.parse(req.body.updates) : []);

    if (!attendanceId) return res.status(400).json({ success: false, message: 'attendanceId requerido' });
    if (!Array.isArray(updates)) return res.status(400).json({ success: false, message: 'updates debe ser un array' });

    const sessionUser = req.session && req.session.user;
    const userId = sessionUser ? sessionUser.id : null;

    const result = await AttendanceModel.updateAttendanceEntries(attendanceId, updates, userId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('update attendance entries error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /attendance/delete
// Params: { attendanceId, actividadId }
// Deletes the attendance list and creates a new one with the same actividadId
router.delete('/delete/:attendanceId/:actividadId', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { attendanceId, actividadId } = req.params;

    console.log('Delete attendance called with attendanceId:', attendanceId, 'and actividadId:', actividadId);

    if (!attendanceId) return res.status(400).json({ success: false, message: 'attendanceId requerido' });
    if (!actividadId) return res.status(400).json({ success: false, message: 'actividadId requerido' });

    // Get the attendance record to verify it belongs to the provided actividadId
    const attendance = await Attendance.findById(attendanceId);

    if (!attendance) return res.status(404).json({ success: false, message: 'Registro de asistencia no encontrado' });

    // Verify that the actividadId matches the attendance's actividadId
    if (attendance.actividad.toString() !== actividadId.toString()) {
      return res.status(403).json({ success: false, message: 'El id de actividad no coincide con el registro de asistencia' });
    }

    const sessionUser = req.session && req.session.user;
    const userId = sessionUser ? sessionUser.id : null;

    // Delete the attendance list
    await Attendance.findByIdAndDelete(attendanceId);

    // Create a new attendance list with the same actividadId
    const newAttendance = await AttendanceModel.createAttendanceList(actividadId, userId);

    return res.status(200).json({ success: true, message: 'Lista de asistencia eliminada y recreada', data: newAttendance });
  } catch (err) {
    console.error('delete attendance error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;