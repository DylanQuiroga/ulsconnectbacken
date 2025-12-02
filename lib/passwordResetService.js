// Servicio de gestion de tokens de reseteo de contraseña (MongoDB + fallback)
const crypto = require('crypto');
const db = require('./db');
const PasswordResetToken = require('./schema/PasswordResetToken');
const fallbackStore = require('./passwordResetFallback');

let useFallback = false;

async function ensureConnection() {
  if (useFallback) return;
  try {
    await db.connect();
    useFallback = false;
  } catch (err) {
    console.warn('MongoDB unavailable for password reset tokens, using file-based fallback');
    useFallback = true;
  }
}

function getTokenTTL() {
  const envValue = parseInt(process.env.PASSWORD_RESET_TTL_MS, 10);
  if (!Number.isNaN(envValue) && envValue > 0) return envValue;
  return 60 * 60 * 1000; // default 1 hour
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function createResetTokenForUser(userId, meta = {}) {
  if (!userId) throw new Error('userId is required to create reset token');
  await ensureConnection();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + getTokenTTL());

  if (useFallback) {
    await fallbackStore.deleteTokensForUser(String(userId));
    const record = await fallbackStore.createToken({
      userId: String(userId),
      tokenHash,
      expiresAt,
      meta
    });
    return { token, expiresAt: new Date(record.expiresAt) };
  }

  await PasswordResetToken.deleteMany({ userId });
  await PasswordResetToken.create({
    userId,
    tokenHash,
    expiresAt,
    requestedFromIP: meta.ip || null,
    userAgent: meta.userAgent || null
  });

  return { token, expiresAt };
}

async function findValidToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  await ensureConnection();

  if (useFallback) {
    return fallbackStore.findValidToken(tokenHash);
  }

  const tokenDoc = await PasswordResetToken.findOne({ tokenHash }).lean();
  if (!tokenDoc) return null;
  if (tokenDoc.usedAt) return null;
  if (tokenDoc.expiresAt && new Date(tokenDoc.expiresAt).getTime() < Date.now()) return null;
  return tokenDoc;
}

async function markTokenUsed(tokenId) {
  if (!tokenId) return null;
  await ensureConnection();

  if (useFallback) {
    return fallbackStore.markTokenUsed(tokenId);
  }

  return PasswordResetToken.findByIdAndUpdate(tokenId, { usedAt: new Date() }, { new: true });
}

module.exports = {
  createResetTokenForUser,
  findValidToken,
  markTokenUsed
};
