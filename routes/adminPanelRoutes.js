const express = require('express');
const path = require('path');
const router = express.Router();

const ensureRole = require(path.join(__dirname, '..', 'middleware', 'ensureRole'));
const Actividad = require(path.join(__dirname, '..', 'lib', 'schema', 'Actividad'));
const Inscripcion = require(path.join(__dirname, '..', 'lib', 'schema', 'Inscripcion'));
const Attendance = require(path.join(__dirname, '..', 'lib', 'schema', 'Attendance'));


// Converts a date value to ISO string format.
// Returns null if the value is invalid.
// @param {Date|string|null} value - The date value to format
// @returns {string|null} ISO string or null 
function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Creates a label string from a bucket object containing year and month.
// Format: YYYY-MM
// @param {Object} bucket - Object with year and month properties
// @returns {string} Formatted label or 'N/A'
function bucketLabel(bucket) {
  if (!bucket || typeof bucket.year !== 'number' || typeof bucket.month !== 'number') return 'N/A';
  const month = bucket.month < 10 ? `0${bucket.month}` : bucket.month;
  return `${bucket.year}-${month}`;
}

// Escapes CSV special characters in a value.
// Wraps with quotes if the value contains quotes, commas, or semicolons.
// @param {*} value - The value to escape
// @returns {string} Escaped CSV-safe value
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\r?\n/g, ' ').trim();
  if (str.includes('"') || str.includes(',') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Builds a CSV string from an array of rows and column definitions.
// @param {Array} rows - Array of data objects to convert
// @param {Array} columns - Array of column definitions with header and accessor
// @returns {string} CSV formatted string with header and data rows
function buildCsv(rows, columns) {
  if (!Array.isArray(rows) || !rows.length) {
    return columns.map(col => escapeCsv(col.header)).join(',');
  }
  const header = columns.map(col => escapeCsv(col.header)).join(',');
  const lines = rows.map(row => columns.map(col => escapeCsv(col.accessor(row))).join(','));
  return [header, ...lines].join('\n');
}

// GET /admin/panel
// Admin and staff only.
// Retrieves comprehensive dashboard metrics including:
// - Activity metrics by area, type, and month
// - Enrollment statistics and top activities
// - Attendance records and recent activity 
router.get('/panel', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const now = new Date();

    // Fetch all dashboard data in parallel for performance
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
      // Activities grouped by area with active count
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
      // Activities grouped by type
      Actividad.aggregate([
        {
          $group: {
            _id: '$tipo',
            total: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]),
      // Activities grouped by creation month (last 12 months)
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
      // Total activities count
      Actividad.countDocuments({}),
      // Active (non-closed) activities count
      Actividad.countDocuments({ estado: { $ne: 'closed' } }),
      // Upcoming activities count
      Actividad.countDocuments({ fechaInicio: { $gte: now } }),
      // Enrollments grouped by status
      Inscripcion.aggregate([
        {
          $group: {
            _id: '$estado',
            total: { $sum: 1 }
          }
        }
      ]),
      // Top 5 activities by enrollment count
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
      // Latest 10 enrollments
      Inscripcion.find({})
        .sort({ creadoEn: -1 })
        .limit(10)
        .populate('actividad', 'titulo area tipo fechaInicio fechaFin estado')
        .populate('usuario', 'nombre correoUniversitario rol')
        .lean(),
      // Total enrollments count
      Inscripcion.countDocuments({}), 
      // Total attendance lists count
      Attendance.countDocuments({}),
      // Top 5 activities by attendance records
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
      // Latest 20 attendance records
      Attendance.find({})
        .sort({ fecha: -1 })
        .limit(20)
        .populate('actividad', 'titulo area tipo')
        .populate('registradoPor', 'nombre correoUniversitario')
        .lean()
    ]);

    // Format and structure all metrics for response
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
        inscripcionId: inscripcion._id ? inscripcion._id.toString() : null,
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

    // Build enrollment status summary
    enrollmentByStatus.forEach((item) => {
      enrollmentSummary.byStatus[item._id || 'sin_estado'] = item.total;
    });

    // Format attendance summary data
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
        activityId: record.actividad && record.actividad._id ? record.actividad._id.toString() : null,
        activityTitle: record.actividad ? record.actividad.titulo : 'Actividad no disponible',
        area: record.actividad ? record.actividad.area : null,
        tipo: record.actividad ? record.actividad.tipo : null,
        recordedAt: formatDate(record.fecha),
        recordedBy: record.registradoPor && record.registradoPor._id ? record.registradoPor._id.toString() : null,
        recordedByName: record.registradoPor ? record.registradoPor.nombre : null,
        recordedByEmail: record.registradoPor ? record.registradoPor.correoUniversitario : null
      }))
    };

    // Return complete admin dashboard with all metrics
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

// GET /admin/panel/export/enrollments
// Admin and staff only.
// Exports enrollment data to CSV format.
// Query filters:
// - estado: Filter by enrollment status
// - actividadId: Filter by activity ID
router.get('/panel/export/enrollments', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const filters = {};
    if (req.query.estado) filters.estado = req.query.estado;
    if (req.query.actividadId) filters.actividad = req.query.actividadId;

    // Fetch filtered enrollments with related data
    const inscripciones = await Inscripcion.find(filters)
      .sort({ creadoEn: -1 })
      .populate('actividad', 'titulo area tipo fechaInicio fechaFin estado')
      .populate('usuario', 'nombre correoUniversitario rol telefono carrera')
      .lean();

    // Build CSV with enrollment data
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

    // Set CSV response headers and send file
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

// GET /admin/panel/export/attendance
// Admin and staff only.
// Exports attendance records to CSV format.
// Query filters:
// - actividadId: Filter by activity ID
router.get('/panel/export/attendance', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const filters = {};
    if (req.query.actividadId) filters.actividad = req.query.actividadId;

    // Fetch filtered attendance records with related data
    const attendanceRecords = await Attendance.find(filters)
      .sort({ fecha: -1 })
      .populate('actividad', 'titulo area tipo')
      .populate('registradoPor', 'nombre correoUniversitario')
      .lean();

    // Build CSV with attendance data
    const csv = buildCsv(attendanceRecords, [
      { header: 'ID Registro', accessor: row => (row._id ? row._id.toString() : '') },
      { header: 'Actividad ID', accessor: row => (row.actividad && row.actividad._id ? row.actividad._id.toString() : '') },
      { header: 'Actividad', accessor: row => (row.actividad ? row.actividad.titulo : '') },
      { header: 'Area', accessor: row => (row.actividad ? row.actividad.area : '') },
      { header: 'Tipo', accessor: row => (row.actividad ? row.actividad.tipo : '') },
      { header: 'Fecha', accessor: row => formatDate(row.fecha) || '' },
      { header: 'Registrado Por', accessor: row => (row.registradoPor ? row.registradoPor.nombre : '') },
      { header: 'Correo Registrado Por', accessor: row => (row.registradoPor ? row.registradoPor.correoUniversitario : '') },
      { header: 'Total Inscripciones', accessor: row => (row.inscripciones ? row.inscripciones.length : 0) }
    ]);

    // Set CSV response headers and send file
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

module.exports = router;
