// Middleware de roles: asegura que el usuario tenga alguno de los roles permitidos
// Consulta el rol en BD para respetar cambios inmediatos y, si falla, recurre al rol en sesion
const userModel = require('../lib/userModel');

module.exports = function ensureRole(allowedRoles) {
  if (!Array.isArray(allowedRoles)) allowedRoles = [allowedRoles];
  return async function (req, res, next) {
    const sessionUser = req.session && req.session.user;

    // Always respond with JSON for consistent API behaviour
    if (!sessionUser || !sessionUser.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      // Try to read fresh user record from DB
      const fresh = await userModel.findById(sessionUser.id);
      if (fresh && fresh.bloqueado) {
        if (req.session && typeof req.session.destroy === 'function') {
          req.session.destroy(() => {});
        }
        return res.status(403).json({ message: 'Cuenta bloqueada' });
      }
      const role = fresh && (fresh.rol || fresh.role) ? (fresh.rol || fresh.role) : sessionUser.role;
      if (!role) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      if (allowedRoles.includes(role)) return next();
      return res.status(403).json({ message: 'Forbidden' });
    } catch (err) {
      // If DB is unavailable, fall back to the session-stored role
      const fallbackRole = sessionUser.role;
      if (fallbackRole && allowedRoles.includes(fallbackRole)) return next();
      return res.status(503).json({ message: 'Service unavailable - role check failed' });
    }
  };
};
