const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  idActividad: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', required: true },
  idUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  evento: { type: String, default: '' },
  fecha: { type: Date, required: true },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null }
}, {
  timestamps: false,
  collection: 'registrosAsistencia'
});

module.exports = mongoose.model('Attendance', attendanceSchema);
