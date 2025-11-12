// CSRF token generation and validation utilities
const crypto = require('crypto');

function generateCSRFToken() {
  return crypto.randomBytes(parseInt(process.env.CSRF_TOKEN_LENGTH) || 32).toString('hex');
}

function csrfToken(req, res, next) {
  // Generate CSRF token if not exists in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function validateCSRFToken(req, res, next) {
  const sessionToken = req.session.csrfToken;
  const requestToken = req.body._csrf || req.headers['x-csrf-token'];

  if (!sessionToken || !requestToken || sessionToken !== requestToken) {
    return res.status(403).json({ message: 'CSRF token inválido o ausente' });
  }
  next();
}

module.exports = { generateCSRFToken, csrfToken, validateCSRFToken };
