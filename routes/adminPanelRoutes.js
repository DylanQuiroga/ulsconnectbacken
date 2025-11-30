const express = require('express');
const path = require('path');
const router = express.Router();

const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const Actividad = require(path.join(__dirname, '..', 'lib', 'schema', 'Actividad'));
const Inscripcion = require(path.join(__dirname, '..', 'lib', 'schema', 'Inscripcion'));
const Attendance = require(path.join(__dirname, '..', 'lib', 'schema', 'Attendance'));
const ReporteImpacto = require(path.join(__dirname, '..', 'lib', 'schema', 'ReporteImpacto'));
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function bucketLabel(bucket) {
  if (!bucket || typeof bucket.year !== 'number' || typeof bucket.month !== 'number') return 'N/A';
  const month = bucket.month < 10 ? `0${bucket.month}` : bucket.month;
  return `${bucket.year}-${month}`;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\r?\n/g, ' ').trim();
  if (str.includes('"') || str.includes(',') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(rows, columns) {
  if (!Array.isArray(rows) || !rows.length) {
    return columns.map(col => escapeCsv(col.header)).join(',');
  }
  const header = columns.map(col => escapeCsv(col.header)).join(',');
  const lines = rows.map(row => columns.map(col => escapeCsv(col.accessor(row))).join(','));
  return [header, ...lines].join('\n');
}

function parseBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'yes', 'y', 't'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'f'].includes(normalized)) return false;
  return null;
}

function formatUser(user) {
  if (!user) return null;
  const id = user._id ? user._id.toString() : null;
  return {
    _id: id,  // ← Agregar _id
    id: id,   // ← Mantener id para compatibilidad
    nombre: user.nombre,
    correoUniversitario: user.correoUniversitario,
    telefono: user.telefono || null,
    carrera: user.carrera || '',
    intereses: Array.isArray(user.intereses) ? user.intereses : [],
    comuna: user.comuna || '',
    direccion: user.direccion || '',
    edad: user.edad || null,
    status: user.status || '',
    rol: user.rol || user.role || null,
    bloqueado: Boolean(user.bloqueado),
    creadoEn: formatDate(user.creadoEn),
    actualizadoEn: formatDate(user.actualizadoEn)
  };
}

function calculateTotalHours(actividad, attendedCount) {
  if (!actividad || !actividad.fechaInicio || !actividad.fechaFin) return 0;
  const start = new Date(actividad.fechaInicio);
  const end = new Date(actividad.fechaFin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || attendedCount <= 0) return 0;
  const durationHours = (end - start) / (1000 * 60 * 60);
  return Number((durationHours * attendedCount).toFixed(2));
}

async function computeImpactMetrics(actividadId, actividadDoc = null) {
  const [totalInscripciones, inscripcionesActivas, registrosAsistencia] = await Promise.all([
    Inscripcion.countDocuments({ actividad: actividadId }),
    Inscripcion.countDocuments({ actividad: actividadId, estado: 'activa' }),
    Attendance.find({ actividad: actividadId }).select('inscripciones').lean()
  ]);

  const asistentesSet = new Set();
  registrosAsistencia.forEach((reg) => {
    if (Array.isArray(reg.inscripciones)) {
      reg.inscripciones.forEach((ins) => {
        if (ins.usuario && ins.asistencia === 'presente') {
          asistentesSet.add(ins.usuario.toString());
        }
      });
    }
  });

  const voluntariosAsistieron = asistentesSet.size;
  const horasTotales = calculateTotalHours(actividadDoc, voluntariosAsistieron);

  return {
    voluntariosInvitados: totalInscripciones,
    voluntariosConfirmados: inscripcionesActivas,
    voluntariosAsistieron,
    horasTotales
  };
}

router.get('/panel', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const now = new Date();

    const [
      areaMetrics,
      typeMetrics,
      monthMetrics,
      totalActivities,
      activeActivities,
      upcomingActivities,
      enrollmentByStatus,
      topEnrollmentActivities,
      latestEnrollments,
      enrollmentTotal,
      attendanceTotal,
      attendanceTopActivities,
      recentAttendance,
      impactReports
    ] = await Promise.all([
      Actividad.aggregate([
        {
          $group: {
            _id: '$area',
            total: { $sum: 1 },
            activas: {
              $sum: {
                $cond: [{ $ne: ['$estado', 'closed'] }, 1, 0]
              }
            }
          }
        },
        { $sort: { total: -1 } }
      ]),
      Actividad.aggregate([
        {
          $group: {
            _id: '$tipo',
            total: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]),
      Actividad.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$fechaInicio' },
              month: { $month: '$fechaInicio' }
            },
            total: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]),
      Actividad.countDocuments({}),
      Actividad.countDocuments({ estado: { $ne: 'closed' } }),
      Actividad.countDocuments({ fechaInicio: { $gte: now } }),
      Inscripcion.aggregate([
        {
          $group: {
            _id: '$estado',
            total: { $sum: 1 }
          }
        }
      ]),
      Inscripcion.aggregate([
        {
          $group: {
            _id: '$actividad',
            total: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'actividades',
            localField: '_id',
            foreignField: '_id',
            as: 'actividad'
          }
        },
        { $unwind: { path: '$actividad', preserveNullAndEmptyArrays: true } }
      ]),
      Inscripcion.find({})
        .sort({ creadoEn: -1 })
        .limit(10)
        .populate('actividad', 'titulo area tipo fechaInicio fechaFin estado')
        .populate('usuario', 'nombre correoUniversitario rol')
        .lean(),
      Inscripcion.countDocuments({}),
      Attendance.countDocuments({}),
      Attendance.aggregate([
        {
          $group: {
            _id: '$actividad',
            total: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'actividades',
            localField: '_id',
            foreignField: '_id',
            as: 'actividad'
          }
        },
        { $unwind: { path: '$actividad', preserveNullAndEmptyArrays: true } }
      ]),
      Attendance.find({})
        .sort({ fecha: -1 })
        .limit(20)
        .populate('actividad', 'titulo area tipo')
        .populate('inscripciones.usuario', 'nombre correoUniversitario')
        .populate('registradoPor', 'nombre correoUniversitario')
        .lean(),
      ReporteImpacto.find({})
        .sort({ creadoEn: -1 })
        .limit(20)
        .populate('idActividad', 'titulo area tipo fechaInicio fechaFin estado')
        .populate('creadoPor', 'nombre correoUniversitario rol')
        .lean()
    ]);

    const metrics = {
      byArea: areaMetrics.map((item) => ({
        area: item._id || 'Sin area',
        total: item.total,
        activas: item.activas
      })),
      byType: typeMetrics.map((item) => ({
        tipo: item._id || 'Sin tipo',
        total: item.total
      })),
      byMonth: monthMetrics.map((item) => ({
        bucket: bucketLabel(item._id),
        total: item.total
      }))
    };

    const enrollmentSummary = {
      total: enrollmentTotal,
      byStatus: {},
      topActivities: topEnrollmentActivities.map((item) => ({
        activityId: item._id ? String(item._id) : null,
        activityTitle: item.actividad ? item.actividad.titulo : 'Actividad no disponible',
        area: item.actividad ? item.actividad.area : null,
        tipo: item.actividad ? item.actividad.tipo : null,
        estado: item.actividad ? item.actividad.estado : null,
        total: item.total
      })),
      latest: latestEnrollments.map((inscripcion) => ({
        enrollmentId: inscripcion._id ? inscripcion._id.toString() : null,
        status: inscripcion.estado,
        createdAt: formatDate(inscripcion.creadoEn),
        activityId: inscripcion.actividad && inscripcion.actividad._id ? inscripcion.actividad._id.toString() : null,
        activityTitle: inscripcion.actividad ? inscripcion.actividad.titulo : 'Actividad no disponible',
        activityStartDate: inscripcion.actividad ? formatDate(inscripcion.actividad.fechaInicio) : null,
        area: inscripcion.actividad ? inscripcion.actividad.area : null,
        tipo: inscripcion.actividad ? inscripcion.actividad.tipo : null,
        userId: inscripcion.usuario && inscripcion.usuario._id ? inscripcion.usuario._id.toString() : null,
        userName: inscripcion.usuario ? inscripcion.usuario.nombre : 'Usuario no disponible',
        userEmail: inscripcion.usuario ? inscripcion.usuario.correoUniversitario : null,
        userRole: inscripcion.usuario ? (inscripcion.usuario.rol || null) : null
      }))
    };

    enrollmentByStatus.forEach((item) => {
      enrollmentSummary.byStatus[item._id || 'sin_estado'] = item.total;
    });

    const attendanceSummary = {
      total: attendanceTotal,
      topActivities: attendanceTopActivities.map((item) => ({
        activityId: item._id ? item._id.toString() : null,
        activityTitle: item.actividad ? item.actividad.titulo : 'Actividad no disponible',
        area: item.actividad ? item.actividad.area : null,
        tipo: item.actividad ? item.actividad.tipo : null,
        total: item.total
      })),
      recent: recentAttendance.map((attendance) => ({
        attendanceId: attendance._id ? attendance._id.toString() : null,
        activityId: attendance.actividad && attendance.actividad._id ? attendance.actividad._id.toString() : null,
        activityTitle: attendance.actividad ? attendance.actividad.titulo : 'Actividad no disponible',
        area: attendance.actividad ? attendance.actividad.area : null,
        tipo: attendance.actividad ? attendance.actividad.tipo : null,
        inscripciones: Array.isArray(attendance.inscripciones) ? attendance.inscripciones.map((ins) => ({
          usuarioId: ins.usuario && ins.usuario._id ? ins.usuario._id.toString() : null,
          usuarioNombre: ins.usuario ? ins.usuario.nombre : 'Usuario no disponible',
          usuarioEmail: ins.usuario ? ins.usuario.correoUniversitario : null,
          asistencia: ins.asistencia || 'ausente'
        })) : [],
        recordedAt: formatDate(attendance.fecha),
        recordedBy: attendance.registradoPor && attendance.registradoPor._id ? attendance.registradoPor._id.toString() : null,
        recordedByName: attendance.registradoPor ? attendance.registradoPor.nombre : null,
        recordedByEmail: attendance.registradoPor ? attendance.registradoPor.correoUniversitario : null
      }))
    };

    const impactReportsFormatted = impactReports.map((report) => ({
      reportId: report._id ? report._id.toString() : null,
      activityId: report.idActividad && report.idActividad._id ? report.idActividad._id.toString() : null,
      activityTitle: report.idActividad ? report.idActividad.titulo : 'Actividad no disponible',
      area: report.idActividad ? report.idActividad.area : null,
      tipo: report.idActividad ? report.idActividad.tipo : null,
      activityStartDate: report.idActividad ? formatDate(report.idActividad.fechaInicio) : null,
      activityEndDate: report.idActividad ? formatDate(report.idActividad.fechaFin) : null,
      activityStatus: report.idActividad ? report.idActividad.estado : null,
      metricas: {
        invitados: report.metricas ? report.metricas.voluntariosInvitados : 0,
        confirmados: report.metricas ? report.metricas.voluntariosConfirmados : 0,
        asistentes: report.metricas ? report.metricas.voluntariosAsistieron : 0,
        horasTotales: report.metricas ? report.metricas.horasTotales : 0,
        beneficiarios: report.metricas ? report.metricas.beneficiarios : null,
        notas: report.metricas ? report.metricas.notas : null
      },
      createdAt: formatDate(report.creadoEn),
      updatedAt: formatDate(report.actualizadoEn),
      createdBy: report.creadoPor ? {
        id: report.creadoPor._id ? report.creadoPor._id.toString() : null,
        nombre: report.creadoPor.nombre,
        correo: report.creadoPor.correoUniversitario,
        rol: report.creadoPor.rol
      } : null
    }));

    const leaderboard = await userModel.getLeaderboard(10);
    const leaderboardFormatted = (leaderboard || []).map((u) => ({
      id: u._id?.toString() || null,
      nombre: u.nombre,
      correoUniversitario: u.correoUniversitario,
      puntos: u.puntos || 0,
      rol: u.rol || null,
      bloqueado: Boolean(u.bloqueado)
    }));

    res.json({
      success: true,
      panel: {
        summary: {
          totalActivities,
          activeActivities,
          upcomingActivities,
          totalEnrollments: enrollmentTotal,
          totalAttendance: attendanceTotal
        },
        metrics,
        enrollments: enrollmentSummary,
        attendance: attendanceSummary,
        impactReports: impactReportsFormatted,
        exports: {
          enrollmentsCsv: '/admin/panel/export/enrollments',
          attendanceCsv: '/admin/panel/export/attendance'
        },
        leaderboard: leaderboardFormatted
      }
    });
  } catch (error) {
    console.error('Error al cargar el panel del administrador:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cargar el panel del administrador',
      error: error.message
    });
  }
});

// Obtener todos los reportes de impacto
router.get('/impact-reports', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const reports = await ReporteImpacto.find({})
      .sort({ creadoEn: -1 })
      .populate('idActividad', 'titulo area tipo fechaInicio fechaFin estado')
      .populate('creadoPor', 'nombre correoUniversitario rol')
      .lean();

    const formatted = reports.map((report) => ({
      _id: report._id,
      actividad: report.idActividad ? {
          _id: report.idActividad._id,
          titulo: report.idActividad.titulo,
          area: report.idActividad.area,
          tipo: report.idActividad.tipo,
          fechaInicio: report.idActividad.fechaInicio,
          fechaFin: report.idActividad.fechaFin,
          estado: report.idActividad.estado
      } : null,
      metricas: report.metricas,
      creadoPor: report.creadoPor ? {
          nombre: report.creadoPor.nombre,
          correo: report.creadoPor.correoUniversitario
      } : null,
      creadoEn: report.creadoEn
    }));

    // Calculate totals
    const totals = formatted.reduce((acc, curr) => {
        acc.totalHoras += (curr.metricas.horasTotales || 0);
        acc.totalBeneficiarios += (curr.metricas.beneficiarios || 0);
        return acc;
    }, { totalHoras: 0, totalBeneficiarios: 0 });

    res.json({
      success: true,
      totals,
      reports: formatted
    });
  } catch (error) {
    console.error('Error al obtener reportes de impacto:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/impact-reports', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { actividadId, beneficiarios, notas, horasTotales } = req.body || {};

    if (!actividadId) {
      return res.status(400).json({ success: false, message: 'actividadId requerido' });
    }

    const actividad = await Actividad.findById(actividadId);
    if (!actividad) {
      return res.status(404).json({ success: false, message: 'Actividad no encontrada' });
    }

    const now = new Date();
    const actividadFinalizada = actividad.estado === 'closed' || (actividad.fechaFin && new Date(actividad.fechaFin) <= now);
    if (!actividadFinalizada) {
      return res.status(400).json({ success: false, message: 'La actividad debe estar finalizada para generar el reporte de impacto' });
    }

    const attendanceCount = await Attendance.countDocuments({ actividad: actividadId });
    if (attendanceCount === 0) {
      return res.status(400).json({ success: false, message: 'No hay registros de asistencia para esta actividad' });
    }

    const existingReport = await ReporteImpacto.findOne({ idActividad: actividadId });
    if (existingReport) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un reporte de impacto para esta actividad',
        reporte: existingReport
      });
    }

    const beneficiariosNumber = beneficiarios === undefined || beneficiarios === null ? null : Number(beneficiarios);
    if (beneficiariosNumber !== null && (Number.isNaN(beneficiariosNumber) || beneficiariosNumber < 0)) {
      return res.status(400).json({ success: false, message: 'beneficiarios debe ser un numero mayor o igual a cero' });
    }

    const notasValue = notas === undefined || notas === null ? null : String(notas);
    const metricasCalculadas = await computeImpactMetrics(actividadId, actividad);

    const sessionUserId = req.session && req.session.user ? req.session.user.id : null;
    if (!sessionUserId) {
      return res.status(401).json({ success: false, message: 'Sesion no disponible' });
    }

    const reporte = new ReporteImpacto({
      idActividad: actividadId,
      metricas: {
        ...metricasCalculadas,
        horasTotales: (horasTotales !== undefined && horasTotales !== null) ? Number(horasTotales) : metricasCalculadas.horasTotales,
        beneficiarios: beneficiariosNumber,
        notas: notasValue
      },
      creadoPor: sessionUserId
    });

    await reporte.save();

    return res.status(201).json({
      success: true,
      message: 'Reporte de impacto generado correctamente',
      reporte
    });
  } catch (error) {
    console.error('Error al generar reporte de impacto:', error);
    return res.status(500).json({
      success: false,
      message: 'No fue posible generar el reporte de impacto',
      error: error.message
    });
  }
});

router.get('/panel/export/enrollments', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const filters = {};
    if (req.query.estado) filters.estado = req.query.estado;
    if (req.query.actividadId) filters.actividad = req.query.actividadId;

    const inscripciones = await Inscripcion.find(filters)
      .sort({ creadoEn: -1 })
      .populate('actividad', 'titulo area tipo fechaInicio fechaFin estado')
      .populate('usuario', 'nombre correoUniversitario rol telefono carrera')
      .lean();

    const csv = buildCsv(inscripciones, [
      { header: 'ID Inscripcion', accessor: row => (row._id ? row._id.toString() : '') },
      { header: 'Estado', accessor: row => row.estado || '' },
      { header: 'Creado En', accessor: row => formatDate(row.creadoEn) || '' },
      { header: 'Actividad ID', accessor: row => (row.actividad && row.actividad._id ? row.actividad._id.toString() : '') },
      { header: 'Actividad', accessor: row => (row.actividad ? row.actividad.titulo : '') },
      { header: 'Area', accessor: row => (row.actividad ? row.actividad.area : '') },
      { header: 'Tipo', accessor: row => (row.actividad ? row.actividad.tipo : '') },
      { header: 'Fecha Inicio', accessor: row => (row.actividad ? formatDate(row.actividad.fechaInicio) || '' : '') },
      { header: 'Fecha Fin', accessor: row => (row.actividad ? formatDate(row.actividad.fechaFin) || '' : '') },
      { header: 'Usuario ID', accessor: row => (row.usuario && row.usuario._id ? row.usuario._id.toString() : '') },
      { header: 'Nombre', accessor: row => (row.usuario ? row.usuario.nombre : '') },
      { header: 'Correo', accessor: row => (row.usuario ? row.usuario.correoUniversitario : '') },
      { header: 'Rol', accessor: row => (row.usuario ? row.usuario.rol : '') },
      { header: 'Telefono', accessor: row => (row.usuario ? row.usuario.telefono || '' : '') },
      { header: 'Carrera', accessor: row => (row.usuario ? row.usuario.carrera || '' : '') }
    ]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="enrollments.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error al exportar inscripciones:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible exportar las inscripciones',
      error: error.message
    });
  }
});

router.get('/panel/export/attendance', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const filters = {};
    if (req.query.actividadId) filters.actividad = req.query.actividadId;

    const attendanceRecords = await Attendance.find(filters)
      .sort({ fecha: -1 })
      .populate('actividad', 'titulo area tipo')
      .populate('inscripciones.usuario', 'nombre correoUniversitario')
      .populate('registradoPor', 'nombre correoUniversitario')
      .lean();

    // Transformar datos de attendance para CSV
    const rows = [];
    attendanceRecords.forEach((record) => {
      if (Array.isArray(record.inscripciones)) {
        record.inscripciones.forEach((ins) => {
          rows.push({
            _id: record._id,
            actividad: record.actividad,
            usuario: ins.usuario,
            asistencia: ins.asistencia,
            fecha: record.fecha,
            registradoPor: record.registradoPor
          });
        });
      }
    });

    const csv = buildCsv(rows, [
      { header: 'ID Registro', accessor: row => (row._id ? row._id.toString() : '') },
      { header: 'Actividad ID', accessor: row => (row.actividad && row.actividad._id ? row.actividad._id.toString() : '') },
      { header: 'Actividad', accessor: row => (row.actividad ? row.actividad.titulo : '') },
      { header: 'Area', accessor: row => (row.actividad ? row.actividad.area : '') },
      { header: 'Tipo', accessor: row => (row.actividad ? row.actividad.tipo : '') },
      { header: 'Usuario ID', accessor: row => (row.usuario && row.usuario._id ? row.usuario._id.toString() : '') },
      { header: 'Usuario', accessor: row => (row.usuario ? row.usuario.nombre : '') },
      { header: 'Correo Usuario', accessor: row => (row.usuario ? row.usuario.correoUniversitario : '') },
      { header: 'Asistencia', accessor: row => row.asistencia || 'ausente' },
      { header: 'Fecha', accessor: row => formatDate(row.fecha) || '' },
      { header: 'Registrado Por', accessor: row => (row.registradoPor ? row.registradoPor.nombre : '') },
      { header: 'Correo Registrado Por', accessor: row => (row.registradoPor ? row.registradoPor.correoUniversitario : '') }
    ]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error al exportar asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible exportar los registros de asistencia',
      error: error.message
    });
  }
});

router.get('/panel/export/impact-reports', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const reports = await ReporteImpacto.find({})
      .sort({ creadoEn: -1 })
      .populate('idActividad', 'titulo area tipo fechaInicio fechaFin')
      .populate('creadoPor', 'nombre correoUniversitario')
      .lean();

    const csv = buildCsv(reports, [
      { header: 'ID Reporte', accessor: row => (row._id ? row._id.toString() : '') },
      { header: 'Actividad', accessor: row => (row.idActividad ? row.idActividad.titulo : '') },
      { header: 'Area', accessor: row => (row.idActividad ? row.idActividad.area : '') },
      { header: 'Tipo', accessor: row => (row.idActividad ? row.idActividad.tipo : '') },
      { header: 'Fecha Inicio', accessor: row => (row.idActividad ? formatDate(row.idActividad.fechaInicio) : '') },
      { header: 'Invitados', accessor: row => (row.metricas ? row.metricas.voluntariosInvitados : 0) },
      { header: 'Confirmados', accessor: row => (row.metricas ? row.metricas.voluntariosConfirmados : 0) },
      { header: 'Asistieron', accessor: row => (row.metricas ? row.metricas.voluntariosAsistieron : 0) },
      { header: 'Horas Totales', accessor: row => (row.metricas ? row.metricas.horasTotales : 0) },
      { header: 'Beneficiarios', accessor: row => (row.metricas ? row.metricas.beneficiarios || 0 : 0) },
      { header: 'Notas', accessor: row => (row.metricas ? row.metricas.notas || '' : '') },
      { header: 'Creado Por', accessor: row => (row.creadoPor ? row.creadoPor.nombre : '') },
      { header: 'Fecha Creacion', accessor: row => formatDate(row.creadoEn) }
    ]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="impact_reports.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error al exportar reportes de impacto:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible exportar los reportes de impacto',
      error: error.message
    });
  }
});

// Listar eventos para administradores y coordinadores
router.get('/events', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const events = await Actividad.find({})
      .sort({ fechaInicio: 1 })
      .select('-imagen')
      .lean();

    const formatted = events.map((evt) => ({
      id: evt._id ? evt._id.toString() : null,
      titulo: evt.titulo,
      area: evt.area,
      tipo: evt.tipo,
      fechaInicio: formatDate(evt.fechaInicio),
      fechaFin: formatDate(evt.fechaFin),
      estado: evt.estado,
      capacidad: evt.capacidad,
      ubicacion: evt.ubicacion || null,
      creadoEn: formatDate(evt.creadoEn),
      actualizadoEn: formatDate(evt.actualizadoEn)
    }));

    res.json({
      success: true,
      total: formatted.length,
      eventos: formatted
    });
  } catch (error) {
    console.error('Error al listar eventos:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible obtener los eventos',
      error: error.message
    });
  }
});

// Listar todos los estudiantes registrados
router.get('/students', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const students = await userModel.findAllStudents();

    const formatted = (students || []).map((student) => ({
      id: student._id ? student._id.toString() : null,
      nombre: student.nombre,
      correoUniversitario: student.correoUniversitario,
      telefono: student.telefono || null,
      carrera: student.carrera || '',
      intereses: Array.isArray(student.intereses) ? student.intereses : [],
      comuna: student.comuna || '',
      direccion: student.direccion || '',
      edad: student.edad || null,
      status: student.status || '',
      rol: student.rol || student.role || 'estudiante',
      creadoEn: formatDate(student.creadoEn),
      actualizadoEn: formatDate(student.actualizadoEn)
    }));

    res.json({
      success: true,
      total: formatted.length,
      estudiantes: formatted
    });
  } catch (error) {
    console.error('Error al listar estudiantes:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible obtener los estudiantes registrados',
      error: error.message
    });
  }
});

// Gestion de usuarios: listar/buscar
router.get('/users', ensureAuth, ensureRole(['admin']), async (req, res) => {
  try {
    const { search, role, blocked } = req.query || {};
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip = (page - 1) * limit;

    const blockedFilter = parseBoolean(blocked);
    const normalizedRole = userModel.normalizeRole(role);

    const { users, total } = await userModel.listUsers({
      search: search || '',
      role: normalizedRole,
      blocked: blockedFilter,
      limit,
      skip
    });

    const formatted = (users || []).map(formatUser);

    res.json({
      success: true,
      total,
      page,
      pageSize: formatted.length,
      usuarios: formatted
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible obtener los usuarios',
      error: error.message
    });
  }
});

// Cambiar rol (student/coordinator/admin)
router.patch('/users/:id/role', ensureAuth, ensureRole(['admin']), async (req, res) => {
  const newRole = req.body ? (req.body.rol || req.body.role) : null;
  const normalizedRole = userModel.normalizeRole(newRole);
  if (!normalizedRole) {
    return res.status(400).json({ success: false, message: 'Rol invalido. Use estudiante, staff/coordinator o admin' });
  }

  try {
    const updated = await userModel.updateRole(req.params.id, normalizedRole);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    res.json({
      success: true,
      message: 'Rol actualizado correctamente',
      usuario: formatUser(updated)
    });
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible actualizar el rol',
      error: error.message
    });
  }
});

// Bloquear / desbloquear acceso
router.patch('/users/:id/block', ensureAuth, ensureRole(['admin']), async (req, res) => {
  const blockedValue = req.body ? (req.body.bloqueado ?? req.body.blocked) : null;
  const parsed = parseBoolean(blockedValue);
  if (parsed === null) {
    return res.status(400).json({ success: false, message: 'Debe indicar blocked/bloqueado como true o false' });
  }

  try {
    const updated = await userModel.setBlocked(req.params.id, parsed);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    res.json({
      success: true,
      message: parsed ? 'Usuario bloqueado' : 'Usuario desbloqueado',
      usuario: formatUser(updated)
    });
  } catch (error) {
    console.error('Error al cambiar estado de bloqueo:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible actualizar el estado de acceso',
      error: error.message
    });
  }
});

// Ajustar puntuacion de un voluntario
router.post('/volunteers/:id/score', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const delta = req.body ? Number(req.body.puntos ?? req.body.delta ?? req.body.cambio) : null;
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ success: false, message: 'Debe indicar puntos/delta numerico distinto de cero' });
    }

    const motivo = req.body?.motivo || 'Ajuste manual';
    const actividadId = req.body?.actividadId || null;
    const sessionUserId = req.session?.user?.id || null;

    const result = await userModel.adjustScore(req.params.id, delta, {
      motivo,
      actividadId,
      registradoPor: sessionUserId
    });

    if (!result.user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.json({
      success: true,
      applied: Boolean(result.applied),
      usuario: formatUser(result.user)
    });
  } catch (error) {
    console.error('Error al ajustar puntuacion:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible ajustar la puntuacion',
      error: error.message
    });
  }
});

// Obtener puntaje e historial de un voluntario
router.get('/volunteers/:id/score', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const score = await userModel.getScore(req.params.id, limit);
    if (!score) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: score });
  } catch (error) {
    console.error('Error al obtener puntaje:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible obtener la puntuacion',
      error: error.message
    });
  }
});

// Ranking de voluntarios por puntos
router.get('/volunteers/leaderboard', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const leaderboard = await userModel.getLeaderboard(limit);

    const formatted = (leaderboard || []).map((u) => ({
      id: u._id ? u._id.toString() : null,
      nombre: u.nombre,
      correoUniversitario: u.correoUniversitario,
      puntos: u.puntos || 0,
      rol: u.rol || null,
      bloqueado: Boolean(u.bloqueado)
    }));

    res.json({
      success: true,
      total: formatted.length,
      leaderboard: formatted
    });
  } catch (error) {
    console.error('Error al obtener ranking:', error);
    res.status(500).json({
      success: false,
      message: 'No fue posible obtener el ranking de voluntarios',
      error: error.message
    });
  }
});


// Actualizar reporte de impacto
router.put('/impact-reports/:id', ensureAuth, ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { beneficiarios, notas, horasTotales } = req.body || {};
    const reportId = req.params.id;

    const report = await ReporteImpacto.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    if (beneficiarios !== undefined && beneficiarios !== null) {
      const benNum = Number(beneficiarios);
      if (!Number.isNaN(benNum) && benNum >= 0) {
        report.metricas.beneficiarios = benNum;
      }
    }

    if (notas !== undefined && notas !== null) {
      report.metricas.notas = String(notas);
    }

    if (horasTotales !== undefined && horasTotales !== null) {
       const horasNum = Number(horasTotales);
       if (!Number.isNaN(horasNum) && horasNum >= 0) {
         report.metricas.horasTotales = horasNum;
       }
    }

    // Actualizar quien modificó si es necesario, o solo fecha
    report.actualizadoEn = new Date();
    
    await report.save();

    res.json({
      success: true,
      message: 'Reporte actualizado correctamente',
      reporte: report
    });
  } catch (error) {
    console.error('Error al actualizar reporte:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// ============== CREAR STAFF/ADMIN ==============
router.post('/users/create', ensureAuth, ensureRole(['admin']), async (req, res) => {
  try {
    const { correoUniversitario, nombre, contrasena, rol, telefono, carrera } = req.body;

    // Validaciones
    if (!correoUniversitario || !nombre || !contrasena || !rol) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: correoUniversitario, nombre, contrasena, rol'
      });
    }

    // Solo permitir crear staff o admin
    if (!['staff', 'admin'].includes(rol)) {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden crear usuarios con rol staff o admin'
      });
    }

    // Validar formato de correo
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correoUniversitario)) {
      return res.status(400).json({
        success: false,
        message: 'El correo electrónico no tiene un formato válido'
      });
    }

    // Validar longitud de contraseña
    if (contrasena.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Verificar si ya existe el usuario
    const existingUser = await userModel.findByCorreo(correoUniversitario);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un usuario con ese correo electrónico'
      });
    }

    // Crear el usuario
    const newUser = await userModel.createUser({
      correoUniversitario,
      contrasena,
      nombre,
      rol,
      telefono: telefono || null,
      carrera: carrera || '',
      status: 'activo'
    });

    // ✅ CORREGIDO: Usar req.session.user en lugar de req.user
    const adminEmail = req.session?.user?.correoUniversitario || 'admin';
    console.log(`✅ Usuario ${rol} creado: ${correoUniversitario} por admin ${adminEmail}`);

    res.status(201).json({
      success: true,
      message: `Usuario ${rol} creado exitosamente`,
      usuario: {
        _id: newUser._id,
        correoUniversitario: newUser.correoUniversitario,
        nombre: newUser.nombre,
        rol: newUser.rol
      }
    });

  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno al crear el usuario'
    });
  }
});

module.exports = router;
