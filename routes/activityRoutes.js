const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { body, param, validationResult } = require('express-validator');

const Activity = require('../models/Activity');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const ensureAuth = require('../middleware/ensureAuth');
const ensureRole = require('../middleware/ensureRole');

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// List activities
router.get('/', async (req, res) => {
  try {
    const activities = await Activity.find().sort({ fechaInicio: 1 }).lean();
    res.json(activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching activities' });
  }
});

// Create activity (admin|staff)
router.post('/', ensureRole(['admin', 'staff']), [
  body('titulo').isString().trim().isLength({ min: 3 }).withMessage('Titulo requerido'),
  body('fechaInicio').optional().isISO8601().toDate(),
  body('fechaFin').optional().isISO8601().toDate()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const payload = req.body || {};
    const activity = new Activity({
      titulo: payload.titulo,
      descripcion: payload.descripcion,
      area: payload.area,
      tipo: payload.tipo,
      fechaInicio: payload.fechaInicio,
      fechaFin: payload.fechaFin,
      ubicacion: payload.ubicacion,
      capacidad: payload.capacidad || null,
      estado: payload.estado || 'draft',
      creadoPor: payload.creadoPor || null
    });
    await activity.save();
    res.status(201).json(activity);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Could not create activity', error: err.message });
  }
});

// Get single activity
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const activity = await Activity.findById(id).lean();
    if (!activity) return res.status(404).json({ message: 'Not found' });
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching activity' });
  }
});

// Update activity (admin|staff)
router.put('/:id', ensureRole(['admin', 'staff']), [
  param('id').custom(isValidId).withMessage('Invalid id'),
  body('fechaInicio').optional().isISO8601().toDate(),
  body('fechaFin').optional().isISO8601().toDate()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const id = req.params.id;
  if (!isValidId(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const update = req.body || {};
    const activity = await Activity.findByIdAndUpdate(id, update, { new: true });
    if (!activity) return res.status(404).json({ message: 'Not found' });
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Could not update activity', error: err.message });
  }
});

// Delete activity (admin|staff)
router.delete('/:id', ensureRole(['admin', 'staff']), async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const activity = await Activity.findByIdAndDelete(id);
    if (!activity) return res.status(404).json({ message: 'Not found' });
    // Optionally remove enrollments and attendance
    await Enrollment.deleteMany({ idActividad: id });
    await Attendance.deleteMany({ idActividad: id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not delete activity' });
  }
});

// Enroll user in activity (estudiante only)
router.post('/:id/enroll', ensureRole(['estudiante']), [
  param('id').custom(isValidId).withMessage('Invalid activity id'),
  body('idUsuario').custom(isValidId).withMessage('Invalid user id')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const id = req.params.id;
  const { idUsuario, respuestas } = req.body || {};
  try {
    const enrollment = new Enrollment({ idActividad: id, idUsuario, respuestas: respuestas || {} });
    await enrollment.save();
    res.status(201).json(enrollment);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return res.status(409).json({ message: 'Already enrolled' });
    res.status(400).json({ message: 'Could not enroll', error: err.message });
  }
});

// Unenroll / cancel (estudiante only)
router.post('/:id/unenroll', ensureRole(['estudiante']), [
  param('id').custom(isValidId).withMessage('Invalid activity id'),
  body('idUsuario').custom(isValidId).withMessage('Invalid user id')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const id = req.params.id;
  const { idUsuario } = req.body || {};
  try {
    const enrollment = await Enrollment.findOneAndUpdate({ idActividad: id, idUsuario }, { estado: 'cancelado' }, { new: true });
    if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
    res.json(enrollment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not unenroll' });
  }
});

// List enrollments for an activity
router.get('/:id/enrollments', async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const enrollments = await Enrollment.find({ idActividad: id }).populate('idUsuario', 'nombre correoUniversitario').lean();
    res.json(enrollments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching enrollments' });
  }
});

// Record attendance (admin|staff can record for anyone; estudiante only for themselves)
router.post('/:id/attendance', ensureAuth, [
  param('id').custom(isValidId).withMessage('Invalid activity id'),
  body('idUsuario').custom(isValidId).withMessage('Invalid user id'),
  body('fecha').optional().isISO8601().toDate()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const id = req.params.id;
  const { idUsuario, fecha, metodo, registradoPor, evento } = req.body || {};
  try {
    // Authorization: estudiantes can only record attendance for themselves
    const sessionUser = req.session && req.session.user;
    if (sessionUser && sessionUser.role === 'estudiante' && sessionUser.id !== idUsuario) {
      return res.status(403).json({ message: 'Estudiantes sólo pueden registrar su propia asistencia' });
    }
    const fechaObj = fecha ? new Date(fecha) : new Date();
    // push to enrollment registrosAsistencia
    const enrollment = await Enrollment.findOneAndUpdate(
      { idActividad: id, idUsuario },
      { $push: { registrosAsistencia: { fecha: fechaObj, metodo: metodo || '', registradoPor: registradoPor || null } } },
      { new: true }
    );

    // create standalone attendance record
    const attendance = new Attendance({ idActividad: id, idUsuario, evento: evento || '', fecha: fechaObj, registradoPor: registradoPor || null });
    await attendance.save();

    res.status(201).json({ enrollment, attendance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not record attendance' });
  }
});

// List attendance for activity
router.get('/:id/attendance', async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const records = await Attendance.find({ idActividad: id }).populate('idUsuario', 'nombre correoUniversitario').lean();
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching attendance' });
  }
});

module.exports = router;
