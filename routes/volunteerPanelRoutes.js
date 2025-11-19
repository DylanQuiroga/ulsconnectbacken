const express = require('express');
const path = require('path');
const router = express.Router();

const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const Enrollment = require(path.join(__dirname, '..', 'lib', 'models', 'Enrollment'));

/**
 * Normaliza fechas para evitar exponer objetos Date directos en la respuesta.
 */
function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Determina si una actividad es proxima u ocurre actualmente.
 */
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
    const enrollments = await Enrollment.find({ idUsuario: userId })
      .populate({
        path: 'idActividad',
        select: 'titulo tipo area fechaInicio fechaFin estado ubicacion'
      })
      .lean();

    const detailedEnrollments = enrollments.map((enrollment) => {
      const actividad = enrollment.idActividad || null;
      const attendances = Array.isArray(enrollment.registrosAsistencia) ? enrollment.registrosAsistencia : [];
      const sortedAttendances = attendances
        .map((registro) => ({
          date: formatDate(registro.fecha),
          metodo: registro.metodo || '',
          registradoPor: registro.registradoPor ? registro.registradoPor.toString() : null
        }))
        .sort((a, b) => {
          const aDate = a.date ? new Date(a.date) : new Date(0);
          const bDate = b.date ? new Date(b.date) : new Date(0);
          return aDate - bDate;
        });

      const lastAttendance = sortedAttendances.length ? sortedAttendances[sortedAttendances.length - 1].date : null;

      return {
        enrollmentId: enrollment._id ? enrollment._id.toString() : null,
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
        enrollmentStatus: enrollment.estado,
        attendanceCount: sortedAttendances.length,
        lastAttendanceAt: lastAttendance,
        attendances: sortedAttendances
      };
    });

    const now = new Date();
    const upcoming = detailedEnrollments
      .filter((enrollmentDetail) => isUpcomingActivity(enrollmentDetail, now))
      .sort((a, b) => {
        const aDate = a.startDate || a.endDate;
        const bDate = b.startDate || b.endDate;
        const aComparable = aDate ? new Date(aDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bComparable = bDate ? new Date(bDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aComparable - bComparable;
      });

    const summary = {
      totalEnrollments: detailedEnrollments.length,
      upcomingEnrollments: upcoming.length,
      totalAttendances: detailedEnrollments.reduce((total, enrollmentDetail) => total + enrollmentDetail.attendanceCount, 0)
    };

    res.json({
      success: true,
      panel: {
        summary,
        upcoming,
        enrollments: detailedEnrollments
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

module.exports = router;
