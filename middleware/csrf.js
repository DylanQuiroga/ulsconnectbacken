// CSRF token generation and validation utilities
const crypto = require('crypto');

function generateCSRFToken() {
  return crypto.randomBytes(parseInt(process.env.CSRF_TOKEN_LENGTH) || 32).toString('hex');
}

function csrfToken(req, res, next) {
  // Guard: ensure session exists (if not, skip CSRF for this request)
  if (!req.session) {
    console.warn('⚠️  Session not initialized for CSRF middleware');
    return next();
  }
  
  // Generate CSRF token if not exists in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function validateCSRFToken(req, res, next) {
  // Guard: ensure session exists
  if (!req.session) {
    console.warn('⚠️  Session not initialized for CSRF validation');
    return res.status(403).json({ message: 'Session no inicializada' });
  }
  
  const sessionToken = req.session.csrfToken;
  const requestToken = req.body._csrf || req.headers['x-csrf-token'];

  if (!sessionToken || !requestToken || sessionToken !== requestToken) {
    return res.status(403).json({ message: 'CSRF token inválido o ausente' });
  }
  next();
}

module.exports = { generateCSRFToken, csrfToken, validateCSRFToken };
