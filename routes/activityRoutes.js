const express = require('express');
const path = require('path');
const router = express.Router();
//const ActividadModel = require('../lib/activityModel');
const ActividadModel = require(path.join(__dirname, '..', 'lib', 'activityModel'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));

// Crear una nueva actividad (solo admin/staff)
router.post('/create', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const actividad = await ActividadModel.crear(req.body);
    res.status(201).json({ success: true, data: actividad });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Obtener todas las actividades
router.get('/', async (req, res) => {
  try {
    const actividades = await ActividadModel.obtenerTodas();
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar actividades por título y/o tipo (query params: titulo, tipo)
router.get('/search', async (req, res) => {
  try {
    const { titulo, tipo } = req.query || {};
    const filtros = {};

    // Helper para escapar caracteres especiales en RegExp
    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (titulo) {
      filtros.titulo = { $regex: escapeRegex(titulo), $options: 'i' }; // partial, case-insensitive
    }
    if (tipo) {
      filtros.tipo = { $regex: escapeRegex(tipo), $options: 'i' }; // allow partial match on tipo as well
    }

    const actividades = await ActividadModel.obtenerTodas(filtros);
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener actividad por ID
router.get('/:id', async (req, res) => {
  try {
    const actividad = await ActividadModel.obtenerPorId(req.params.id);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }
    res.status(200).json({ success: true, data: actividad });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener actividades por área
router.get('/area/:area', async (req, res) => {
  try {
    const actividades = await ActividadModel.obtenerPorArea(req.params.area);
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener actividades por estado
router.get('/estado/:estado', async (req, res) => {
  try {
    const actividades = await ActividadModel.obtenerPorEstado(req.params.estado);
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar actividad (solo admin/staff)
router.put('/:id', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const actividad = await ActividadModel.actualizar(req.params.id, req.body);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }
    res.status(200).json({ success: true, data: actividad });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar actividad (solo admin/staff)
router.delete('/:id', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const actividad = await ActividadModel.eliminar(req.params.id);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }
    res.status(200).json({ success: true, message: 'Actividad eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;