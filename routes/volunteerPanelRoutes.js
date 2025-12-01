// Rutas del panel de voluntario (resumen de inscripciones y puntaje)
const express = require('express');
const path = require('path');
const router = express.Router();

const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const Inscripcion = require(path.join(__dirname, '..', 'lib', 'schema', 'Inscripcion'));
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));

// Normaliza fechas para evitar exponer objetos Date directos en la respuesta
function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Determina si una actividad es proxima u ocurre actualmente
function isUpcomingActivity(enrollmentDetail, now) {
  const start = enrollmentDetail.startDate ? new Date(enrollmentDetail.startDate) : null;
  const end = enrollmentDetail.endDate ? new Date(enrollmentDetail.endDate) : null;

  if (start && start >= now) return true;
  if (start && end && start <= now && end >= now) return true;
  if (!start && end && end >= now) return true;
  return false;
}

router.get('/panel', ensureAuth, async (req, res) => {
  try {
    const sessionUser = req.session && req.session.user ? req.session.user : null;
    if (!sessionUser || !sessionUser.id) {
      return res.status(401).json({ success: false, message: 'Sesion no disponible' });
    }

    const userId = sessionUser.id;
    const inscripciones = await Inscripcion.find({ usuario: userId })
      .populate({
        path: 'actividad',
        select: 'titulo tipo area fechaInicio fechaFin estado ubicacion'
      })
      .lean();

    const detailedInscripciones = inscripciones.map((inscripcion) => {
      const actividad = inscripcion.actividad || null;

      return {
        inscripcionId: inscripcion._id ? inscripcion._id.toString() : null,
        activityId: actividad && actividad._id ? actividad._id.toString() : null,
        activityTitle: actividad ? actividad.titulo : 'Actividad no disponible',
        activityType: actividad ? actividad.tipo : null,
        area: actividad ? actividad.area : null,
        location: actividad && actividad.ubicacion ? {
          nombreComuna: actividad.ubicacion.nombreComuna,
          nombreLugar: actividad.ubicacion.nombreLugar,
          lng: actividad.ubicacion.lng
        } : null,
        startDate: actividad ? formatDate(actividad.fechaInicio) : null,
        endDate: actividad ? formatDate(actividad.fechaFin) : null,
        activityStatus: actividad ? actividad.estado : null,
        inscripcionStatus: inscripcion.estado
      };
    });

    const now = new Date();
    const upcoming = detailedInscripciones
      .filter((inscripcionDetail) => isUpcomingActivity(inscripcionDetail, now))
      .sort((a, b) => {
        const aDate = a.startDate || a.endDate;
        const bDate = b.startDate || b.endDate;
        const aComparable = aDate ? new Date(aDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bComparable = bDate ? new Date(bDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aComparable - bComparable;
      });

    const summary = {
      totalInscripciones: detailedInscripciones.length,
      upcomingInscripciones: upcoming.length
    };

    res.json({
      success: true,
      panel: {
        summary,
        upcoming,
        inscripciones: detailedInscripciones
      }
    });
  } catch (error) {
    console.error('Error al cargar el panel del voluntario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cargar el panel del voluntario',
      error: error.message
    });
  }
});

// Obtener puntaje e historial del voluntario autenticado
router.get('/score', ensureAuth, async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Sesion no disponible' });
    }

    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const score = await userModel.getScore(userId, limit);

    if (!score) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.json({ success: true, data: score });
  } catch (error) {
    console.error('Error al obtener puntaje del voluntario:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible obtener la puntuacion',
      error: error.message
    });
  }
});

module.exports = router;
