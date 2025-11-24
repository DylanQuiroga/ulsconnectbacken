const express = require('express');
const router = express.Router();
const path = require('path');
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const passwordResetService = require(path.join(__dirname, '..', 'lib', 'passwordResetService'));
const { sendPasswordResetEmail } = require(path.join(__dirname, '..', 'lib', 'emailService'));

// GET /signup - Returns instructions for signup (JSON API info)
router.get('/signup', (req, res) => {
    res.json({
        message: 'Para registrarse, envíe un POST a /signup con correoUniversitario, contrasena, nombre, y opcionalmente telefono, carrera, intereses, comuna, direccion, edad, status',
        endpoint: 'POST /signup',
        requiredFields: ['correoUniversitario', 'contrasena', 'nombre'],
        optionalFields: ['telefono', 'carrera', 'intereses', 'comuna', 'direccion', 'edad', 'status']
    });
});

// POST /signup - Submit registration request for admin approval
router.post('/signup', async (req, res) => {
    const { correoUniversitario, contrasena, nombre, telefono, carrera, intereses, comuna, direccion, edad, status } = req.body || {};

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
        const RegistrationRequest = require(path.join(__dirname, '..', 'lib', 'schema', 'RegistrationRequest'));
        const pending = await RegistrationRequest.findOne({ correoUniversitario });
        if (pending && pending.status === 'pending') {
            return res.status(409).json({ success: false, message: 'Ya existe una solicitud pendiente para este correo' });
        }

        // Hash password and create request
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(contrasena, 10);

        const reqDoc = new RegistrationRequest({
            correoUniversitario,
            contrasenaHash: hash,
            nombre,
            telefono: telefono || null,
            carrera: carrera || '',
            intereses: intereses || [],
            comuna: comuna || '',
            direccion: direccion || '',
            edad: edad || null,
            // ensure valid enum value when not provided
            status: status || 'pending'
        });
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
        message: 'Para iniciar sesión, envíe un POST a /login con correoUniversitario y contrasena',
        endpoint: 'POST /login',
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

// POST /password/forgot - Start password reset flow
router.post('/password/forgot', async (req, res) => {
    const { correoUniversitario } = req.body || {};
    if (!correoUniversitario) {
        return res.status(400).json({ success: false, message: 'Correo requerido' });
    }

    try {
        const user = await userModel.findByCorreo(correoUniversitario);

        if (user) {
            const meta = { ip: req.ip, userAgent: req.headers['user-agent'] || null };
            const { token, expiresAt } = await passwordResetService.createResetTokenForUser(user._id, meta);
            await sendPasswordResetEmail({
                email: user.correoUniversitario,
                nombre: user.nombre,
                token,
                expiresAt
            });
        }

        res.json({
            success: true,
            message: 'Si el correo esta registrado recibiras un enlace de recuperacion'
        });
    } catch (err) {
        console.error('Password reset request error:', err);
        res.status(500).json({ success: false, message: 'No se pudo procesar la solicitud', error: err.message });
    }
});

// POST /password/reset - Complete password reset
router.post('/password/reset', async (req, res) => {
    const { token, contrasena } = req.body || {};
    if (!token || !contrasena) {
        return res.status(400).json({ success: false, message: 'Token y nueva contrasena son requeridos' });
    }
    if (contrasena.length < 8) {
        return res.status(400).json({ success: false, message: 'La contrasena debe tener al menos 8 caracteres' });
    }

    try {
        const tokenRecord = await passwordResetService.findValidToken(token);
        if (!tokenRecord) {
            return res.status(400).json({ success: false, message: 'Token invalido o expirado' });
        }

        const userId = tokenRecord.userId || tokenRecord.user || tokenRecord.usuarioId;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'Token invalido' });
        }

        await userModel.updatePassword(userId, contrasena);
        await passwordResetService.markTokenUsed(tokenRecord._id);

        res.json({ success: true, message: 'Contrasena actualizada correctamente' });
    } catch (err) {
        console.error('Password reset error:', err);
        res.status(500).json({ success: false, message: 'No se pudo restablecer la contrasena', error: err.message });
    }
});

// GET /profile - Get current user profile (protected)
router.get('/profile', ensureAuth, (req, res) => {
    res.json({
        success: true,
        user: req.session.user
    });
});

// PUT /profile - Update current user profile (protected)
router.put('/profile', ensureAuth, async (req, res) => {
    const sessionUser = req.session && req.session.user ? req.session.user : null;
    if (!sessionUser || !sessionUser.id) {
        return res.status(401).json({ success: false, message: 'Sesion no disponible' });
    }

    const { nombre, telefono, carrera, intereses, comuna, direccion, edad, status } = req.body || {};
    const updates = {};

    if (nombre !== undefined) {
        if (typeof nombre !== 'string' || !nombre.trim()) {
            return res.status(400).json({ success: false, message: 'El nombre debe ser una cadena no vacia' });
        }
        updates.nombre = nombre.trim();
    }

    if (telefono !== undefined) {
        if (telefono !== null && typeof telefono !== 'string') {
            return res.status(400).json({ success: false, message: 'El telefono debe ser texto o null' });
        }
        updates.telefono = telefono === null ? null : telefono.trim();
    }

    if (carrera !== undefined) {
        if (carrera !== null && typeof carrera !== 'string') {
            return res.status(400).json({ success: false, message: 'La carrera debe ser texto o null' });
        }
        updates.carrera = carrera === null ? '' : carrera.trim();
    }

    if (intereses !== undefined) {
        let normalizedIntereses = [];
        if (Array.isArray(intereses)) {
            normalizedIntereses = intereses
                .filter(item => typeof item === 'string')
                .map(item => item.trim())
                .filter(Boolean);
        } else if (typeof intereses === 'string') {
            normalizedIntereses = intereses
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
        } else if (intereses === null) {
            normalizedIntereses = [];
        } else {
            return res.status(400).json({ success: false, message: 'Los intereses deben ser una lista o cadena' });
        }
        updates.intereses = normalizedIntereses;
    }

    if (comuna !== undefined) {
        if (comuna !== null && typeof comuna !== 'string') {
            return res.status(400).json({ success: false, message: 'La comuna debe ser texto o null' });
        }
        updates.comuna = comuna === null ? '' : comuna.trim();
    }

    if (direccion !== undefined) {
        if (direccion !== null && typeof direccion !== 'string') {
            return res.status(400).json({ success: false, message: 'La direccion debe ser texto o null' });
        }
        updates.direccion = direccion === null ? '' : direccion.trim();
    }

    if (edad !== undefined) {
        if (edad !== null && (typeof edad !== 'number' || edad < 0)) {
            return res.status(400).json({ success: false, message: 'La edad debe ser un numero positivo o null' });
        }
        updates.edad = edad;
    }

    if (status !== undefined) {
        if (status !== null && typeof status !== 'string') {
            return res.status(400).json({ success: false, message: 'El status debe ser texto o null' });
        }
        updates.status = status === null ? '' : status.trim();
    }

    if (!Object.keys(updates).length) {
        return res.status(400).json({ success: false, message: 'No se enviaron datos para actualizar' });
    }

    try {
        const updatedUser = await userModel.updateProfile(sessionUser.id, updates);
        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        req.session.user = {
            id: updatedUser._id ? updatedUser._id.toString() : sessionUser.id,
            correoUniversitario: updatedUser.correoUniversitario || sessionUser.correoUniversitario,
            nombre: updatedUser.nombre,
            role: updatedUser.rol || updatedUser.role || sessionUser.role || 'estudiante',
            telefono: updatedUser.telefono || null,
            carrera: updatedUser.carrera || '',
            intereses: Array.isArray(updatedUser.intereses) ? updatedUser.intereses : [],
            comuna: updatedUser.comuna || '',
            direccion: updatedUser.direccion || '',
            edad: updatedUser.edad || null,
            status: updatedUser.status || ''
        };

        res.json({
            success: true,
            message: 'Perfil actualizado correctamente',
            user: req.session.user
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ success: false, message: 'No se pudo actualizar el perfil', error: err.message });
    }
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

