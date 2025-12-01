// Rutas de actividades: CRUD, busquedas y operaciones relacionadas
const express = require('express');
const path = require('path');
const router = express.Router();
const ActividadModel = require(path.join(__dirname, '..', 'lib', 'activityModel'));
const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const Inscripcion = require(path.join(__dirname, '..', 'lib', 'schema', 'Inscripcion'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const Attendance = require(path.join(__dirname, '..', 'lib', 'schema', 'Attendance'));
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));
const { sendActivityClosedNotification } = require(path.join(__dirname, '..', 'lib', 'emailService'));

// Escapa texto para construir regex seguras en filtros de busqueda
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Crea una nueva actividad (solo admin/staff)
router.post('/create', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    // Obtiene el id del usuario de la sesion y lo valida
    const sessionUserId = req.session?.user?.id || null;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, error: 'Sesion no valida' });
    }

    // Normaliza nombre de campo 'fechaFin' y ubicacion.lng si vienen con otros nombres
    const payload = {
      ...req.body,
      fechaFin: req.body.fechaFin || req.body.fechaTermino || req.body.fechaInicio,
      ubicacion: {
        ...(req.body.ubicacion || {}),
        lng: typeof (req.body.ubicacion && req.body.ubicacion.lng) === 'number' ? req.body.ubicacion.lng : 0
      },
      // Fuerza creadoPor desde la sesion (seguridad)
      creadoPor: sessionUserId
    };

    const actividad = await ActividadModel.crear(payload);
    res.status(201).json({ success: true, data: actividad });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Obtiene todas las actividades
router.get('/', ensureAuth, async (req, res) => {
  try {
    const actividades = await ActividadModel.obtenerTodas();
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Busca actividades por titulo y/o tipo
router.get('/search', ensureAuth, async (req, res) => {
  try {
    const { titulo, tipo } = req.query || {};
    const filtros = {};

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

// Obtiene actividades por area
router.get('/area/:area', ensureAuth, async (req, res) => {
  try {
    const actividades = await ActividadModel.obtenerPorArea(req.params.area);
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtiene actividades por estado
router.get('/estado/:estado', ensureAuth, async (req, res) => {
  try {
    const actividades = await ActividadModel.obtenerPorEstado(req.params.estado);
    res.status(200).json({ success: true, data: actividades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtiene actividad por ID
router.get('/:id', ensureAuth, async (req, res) => {
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

// Actualiza actividad (solo admin/staff)
router.put('/:id', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    // No permite que el cliente cambie creadoPor
    if (req.body && ('creadoPor' in req.body)) {
      delete req.body.creadoPor;
    }

    // Normaliza fechaFin si el frontend uso fechaTermino
    if (req.body) {
      req.body.fechaFin = req.body.fechaFin || req.body.fechaTermino || req.body.fechaInicio;
      if (req.body.ubicacion && typeof req.body.ubicacion.lng !== 'number') {
        req.body.ubicacion.lng = 0;
      }
    }

    const actividad = await ActividadModel.actualizar(req.params.id, req.body);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }
    res.status(200).json({ success: true, data: actividad });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Elimina actividad (solo admin/staff)
router.delete('/:id', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
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

// Cierra la convocatoria de una actividad (solo admin/staff)
router.post('/:id/close', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const motivoCierre = motivo || 'fecha_alcanzada';
    const idActividad = req.params.id;

    const actividad = await ActividadModel.obtenerPorId(req.params.id);
    if (!actividad) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }

    if (actividad.estado === 'closed') {
      return res.status(400).json({ success: false, error: 'La actividad ya esta cerrada' });
    }

    const actividadCerrada = await ActividadModel.cerrarConvocatoria(req.params.id, motivoCierre);

    const inscritosPendientes = await Inscripcion.find({
      actividad: idActividad,
      estado: 'activa'
    }).populate('usuario', 'correoUniversitario nombre');

    await Inscripcion.updateMany(
      { actividad: req.params.id, estado: 'activa' },
      { estado: 'terminada' }
    );

    const emailsEnviados = [];
    for (const inscrito of inscritosPendientes) {
      if (inscrito.usuario && inscrito.usuario.correoUniversitario) {
        await sendActivityClosedNotification(
          inscrito.usuario.correoUniversitario,
          inscrito.usuario.nombre,
          actividad.titulo,
          motivoCierre
        );
        emailsEnviados.push(inscrito.usuario.correoUniversitario);
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

// Calcula y aplica puntuaciones segun asistencia (solo admin/staff)
router.post('/:id/puntuar', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const actividadId = req.params.id;
    const sessionUserId = req.session?.user?.id || null;
    const reglas = (req.body && req.body.reglas) || {};

    const parseRule = (value, fallback) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

    const puntosPorEstado = {
      presente: parseRule(reglas.presente, 10),
      justificada: parseRule(reglas.justificada, 2),
      ausente: parseRule(reglas.ausente, -5)
    };

    const attendance = await Attendance.findOne({ actividad: actividadId }).lean();
    if (!attendance) {
      return res.status(404).json({ success: false, error: 'No hay registro de asistencia para esta actividad' });
    }

    const resultados = [];
    for (const entry of attendance.inscripciones || []) {
      const userId = entry && entry.usuario ? entry.usuario.toString() : null;
      if (!userId) continue;

      const estado = entry.asistencia || 'ausente';
      const delta = puntosPorEstado[estado];

      if (!Number.isFinite(delta) || delta === 0) {
        resultados.push({
          usuario: userId,
          asistencia: estado,
          puntosAplicados: 0,
          aplicado: false,
          motivo: 'Puntaje configurado en 0 o no numerico'
        });
        continue;
      }

      const result = await userModel.adjustScore(userId, delta, {
        motivo: `Asistencia en actividad ${actividadId}`,
        actividadId,
        registradoPor: sessionUserId,
        dedupeByActivity: true
      });

      resultados.push({
        usuario: userId,
        asistencia: estado,
        puntosAplicados: result.applied ? delta : 0,
        aplicado: Boolean(result.applied),
        encontrado: Boolean(result.user)
      });
    }

    const aplicados = resultados.filter((r) => r.aplicado).length;

    res.status(200).json({
      success: true,
      message: 'Puntuaciones calculadas desde asistencia',
      data: {
        reglas: puntosPorEstado,
        totalProcesados: resultados.length,
        totalAplicados: aplicados,
        resultados
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
