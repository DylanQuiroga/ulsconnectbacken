const { mongoose } = require('../db');
const { Schema } = mongoose;

const UsuarioSchema = new Schema({
  correoUniversitario: { type: String, required: true, unique: true },
  contrasena: { type: String, required: true },
  nombre: { type: String, required: true },
  rol: { type: String, default: 'estudiante' },
  telefono: { type: String, default: null },
  carrera: { type: String, default: '' },
  intereses: { type: [String], default: [] },
  comuna: { type: String, default: '' },
  direccion: { type: String, default: '' },
  edad: { type: Number, default: null },
  status: { type: String, default: 'pendiente' },
  bloqueado: { type: Boolean, default: false },
  puntos: { type: Number, default: 0 },
  historialPuntos: [
    {
      cambio: { type: Number, required: true },
      motivo: { type: String, default: '' },
      actividad: { type: Schema.Types.ObjectId, ref: 'Actividad', default: null },
      registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
      fecha: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

module.exports = mongoose.model('Usuario', UsuarioSchema);
