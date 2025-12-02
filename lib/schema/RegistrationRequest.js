// Esquema para solicitudes de registro de nuevos usuarios
const { mongoose } = require('../db');
const { Schema } = mongoose;

const RegistrationRequestSchema = new Schema({
  correoUniversitario: { type: String, required: true, unique: true },
  contrasenaHash: { type: String, required: true },
  nombre: { type: String, required: true },
  telefono: { type: String, default: null },
  carrera: { type: String, default: '' },
  intereses: { type: [String], default: [] },
  comuna: { type: String, default: '' },
  direccion: { type: String, default: '' },
  edad: { type: Number, default: null },
  statusUsuario: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: '' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }, collection: 'registrationRequests' });

module.exports = mongoose.model('RegistrationRequest', RegistrationRequestSchema);
