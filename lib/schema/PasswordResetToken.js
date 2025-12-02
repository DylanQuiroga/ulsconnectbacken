// Esquema de tokens de reseteo de contraseña (hash + expiracion)
const { mongoose } = require('../db');
const { Schema } = mongoose;

const PasswordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  requestedFromIP: { type: String, default: null },
  userAgent: { type: String, default: null },
  usedAt: { type: Date, default: null },
  invalidatedAt: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' }
});

// TTL index para expirar tokens automaticamente
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
