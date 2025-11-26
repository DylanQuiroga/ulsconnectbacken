// Session-based auth guard with blocked-account detection
const userModel = require('../lib/userModel');

module.exports = async function ensureAuth(req, res, next) {
  const sessionUser = req.session && req.session.user;
  const expectsJson = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json'));

  if (!sessionUser || !sessionUser.id) {
    if (expectsJson) return res.status(401).json({ message: 'Unauthorized' });
    return res.redirect('/login');
  }

  try {
    const fresh = await userModel.findById(sessionUser.id);
    if (!fresh) {
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }
      return expectsJson ? res.status(401).json({ message: 'Unauthorized' }) : res.redirect('/login');
    }

    if (fresh.bloqueado) {
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }
      return res.status(403).json({ message: 'Cuenta bloqueada' });
    }

    return next();
  } catch (err) {
    return res.status(503).json({ message: 'Service unavailable - auth check failed' });
  }
};
