const express = require('express');
const router = express.Router();
const path = require('path');
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));

// GET /signup - Returns instructions for signup (JSON API info)
router.get('/signup', (req, res) => {
    res.json({
        message: 'Para registrarse, envíe un POST a /auth/signup con correoUniversitario, contrasena, nombre, y opcionalmente telefono, carrera, intereses',
        endpoint: 'POST /auth/signup',
        requiredFields: ['correoUniversitario', 'contrasena', 'nombre'],
        optionalFields: ['telefono', 'carrera', 'intereses']
    });
});

// POST /signup - Submit registration request for admin approval
router.post('/signup', async (req, res) => {
    const { correoUniversitario, contrasena, nombre, telefono, carrera, intereses } = req.body || {};
    
    // Validate required fields
    if (!correoUniversitario || !contrasena || !nombre) {
        return res.status(400).json({ success: false, message: 'Correo, nombre y contraseña son requeridos' });
    }

    try {
        // Prevent creating user immediately. Check if user already exists
        const existing = await userModel.findByCorreo(correoUniversitario);
        if (existing) {
            return res.status(409).json({ success: false, message: 'El usuario ya existe' });
        }

        // Check for existing pending request
        const RegistrationRequest = require(path.join(__dirname, '..', 'lib', 'models', 'RegistrationRequest'));
        const pending = await RegistrationRequest.findOne({ correoUniversitario });
        if (pending && pending.status === 'pending') {
            return res.status(409).json({ success: false, message: 'Ya existe una solicitud pendiente para este correo' });
        }

        // Hash password and create request
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(contrasena, 10);

        const reqDoc = new RegistrationRequest({ correoUniversitario, contrasenaHash: hash, nombre, telefono: telefono || null, carrera: carrera || '', intereses: intereses || [] });
        await reqDoc.save();

        res.status(201).json({ success: true, message: 'Solicitud de registro enviada. Un administrador revisará su cuenta.', registrationRequestId: reqDoc._id });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, message: 'Error en el registro', error: err.message });
    }
});

// GET /login - Returns instructions for login (JSON API info)
router.get('/login', (req, res) => {
    res.json({
        message: 'Para iniciar sesión, envíe un POST a /auth/login con correoUniversitario y contrasena',
        endpoint: 'POST /auth/login',
        requiredFields: ['correoUniversitario', 'contrasena']
    });
});

// POST /login - Submit login credentials
router.post('/login', async (req, res) => {
    const { correoUniversitario, contrasena } = req.body || {};
    
    if (!correoUniversitario || !contrasena) {
        return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos' });
    }

    try {
        const ok = await userModel.comparePassword(correoUniversitario, contrasena);
        if (!ok) {
            return res.status(401).json({ success: false, message: 'Correo o contraseña inválidos' });
        }

        const user = await userModel.findByCorreo(correoUniversitario);
        req.session.user = { 
            id: user._id, 
            correoUniversitario: user.correoUniversitario, 
            nombre: user.nombre, 
            role: user.rol || user.role || 'estudiante' 
        };
        
        res.json({ 
            success: true, 
            message: 'Sesión iniciada correctamente', 
            user: req.session.user 
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Error en inicio de sesión', error: err.message });
    }
});

// GET /profile - Get current user profile (protected)
router.get('/profile', ensureAuth, (req, res) => {
    res.json({ 
        success: true, 
        user: req.session.user 
    });
});

// GET /logout - Destroy session
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error cerrando sesión', error: err.message });
        }
        res.json({ success: true, message: 'Sesión cerrada correctamente' });
    });
});

module.exports = router;
