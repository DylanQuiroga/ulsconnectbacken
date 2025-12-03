// Esquema de actividades (eventos) con ubicacion y estado
const { mongoose } = require('../db');
const { Schema } = mongoose;

const ActividadSchema = new Schema({
  titulo: { type: String, required: true },
  descripcion: { type: String, required: true },
  area: { type: String, required: true },
  tipo: { type: String, required: true },
  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date, required: true },
  ubicacion: {
    nombreComuna: { type: String, required: true },
    nombreLugar: { type: String, required: true },
    direccion: { type: String, default: '' },
    nombreRegion: { type: String, default: 'Región de Coquimbo' },
    lng: { type: Number, required: true }
  },
  capacidad: { type: Number, default: null },
  estado: { type: String, default: 'activa' },
  creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  imagen: { type: Buffer, default: null },
  fechaCierre: { type: Date, default: null },
  motivoCierre: { type: String, default: null }
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

module.exports = mongoose.model('Actividad', ActividadSchema, 'actividades');
