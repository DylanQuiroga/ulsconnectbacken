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
    const { correoUniversitario, contrasena, nombre, rol, telefono, carrera, intereses, comuna, direccion, edad, status } = req.body || {};
    if (!correoUniversitario || !contrasena || !nombre) {
        if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(400).json({ error: 'Correo, nombre y contraseña son requeridos' });
        return res.render('signup', { error: 'Correo, nombre y contraseña son requeridos' });
    }

    // Prevent creating user immediately. Check if user already exists
    const existing = await userModel.findByCorreo(correoUniversitario);
    if (existing) {
        if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(409).json({ error: 'El usuario ya existe' });
        return res.render('signup', { error: 'El usuario ya existe' });
    }

    const user = await userModel.createUser({ correoUniversitario, contrasena, nombre, rol, telefono, carrera, intereses, comuna, direccion, edad, status });
    // Auto-login after signup
    req.session.user = { id: user._id, correoUniversitario: user.correoUniversitario, nombre: user.nombre, rol: user.rol, telefono: user.telefono, carrera: user.carrera, intereses: user.intereses, comuna: user.comuna, direccion: user.direccion, edad: user.edad, status: user.status };

    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(201).json({ ok: true });
    res.redirect('/profile');
});


// Login submit
router.post('/login', async (req, res) => {
    const { correoUniversitario, contrasena } = req.body || {};
    if (!correoUniversitario || !contrasena) {
        if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
        return res.render('login', { error: 'Correo y contraseña requeridos' });
    }


    const ok = await userModel.comparePassword(correoUniversitario, contrasena);
    if (!ok) {
        if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Correo o contraseña inválidos' });
        return res.render('login', { error: 'Correo o contraseña inválidos' });
    }

    const user = await userModel.findByCorreo(correoUniversitario);
    if (!user) {
        if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(404).json({ error: 'Usuario no encontrado' });
        return res.render('login', { error: 'Usuario no encontrado' });
    }

    req.session.user = { id: user._id, correoUniversitario: user.correoUniversitario, nombre: user.nombre, telefono: user.telefono, intereses: user.intereses || [] };
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(200).json({ ok: true });
    res.redirect('/profile');
});

// Profile (protected)
router.get('/profile', ensureAuth, (req, res) => {
    res.render('profile', { user: req.session.user });
});

// Devuelve la sesión actual (JSON) — usado por frontend
router.get('/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.status(200).json({ user: req.session.user });
    }
    return res.status(401).json({ error: 'No authenticated' });
});

// Logout: POST recomendado; GET por compatibilidad
function performLogout(req, res) {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({ error: 'Error al cerrar sesión' });
            }
            return res.redirect('/profile');
        }
        res.clearCookie('connect.sid');
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(200).json({ ok: true });
        }
        return res.redirect('/');
    });
}

router.post('/logout', (req, res) => performLogout(req, res));
router.get('/logout', (req, res) => performLogout(req, res));

module.exports = router;
