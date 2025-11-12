// Simple session-based auth guard
module.exports = function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // If request expects JSON, return 401, otherwise redirect to login
  if (req.xhr || req.get('Accept') && req.get('Accept').includes('application/json')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return res.redirect('/login');
};
