const express = require('express');
const path = require('path');
const router = express.Router();
const ActividadModel = require(path.join(__dirname, '..', 'lib', 'activityModel'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const Enrollment = require(path.join(__dirname, '..', 'lib', 'models/Enrollment'));
const { sendActivityClosedNotification } = require(path.join(__dirname, '..', 'lib', 'emailService'));

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

// Buscar actividades por título y/o tipo
router.get('/search', async (req, res) => {
  try {
    const { titulo, tipo } = req.query || {};
    const filtros = {};

    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (titulo) {
      filtros.titulo = { $regex: escapeRegex(titulo), $options: 'i' };
    }
    if (tipo) {
      filtros.tipo = { $regex: escapeRegex(tipo), $options: 'i' };
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

// ✅ CORREGIDO: ENROLL - Inscribirse en una actividad (requiere autenticación)
router.post('/:id/enroll', ensureAuth, async (req, res) => {
  try {
    // ✅ Obtener userId de la sesión (NO del body)
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || !sessionUser.id) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const idUsuario = sessionUser.id;
    const { respuestas } = req.body || {};

    console.log('📝 Inscripción recibida:', {
      activityId: req.params.id,
      userId: idUsuario,
      sessionData: sessionUser
    });

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
      return res.status(409).json({
        success: false,
        error: 'Ya estás inscrito en esta actividad',
        enrollment: yaInscrito
      });
    }

    // Crear inscripción
    const nuevaInscripcion = new Enrollment({
      idActividad: req.params.id,
      idUsuario: idUsuario,
      estado: 'inscrito',
      respuestas: respuestas || {}
    });

    await nuevaInscripcion.save();

    console.log('✅ Inscripción creada:', nuevaInscripcion);

    res.status(201).json({
      success: true,
      message: 'Inscripción realizada correctamente',
      data: nuevaInscripcion
    });
  } catch (error) {
    console.error('❌ Error en inscripción:', error);
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

// CASO DE USO 9: Cerrar convocatoria (solo admin/staff)
router.post('/:id/close', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const motivoCierre = motivo || 'fecha_alcanzada';

    const actividad = await ActividadModel.obtenerPorId(req.params.id);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }

    if (actividad.estado === 'closed') {
      return res.status(400).json({ success: false, error: 'La actividad ya está cerrada' });
    }

    const actividadCerrada = await ActividadModel.cerrarConvocatoria(req.params.id, motivoCierre);

    const inscritosPendientes = await Enrollment.find({
      idActividad: req.params.id,
      estado: { $ne: 'confirmado' }
    }).populate('idUsuario', 'correoUniversitario nombre');

    await Enrollment.updateMany(
      { idActividad: req.params.id, estado: 'inscrito' },
      { estado: 'pendiente_cierre' }
    );

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