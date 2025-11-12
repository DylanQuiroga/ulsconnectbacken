const express = require('express');
const router = express.Router();
const path = require('path');
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));

// Helper to protect routes
function ensureAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.redirect('/login');
}

// Signup form
router.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

// Signup submit
router.post('/signup', async (req, res) => {
    const { correoUniversitario, contrasena, nombre } = req.body || {};
    if (!correoUniversitario || !contrasena || !nombre) return res.render('signup', { error: 'Correo, nombre y contraseña son requeridos' });

    const existing = await userModel.findByCorreo(correoUniversitario);
    if (existing) return res.render('signup', { error: 'El usuario ya existe' });

    const user = await userModel.createUser({ correoUniversitario, contrasena, nombre });
    // Auto-login after signup
    req.session.user = { id: user._id, correoUniversitario: user.correoUniversitario, nombre: user.nombre };
    res.redirect('/profile');
});

// Login form
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Login submit
router.post('/login', async (req, res) => {
    const { correoUniversitario, contrasena } = req.body || {};
    if (!correoUniversitario || !contrasena) return res.render('login', { error: 'Correo y contraseña requeridos' });

    const ok = await userModel.comparePassword(correoUniversitario, contrasena);
    if (!ok) return res.render('login', { error: 'Correo o contraseña inválidos' });

    const user = await userModel.findByCorreo(correoUniversitario);
    req.session.user = { id: user._id, correoUniversitario: user.correoUniversitario, nombre: user.nombre };
    res.redirect('/profile');
});

// Profile (protected)
router.get('/profile', ensureAuth, (req, res) => {
    res.render('profile', { user: req.session.user });
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        res.redirect('/');
    });
});

module.exports = router;
