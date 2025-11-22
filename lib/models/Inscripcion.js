const { mongoose } = require('../db');
const { Schema } = mongoose;

const InscripcionSchema = new Schema({
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  actividad: { type: Schema.Types.ObjectId, ref: 'Actividad', required: true },
  estado: { type: String, default: 'activa', enum: ['activa', 'cancelada'] },
  motivoCancelacion: { type: String, default: null }
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

// Índice único para evitar duplicados
InscripcionSchema.index({ usuario: 1, actividad: 1 }, { unique: true });

module.exports = mongoose.model('Inscripcion', InscripcionSchema, 'inscripciones');
