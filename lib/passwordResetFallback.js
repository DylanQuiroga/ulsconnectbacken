const fs = require('fs-extra');
const path = require('path');

const TOKENS_FILE = path.join(__dirname, '..', '.dev-reset-tokens.json');

async function readTokens() {
  try {
    const exists = await fs.pathExists(TOKENS_FILE);
    if (!exists) return [];
    const payload = await fs.readJson(TOKENS_FILE);
    return Array.isArray(payload) ? payload : [];
  } catch (err) {
    return [];
  }
}

async function writeTokens(tokens) {
  await fs.outputJson(TOKENS_FILE, tokens, { spaces: 2 });
}

async function deleteTokensForUser(userId) {
  const tokens = await readTokens();
  const filtered = tokens.filter(token => token.userId !== userId);
  await writeTokens(filtered);
}

async function createToken({ userId, tokenHash, expiresAt, meta = {} }) {
  const tokens = await readTokens();
  const token = {
    _id: Date.now().toString(),
    userId,
    tokenHash,
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    requestedFromIP: meta.ip || null,
    userAgent: meta.userAgent || null,
    usedAt: null,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  };
  tokens.push(token);
  await writeTokens(tokens);
  return token;
}

async function findValidToken(tokenHash) {
  const tokens = await readTokens();
  const now = Date.now();
  return tokens.find(token => {
    if (token.tokenHash !== tokenHash) return false;
    if (token.usedAt) return false;
    if (token.expiresAt && new Date(token.expiresAt).getTime() < now) return false;
    return true;
  }) || null;
}

async function markTokenUsed(tokenId) {
  const tokens = await readTokens();
  const idx = tokens.findIndex(token => token._id === tokenId);
  if (idx === -1) return null;
  tokens[idx].usedAt = new Date().toISOString();
  tokens[idx].actualizadoEn = new Date().toISOString();
  await writeTokens(tokens);
  return tokens[idx];
}

module.exports = {
  createToken,
  findValidToken,
  deleteTokensForUser,
  markTokenUsed
};
