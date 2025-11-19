const mongoose = require('mongoose');

const registroAsistenciaSchema = new mongoose.Schema({
  idActividad: { type: mongoose.Schema.Types.ObjectId, ref: 'Actividad', required: true },
  idUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  evento: { type: String, default: '' },
  fecha: { type: Date, required: true },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null }
}, {
  timestamps: false,
  collection: 'registrosAsistencia'
});

module.exports = mongoose.model('RegistroAsistencia', registroAsistenciaSchema);
