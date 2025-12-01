// Middleware y utilidades para generar y validar tokens CSRF
const crypto = require('crypto');

function generateCSRFToken() {
  return crypto.randomBytes(parseInt(process.env.CSRF_TOKEN_LENGTH) || 32).toString('hex');
}

function csrfToken(req, res, next) {
  // Valida que la sesion exista antes de seguir
  if (!req.session) {
    console.warn('Session no inicializada para middleware CSRF');
    return next();
  }

  // Genera token CSRF si no existe en la sesion
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }

  res.locals.csrfToken = req.session.csrfToken;

  // Guarda en cookie para que el frontend pueda leerlo
  res.cookie('XSRF-TOKEN', req.session.csrfToken, {
    httpOnly: false, // false para que JavaScript pueda leerla
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  });

  next();
}

function validateCSRFToken(req, res, next) {
  // Valida que la sesion exista antes de revisar token
  if (!req.session) {
    console.warn('Session no inicializada para validacion CSRF');
    return res.status(403).json({ message: 'Session no inicializada' });
  }

  const sessionToken = req.session.csrfToken;
  const requestToken = req.body._csrf || req.headers['x-csrf-token'];

  console.log('Validando CSRF:', {
    sessionToken: sessionToken ? `${sessionToken.substring(0, 10)}...` : 'none',
    requestToken: requestToken ? `${requestToken.substring(0, 10)}...` : 'none'
  });

  if (!sessionToken || !requestToken || sessionToken !== requestToken) {
    return res.status(403).json({ message: 'CSRF token invalido o ausente' });
  }
  next();
}

module.exports = { generateCSRFToken, csrfToken, validateCSRFToken };
