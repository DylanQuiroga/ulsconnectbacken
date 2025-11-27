const { mongoose } = require('../db');
const { Schema } = mongoose;

const AttendanceSchema = new Schema({
  actividad: { type: Schema.Types.ObjectId, ref: 'Actividad', required: true },
  inscripciones: [
    {
      usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
      asistencia: { type: String, enum: ['presente', 'ausente', 'justificada'], default: 'ausente' }
    }
  ],
  fecha: { type: Date, default: Date.now },
  registradoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true }

}, {
  timestamps: true,
  collection: 'registrosAsistencia'
});

module.exports = mongoose.model('Attendance', AttendanceSchema, 'registrosAsistencia');
