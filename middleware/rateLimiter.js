// Limitador de tasa para endpoints de autenticacion
const rateLimit = require('express-rate-limit');

// Login/Signup: 5 solicitudes cada 15 minutos por IP (configurable por ENV)
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5,
  message: 'Demasiados intentos. Intenta mas tarde.',
  standardHeaders: true, // Expone info en encabezados RateLimit-*
  legacyHeaders: false, // Desactiva encabezados X-RateLimit-*
  skip: (req) => process.env.NODE_ENV === 'test', // No limitar en modo test
  keyGenerator: (req) => req.ip || req.connection.remoteAddress // Usa la IP
});

module.exports = { authLimiter };
