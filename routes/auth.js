const express = require('express');
const router = express.Router();
const path = require('path');
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));

// Signup form
router.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

// Signup submit -> create registration request for admin approval
router.post('/signup', async (req, res) => {
    const { correoUniversitario, contrasena, nombre, telefono, carrera, intereses } = req.body || {};
    if (!correoUniversitario || !contrasena || !nombre) return res.render('signup', { error: 'Correo, nombre y contraseña son requeridos' });

    // Prevent creating user immediately. Check if user already exists
    const existing = await userModel.findByCorreo(correoUniversitario);
    if (existing) return res.render('signup', { error: 'El usuario ya existe' });

    // Check for existing pending request
    const RegistrationRequest = require(path.join(__dirname, '..', 'lib', 'models', 'RegistrationRequest'));
    const pending = await RegistrationRequest.findOne({ correoUniversitario });
    if (pending && pending.status === 'pending') return res.render('signup', { error: 'Ya existe una solicitud pendiente para este correo' });

    // Hash password and create request
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(contrasena, 10);

    const reqDoc = new RegistrationRequest({ correoUniversitario, contrasenaHash: hash, nombre, telefono: telefono || null, carrera: carrera || '', intereses: intereses || [] });
    await reqDoc.save();

    // Inform user that request was sent
    res.render('signup-success', { message: 'Solicitud de registro enviada. Un administrador revisará su cuenta.' });
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
    req.session.user = { id: user._id, correoUniversitario: user.correoUniversitario, nombre: user.nombre, role: user.rol || user.role || 'estudiante' };
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
