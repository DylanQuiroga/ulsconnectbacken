const express = require('express');
const path = require('path');
const router = express.Router();
//const ActividadModel = require('../lib/activityModel');
const ActividadModel = require(path.join(__dirname, '..', 'lib', 'activityModel'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const Enrollment = require(path.join(__dirname, '..', 'models', 'Enrollment'));
const { sendActivityClosedNotification } = require(path.join(__dirname, '..', 'lib', 'emailService'));

// Crear una nueva actividad (solo admin/staff, pero sin requerir para testing)
router.post('/create', async (req, res) => {
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

// ENROLL: Inscribirse en una actividad (nueva inscripción)
router.post('/:id/enroll', async (req, res) => {
  try {
    const { idUsuario, respuestas } = req.body || {};

    if (!idUsuario) {
      return res.status(400).json({ success: false, error: 'ID de usuario requerido' });
    }

    // Obtener actividad
    const actividad = await ActividadModel.obtenerPorId(req.params.id);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }

    // VALIDAR: Si actividad está cerrada, rechazar inscripción
    if (actividad.estado === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'La convocatoria para esta actividad está cerrada',
        motivo: actividad.motivoCierre,
        fechaCierre: actividad.fechaCierre
      });
    }

    // Verificar si ya está inscrito
    const yaInscrito = await Enrollment.findOne({
      idActividad: req.params.id,
      idUsuario: idUsuario
    });

    if (yaInscrito) {
      return res.status(409).json({ success: false, error: 'Ya estás inscrito en esta actividad' });
    }

    // Crear inscripción
    const nuevaInscripcion = new Enrollment({
      idActividad: req.params.id,
      idUsuario: idUsuario,
      estado: 'inscrito',
      respuestas: respuestas || {}
    });

    await nuevaInscripcion.save();

    res.status(201).json({
      success: true,
      message: 'Inscripción realizada correctamente',
      data: nuevaInscripcion
    });
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

// CASO DE USO 9: Cerrar convocatoria y consolidar estados (solo coordinador/admin/staff)
router.post('/:id/close', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { motivo } = req.body || {}; // 'fecha_alcanzada' o 'cupo_completo'
    const motivoCierre = motivo || 'fecha_alcanzada';

    // Obtener actividad actual
    const actividad = await ActividadModel.obtenerPorId(req.params.id);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }

    // Si ya está cerrada, retornar error
    if (actividad.estado === 'closed') {
      return res.status(400).json({ success: false, error: 'La actividad ya está cerrada' });
    }

    // Cerrar convocatoria en BD
    const actividadCerrada = await ActividadModel.cerrarConvocatoria(req.params.id, motivoCierre);

    // Obtener todos los inscritos PENDIENTES (estado !== 'confirmado')
    const inscritosPendientes = await Enrollment.find({
      idActividad: req.params.id,
      estado: { $ne: 'confirmado' }
    }).populate('idUsuario', 'correoUniversitario nombre');

    // Consolidar estados: cambiar "inscrito" a "pendiente_cierre"
    await Enrollment.updateMany(
      { idActividad: req.params.id, estado: 'inscrito' },
      { estado: 'pendiente_cierre' }
    );

    // Enviar notificaciones a inscritos pendientes
    const emailsEnviados = [];
    for (const inscrito of inscritosPendientes) {
      if (inscrito.idUsuario && inscrito.idUsuario.correoUniversitario) {
        await sendActivityClosedNotification(
          inscrito.idUsuario.correoUniversitario,
          inscrito.idUsuario.nombre,
          actividad.titulo,
          motivoCierre
        );
        emailsEnviados.push(inscrito.idUsuario.correoUniversitario);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Convocatoria cerrada correctamente',
      data: {
        actividad: actividadCerrada,
        inscritosPendientesNotificados: inscritosPendientes.length,
        emailsEnviados: emailsEnviados,
        motivo: motivoCierre
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;