const express = require('express');
const path = require('path');
const router = express.Router();

const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const AttendanceModel = require(path.join(__dirname, '..', 'lib', 'AttendanceModel'));

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

module.exports = router;