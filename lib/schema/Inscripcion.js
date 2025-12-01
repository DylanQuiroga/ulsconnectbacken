// Esquema de inscripciones de usuarios a actividades
const { mongoose } = require('../db');
const { Schema } = mongoose;

const InscripcionSchema = new Schema({
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  actividad: { type: Schema.Types.ObjectId, ref: 'Actividad', required: true },
  estado: { type: String, default: 'activa', enum: ['activa', 'cancelada', 'terminada'] },
  motivoCancelacion: { type: String, default: null }
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

// Indice unico por usuario-actividad para evitar inscripciones duplicadas
InscripcionSchema.index({ usuario: 1, actividad: 1 }, { unique: true });

module.exports = mongoose.model('Inscripcion', InscripcionSchema, 'inscripciones');
