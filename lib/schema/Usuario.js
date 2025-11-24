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
  status: { type: String, default: 'pendiente' }
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

module.exports = mongoose.model('Usuario', UsuarioSchema);