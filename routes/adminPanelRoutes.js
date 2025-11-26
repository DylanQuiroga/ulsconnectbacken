const express = require('express');
const path = require('path');
const router = express.Router();

const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const Actividad = require(path.join(__dirname, '..', 'lib', 'schema', 'Actividad'));
const Enrollment = require(path.join(__dirname, '..', 'lib', 'schema', 'Enrollment'));
const RegistroAsistencia = require(path.join(__dirname, '..', 'lib', 'schema', 'RegistroAsistencia'));
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
      recentAttendance
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

module.exports = router;
