// Middleware factory to ensure the logged user has one of the allowed roles
// This implementation validates the role against the database (via lib/userModel)
// to ensure role changes are respected immediately. If DB lookup fails,
// it falls back to the role stored in session.
const userModel = require('../lib/userModel');

module.exports = function ensureRole(allowedRoles) {
  if (!Array.isArray(allowedRoles)) allowedRoles = [allowedRoles];
  return async function (req, res, next) {
    const sessionUser = req.session && req.session.user;
    const wantsJson = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json'));

    if (!sessionUser || !sessionUser.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      // Try to read fresh user record from DB
      const fresh = await userModel.findById(sessionUser.id);
      const role = fresh && (fresh.rol || fresh.role) ? (fresh.rol || fresh.role) : sessionUser.role;
      if (!role) {
        if (wantsJson) return res.status(401).json({ message: 'Unauthorized' });
        return res.redirect('/login');
      }
      if (allowedRoles.includes(role)) return next();
      if (wantsJson) return res.status(403).json({ message: 'Forbidden' });
      return res.status(403).send('Forbidden');
    } catch (err) {
      // If DB is unavailable, fall back to the session-stored role
      const fallbackRole = sessionUser.role;
      if (fallbackRole && allowedRoles.includes(fallbackRole)) return next();
      if (wantsJson) return res.status(503).json({ message: 'Service unavailable - role check failed' });
      return res.status(503).send('Service unavailable - role check failed');
    }
  };
};
