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
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

module.exports = mongoose.model('Usuario', UsuarioSchema);
