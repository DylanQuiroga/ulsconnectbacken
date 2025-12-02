// Esquema de inscripciones de usuarios a actividades
const { mongoose } = require('../db');
const { Schema } = mongoose;

const InscripcionSchema = new Schema({
  // Campos principales; alias permiten usar idUsuario/idActividad desde otros modulos
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, alias: 'idUsuario' },
  actividad: { type: Schema.Types.ObjectId, ref: 'Actividad', required: true, alias: 'idActividad' },
  estado: { type: String, default: 'activa', enum: ['activa', 'cancelada', 'terminada', 'confirmado', 'pendiente', 'inscrito'] },
  motivoCancelacion: { type: String, default: null },
  respuestas: { type: Schema.Types.Mixed, default: {} },
  registrosAsistencia: [{
    fecha: { type: Date, default: Date.now },
    metodo: { type: String, default: 'manual' },
    registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null }
  }],
  notas: { type: String, default: '' }
}, { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } });

// Indice unico por usuario-actividad para evitar inscripciones duplicadas
InscripcionSchema.index({ usuario: 1, actividad: 1 }, { unique: true });

module.exports = mongoose.model('Inscripcion', InscripcionSchema, 'inscripciones');
