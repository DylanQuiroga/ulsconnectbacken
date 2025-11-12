// Rate limiting for authentication endpoints
const rateLimit = require('express-rate-limit');

// Login/Signup limiter: 5 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5,
  message: 'Demasiados intentos. Intenta más tarde.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => process.env.NODE_ENV === 'test', // Skip rate limiting in test mode
  keyGenerator: (req) => req.ip || req.connection.remoteAddress // Use IP address
});

module.exports = { authLimiter };
