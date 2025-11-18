const express = require('express');
const path = require('path');
const router = express.Router();
const InscripcionModel = require(path.join(__dirname, '..', 'lib', 'inscripcionModel'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const { verificarToken } = require(path.join(__dirname, '..', 'middleware', 'auth'));

// Inscribirse en una actividad (cualquier usuario autenticado)
router.post('/:actividadId', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { actividadId } = req.params;
    
    const inscripcion = await InscripcionModel.crear(usuarioId, actividadId);
    res.status(201).json({ success: true, data: inscripcion });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Obtener inscripciones del usuario autenticado
router.get('/', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const inscripciones = await InscripcionModel.obtenerPorUsuario(usuarioId);
    res.status(200).json({ success: true, data: inscripciones });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener inscripciones activas del usuario
router.get('/activas', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const inscripciones = await InscripcionModel.obtenerActivas(usuarioId);
    res.status(200).json({ success: true, data: inscripciones });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener inscripciones de una actividad (solo admin/staff)
router.get('/actividad/:actividadId', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const inscripciones = await InscripcionModel.obtenerPorActividad(req.params.actividadId);
    res.status(200).json({ success: true, data: inscripciones });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener una inscripción por ID
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const inscripcion = await InscripcionModel.obtenerPorId(req.params.id);
    if (!inscripcion) {
      return res.status(404).json({ success: false, error: 'Inscripción no encontrada' });
    }
    res.status(200).json({ success: true, data: inscripcion });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancelar inscripción
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const { motivo } = req.body;
    const inscripcion = await InscripcionModel.cancelar(req.params.id, motivo);
    if (!inscripcion) {
      return res.status(404).json({ success: false, error: 'Inscripción no encontrada' });
    }
    res.status(200).json({ success: true, message: 'Inscripción cancelada correctamente', data: inscripcion });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;