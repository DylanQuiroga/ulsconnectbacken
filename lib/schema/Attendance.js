// Esquema de registros de asistencia por actividad
const { mongoose } = require('../db');
const { Schema } = mongoose;

const VALID_STATUSES = ['presente', 'ausente', 'justificada'];

const AttendanceSchema = new Schema({
  actividad: { type: Schema.Types.ObjectId, ref: 'Actividad', required: true, alias: 'idActividad' },
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', alias: 'idUsuario' },
  asistencia: { type: String, enum: VALID_STATUSES, default: 'presente' },
  evento: { type: String, default: null },
  inscripciones: [
    {
      usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
      asistencia: { type: String, enum: VALID_STATUSES, default: 'ausente' }
    }
  ],
  fecha: { type: Date, default: Date.now },
  registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true }

}, {
  timestamps: true,
  collection: 'registrosAsistencia'
});

// Permite crear registros con idUsuario/asistencia simples rellenando inscripciones
AttendanceSchema.pre('validate', function(next) {
  const hasInscripciones = Array.isArray(this.inscripciones) && this.inscripciones.length > 0;
  if (!hasInscripciones && this.usuario) {
    const status = VALID_STATUSES.includes(this.asistencia) ? this.asistencia : 'presente';
    this.inscripciones = [{ usuario: this.usuario, asistencia: status }];
  }
  next();
});

module.exports = mongoose.model('Attendance', AttendanceSchema, 'registrosAsistencia');
