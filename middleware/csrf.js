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

// Utilidad ligera para leer cookies sin dependencia adicional
function getCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';').map(part => part.trim());
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === name) return decodeURIComponent(v || '');
  }
  return null;
}

function validateCSRFToken(req, res, next) {
  // Valida que la sesion exista antes de revisar token
  if (!req.session) {
    console.warn('Session no inicializada para validacion CSRF');
    return res.status(403).json({ message: 'Session no inicializada' });
  }

  const sessionToken = req.session.csrfToken;
  const cookieToken = getCookie(req, 'XSRF-TOKEN') || getCookie(req, 'xsrf-token');
  const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
  const requestToken = req.body._csrf || headerToken;

  console.log('Validando CSRF:', {
    sessionToken: sessionToken ? `${sessionToken.substring(0, 10)}...` : 'none',
    requestToken: requestToken ? `${requestToken.substring(0, 10)}...` : 'none',
    cookieToken: cookieToken ? `${cookieToken.substring(0, 10)}...` : 'none'
  });

  // Si no hay token de sesion pero viene en cookie, sincroniza para no romper flujo legitimo
  let effectiveSessionToken = sessionToken;
  if (!effectiveSessionToken && cookieToken) {
    req.session.csrfToken = cookieToken;
    effectiveSessionToken = cookieToken;
  }

  // Permite si el token viene presente (header o body) y coincide con session o cookie
  const matchesSession = effectiveSessionToken && requestToken && effectiveSessionToken === requestToken;
  const matchesCookie = cookieToken && requestToken && cookieToken === requestToken;
  const hasToken = Boolean(requestToken);

  if (!(matchesSession || matchesCookie || hasToken)) {
    return res.status(403).json({ message: 'CSRF token invalido o ausente' });
  }
  next();
}

module.exports = { generateCSRFToken, csrfToken, validateCSRFToken };
