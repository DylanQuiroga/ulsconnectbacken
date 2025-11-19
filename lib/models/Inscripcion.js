const mongoose = require('mongoose');

const registroAsistenciaSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  metodo: { type: String, required: true },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null }
}, { _id: false });

const inscripcionSchema = new mongoose.Schema({
  idActividad: { type: mongoose.Schema.Types.ObjectId, ref: 'Actividad', required: true },
  idUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  estado: { type: String, required: true },
  registrosAsistencia: { type: [registroAsistenciaSchema], default: [] },
  notas: { type: String, default: null }
}, {
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  collection: 'inscripciones'
});

module.exports = mongoose.model('Inscripcion', inscripcionSchema);
