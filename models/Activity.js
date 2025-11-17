const mongoose = require('mongoose');

const ubicacionSchema = new mongoose.Schema({
  nombreComuna: { type: String },
  nombreLugar: { type: String },
  lng: { type: Number }
}, { _id: false });

const activitySchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true },
  descripcion: { type: String, default: '' },
  area: { type: String, default: '' },
  tipo: { type: String, default: '' },
  fechaInicio: { type: Date },
  fechaFin: { type: Date },
  ubicacion: { type: ubicacionSchema, default: {} },
  capacidad: { type: Number, default: null },
  estado: { type: String, default: 'draft' },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false }
}, {
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
  collection: 'actividades'
});

module.exports = mongoose.model('Activity', activitySchema);
