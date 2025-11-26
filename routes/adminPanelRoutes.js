const express = require('express');
const path = require('path');
const router = express.Router();

const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const Actividad = require(path.join(__dirname, '..', 'lib', 'schema', 'Actividad'));
const Enrollment = require(path.join(__dirname, '..', 'lib', 'schema', 'Enrollment'));
const RegistroAsistencia = require(path.join(__dirname, '..', 'lib', 'schema', 'RegistroAsistencia'));
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
  return {
    id: user._id ? user._id.toString() : null,
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
  const [totalInvitados, totalConfirmados, registrosAsistencia] = await Promise.all([
    Enrollment.countDocuments({ idActividad: actividadId }),
    Enrollment.countDocuments({ idActividad: actividadId, estado: 'confirmado' }),
    RegistroAsistencia.find({ idActividad: actividadId }).select('idUsuario').lean()
  ]);

  const asistentesSet = new Set(
    registrosAsistencia
      .map((reg) => (reg.idUsuario ? reg.idUsuario.toString() : null))
      .filter(Boolean)
  );

  const voluntariosAsistieron = asistentesSet.size;
  const horasTotales = calculateTotalHours(actividadDoc, voluntariosAsistieron);

  return {
    voluntariosInvitados: totalInvitados,
    voluntariosConfirmados: totalConfirmados,
    voluntariosAsistieron,
    horasTotales
  };
}

router.get('/panel', ensureRole(['admin', 'staff']), async (req, res) => {
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
      Enrollment.aggregate([
        {
          $group: {
            _id: '$estado',
            total: { $sum: 1 }
          }
        }
      ]),
      Enrollment.aggregate([
        {
          $group: {
            _id: '$idActividad',
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
      Enrollment.find({})
        .sort({ creadoEn: -1 })
        .limit(10)
        .populate('idActividad', 'titulo area tipo fechaInicio fechaFin estado')
        .populate('idUsuario', 'nombre correoUniversitario rol')
        .lean(),
      Enrollment.countDocuments({}),
      RegistroAsistencia.countDocuments({}),
      RegistroAsistencia.aggregate([
        {
          $group: {
            _id: '$idActividad',
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
      RegistroAsistencia.find({})
        .sort({ fecha: -1 })
        .limit(20)
        .populate('idActividad', 'titulo area tipo')
        .populate('idUsuario', 'nombre correoUniversitario')
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
      latest: latestEnrollments.map((enrollment) => ({
        enrollmentId: enrollment._id ? enrollment._id.toString() : null,
        status: enrollment.estado,
        createdAt: formatDate(enrollment.creadoEn),
        activityId: enrollment.idActividad && enrollment.idActividad._id ? enrollment.idActividad._id.toString() : null,
        activityTitle: enrollment.idActividad ? enrollment.idActividad.titulo : 'Actividad no disponible',
        activityStartDate: enrollment.idActividad ? formatDate(enrollment.idActividad.fechaInicio) : null,
        area: enrollment.idActividad ? enrollment.idActividad.area : null,
        tipo: enrollment.idActividad ? enrollment.idActividad.tipo : null,
        userId: enrollment.idUsuario && enrollment.idUsuario._id ? enrollment.idUsuario._id.toString() : null,
        userName: enrollment.idUsuario ? enrollment.idUsuario.nombre : 'Usuario no disponible',
        userEmail: enrollment.idUsuario ? enrollment.idUsuario.correoUniversitario : null,
        userRole: enrollment.idUsuario ? (enrollment.idUsuario.rol || null) : null
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
      recent: recentAttendance.map((record) => ({
        attendanceId: record._id ? record._id.toString() : null,
        activityId: record.idActividad && record.idActividad._id ? record.idActividad._id.toString() : null,
        activityTitle: record.idActividad ? record.idActividad.titulo : 'Actividad no disponible',
        area: record.idActividad ? record.idActividad.area : null,
        tipo: record.idActividad ? record.idActividad.tipo : null,
        userId: record.idUsuario && record.idUsuario._id ? record.idUsuario._id.toString() : null,
        userName: record.idUsuario ? record.idUsuario.nombre : 'Usuario no disponible',
        userEmail: record.idUsuario ? record.idUsuario.correoUniversitario : null,
        recordedAt: formatDate(record.fecha),
        recordedBy: record.registradoPor && record.registradoPor._id ? record.registradoPor._id.toString() : null,
        recordedByName: record.registradoPor ? record.registradoPor.nombre : null,
        recordedByEmail: record.registradoPor ? record.registradoPor.correoUniversitario : null,
        evento: record.evento || ''
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
        }
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

router.post('/impact-reports', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const { actividadId, beneficiarios, notas } = req.body || {};

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

    const attendanceCount = await RegistroAsistencia.countDocuments({ idActividad: actividadId });
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

router.get('/panel/export/enrollments', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const filters = {};
    if (req.query.estado) filters.estado = req.query.estado;
    if (req.query.actividadId) filters.idActividad = req.query.actividadId;

    const enrollments = await Enrollment.find(filters)
      .sort({ creadoEn: -1 })
      .populate('idActividad', 'titulo area tipo fechaInicio fechaFin estado')
      .populate('idUsuario', 'nombre correoUniversitario rol telefono carrera')
      .lean();

    const csv = buildCsv(enrollments, [
      { header: 'ID Inscripcion', accessor: row => (row._id ? row._id.toString() : '') },
      { header: 'Estado', accessor: row => row.estado || '' },
      { header: 'Creado En', accessor: row => formatDate(row.creadoEn) || '' },
      { header: 'Actividad ID', accessor: row => (row.idActividad && row.idActividad._id ? row.idActividad._id.toString() : '') },
      { header: 'Actividad', accessor: row => (row.idActividad ? row.idActividad.titulo : '') },
      { header: 'Area', accessor: row => (row.idActividad ? row.idActividad.area : '') },
      { header: 'Tipo', accessor: row => (row.idActividad ? row.idActividad.tipo : '') },
      { header: 'Fecha Inicio', accessor: row => (row.idActividad ? formatDate(row.idActividad.fechaInicio) || '' : '') },
      { header: 'Fecha Fin', accessor: row => (row.idActividad ? formatDate(row.idActividad.fechaFin) || '' : '') },
      { header: 'Usuario ID', accessor: row => (row.idUsuario && row.idUsuario._id ? row.idUsuario._id.toString() : '') },
      { header: 'Nombre', accessor: row => (row.idUsuario ? row.idUsuario.nombre : '') },
      { header: 'Correo', accessor: row => (row.idUsuario ? row.idUsuario.correoUniversitario : '') },
      { header: 'Rol', accessor: row => (row.idUsuario ? row.idUsuario.rol : '') },
      { header: 'Telefono', accessor: row => (row.idUsuario ? row.idUsuario.telefono || '' : '') },
      { header: 'Carrera', accessor: row => (row.idUsuario ? row.idUsuario.carrera || '' : '') }
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

router.get('/panel/export/attendance', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const filters = {};
    if (req.query.actividadId) filters.idActividad = req.query.actividadId;
    if (req.query.usuarioId) filters.idUsuario = req.query.usuarioId;

    const attendanceRecords = await RegistroAsistencia.find(filters)
      .sort({ fecha: -1 })
      .populate('idActividad', 'titulo area tipo')
      .populate('idUsuario', 'nombre correoUniversitario')
      .populate('registradoPor', 'nombre correoUniversitario')
      .lean();

    const csv = buildCsv(attendanceRecords, [
      { header: 'ID Registro', accessor: row => (row._id ? row._id.toString() : '') },
      { header: 'Actividad ID', accessor: row => (row.idActividad && row.idActividad._id ? row.idActividad._id.toString() : '') },
      { header: 'Actividad', accessor: row => (row.idActividad ? row.idActividad.titulo : '') },
      { header: 'Area', accessor: row => (row.idActividad ? row.idActividad.area : '') },
      { header: 'Tipo', accessor: row => (row.idActividad ? row.idActividad.tipo : '') },
      { header: 'Usuario ID', accessor: row => (row.idUsuario && row.idUsuario._id ? row.idUsuario._id.toString() : '') },
      { header: 'Usuario', accessor: row => (row.idUsuario ? row.idUsuario.nombre : '') },
      { header: 'Correo Usuario', accessor: row => (row.idUsuario ? row.idUsuario.correoUniversitario : '') },
      { header: 'Fecha', accessor: row => formatDate(row.fecha) || '' },
      { header: 'Registrado Por', accessor: row => (row.registradoPor ? row.registradoPor.nombre : '') },
      { header: 'Correo Registrado Por', accessor: row => (row.registradoPor ? row.registradoPor.correoUniversitario : '') },
      { header: 'Evento', accessor: row => row.evento || '' }
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

// Listar eventos para administradores y coordinadores
router.get('/events', ensureRole(['admin', 'staff']), async (req, res) => {
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
router.get('/students', ensureRole(['admin', 'staff']), async (req, res) => {
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
router.get('/users', ensureRole(['admin']), async (req, res) => {
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
router.patch('/users/:id/role', ensureRole(['admin']), async (req, res) => {
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
router.patch('/users/:id/block', ensureRole(['admin']), async (req, res) => {
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

module.exports = router;
