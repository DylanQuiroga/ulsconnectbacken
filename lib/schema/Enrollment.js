const mongoose = require('mongoose');

const asistenciaSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  metodo: { type: String, default: '' },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null }
}, { _id: false });

const enrollmentSchema = new mongoose.Schema({
  idActividad: { type: mongoose.Schema.Types.ObjectId, ref: 'Actividad', required: true },
  idUsuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  estado: { type: String, default: 'inscrito' },
  respuestas: { type: Object, default: {} },
  registrosAsistencia: { type: [asistenciaSchema], default: [] },
  notas: { type: String, default: null }
}, {
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  collection: 'inscripciones'
});

enrollmentSchema.index({ idActividad: 1, idUsuario: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
