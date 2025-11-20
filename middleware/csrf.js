const crypto = require('crypto');

function generateCSRFToken() {
  return crypto.randomBytes(parseInt(process.env.CSRF_TOKEN_LENGTH) || 32).toString('hex');
}

function csrfToken(req, res, next) {
  if (!req.session) {
    console.warn('⚠️  Session not initialized for CSRF middleware');
    return next();
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }

  // Expose to views and set a readable cookie (useful for frontends/axios)
  res.locals.csrfToken = req.session.csrfToken;
  // Cookie readable by JS so client libs (axios) pueden leerla y enviarla
  res.cookie('XSRF-TOKEN', req.session.csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  next();
}

function validateCSRFToken(req, res, next) {
  if (!req.session) {
    console.warn('⚠️  Session not initialized for CSRF validation');
    return res.status(403).json({ message: 'Session no inicializada' });
  }

  const sessionToken = req.session.csrfToken;
  const requestToken =
    (req.body && req.body._csrf) ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    req.get('x-csrf-token') ||
    (req.cookies && req.cookies['XSRF-TOKEN']);

  if (!sessionToken || !requestToken || sessionToken !== requestToken) {
    return res.status(403).json({ message: 'CSRF token inválido o ausente' });
  }
  next();
}

module.exports = { generateCSRFToken, csrfToken, validateCSRFToken };