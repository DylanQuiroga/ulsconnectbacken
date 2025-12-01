// Esquema para reportes de impacto por actividad
const mongoose = require('mongoose');

// Subdocumento con metricas cuantitativas del impacto
const metricasSchema = new mongoose.Schema({
  voluntariosInvitados: { type: Number, required: true },
  voluntariosConfirmados: { type: Number, required: true },
  voluntariosAsistieron: { type: Number, required: true },
  horasTotales: { type: Number, required: true },
  beneficiarios: { type: Number, default: null },
  notas: { type: String, default: null }
}, { _id: false });

const reporteImpactoSchema = new mongoose.Schema({
  idActividad: { type: mongoose.Schema.Types.ObjectId, ref: 'Actividad', required: true },
  metricas: { type: metricasSchema, required: true },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true }
}, {
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  collection: 'reportesImpacto'
});

// Enforce one impact report per activity
reporteImpactoSchema.index({ idActividad: 1 }, { unique: true });

module.exports = mongoose.model('ReporteImpacto', reporteImpactoSchema);
