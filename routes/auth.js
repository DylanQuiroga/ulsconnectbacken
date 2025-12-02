// Rutas de autenticacion y gestion de perfil
const express = require('express');
const router = express.Router();
const path = require('path');
const userModel = require(path.join(__dirname, '..', 'lib', 'userModel'));
const ensureAuth = require(path.join(__dirname, '..', 'middleware', 'ensureAuth'));
const passwordResetService = require(path.join(__dirname, '..', 'lib', 'passwordResetService'));
const { sendPasswordResetEmail } = require(path.join(__dirname, '..', 'lib', 'emailService'));

// GET /signup - Resumen de uso de la ruta de registro
router.get('/signup', (req, res) => {
    res.json({
        message: 'Para registrarse, envie un POST a /signup con correoUniversitario, contrasena, nombre y opcionalmente telefono, carrera, intereses, comuna, direccion, edad, status',
        endpoint: 'POST /signup',
        requiredFields: ['correoUniversitario', 'contrasena', 'nombre'],
        optionalFields: ['telefono', 'carrera', 'intereses', 'comuna', 'direccion', 'edad', 'status']
    });
});

// Dominios de correo permitidos
const ALLOWED_DOMAINS = ['userena.cl', 'alumnouls.cl'];

function isInstitutionalEmail(email) {
    const domain = email.split('@')[1] || '';
    return ALLOWED_DOMAINS.includes(domain);
}

// POST /signup - Crea una solicitud de registro para aprobacion
router.post('/signup', async (req, res) => {
    const { correoUniversitario, contrasena, nombre, telefono, carrera, intereses, comuna, direccion, edad, status } = req.body || {};

    if (!correoUniversitario || !contrasena || !nombre) {
        return res.status(400).json({ success: false, message: 'Correo, nombre y contrasena son requeridos' });
    }

    if (!isInstitutionalEmail(correoUniversitario)) {
        return res.status(400).json({ success: false, message: 'Solo correos @userena.cl o @alumnouls.cl son permitidos' });
    }

    try {
        const existing = await userModel.findByCorreo(correoUniversitario);
        if (existing) {
            return res.status(409).json({ success: false, message: 'El usuario ya existe' });
        }

        const RegistrationRequest = require(path.join(__dirname, '..', 'lib', 'schema', 'RegistrationRequest'));
        const pending = await RegistrationRequest.findOne({ correoUniversitario });
        if (pending && pending.status === 'pending') {
            return res.status(409).json({ success: false, message: 'Ya existe una solicitud pendiente para este correo' });
        }

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
            status: status || 'pending'
        });
        await reqDoc.save();

        res.status(201).json({ success: true, message: 'Solicitud de registro enviada. Un administrador revisara su cuenta.', registrationRequestId: reqDoc._id });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, message: 'Error en el registro', error: err.message });
    }
});

// GET /login - Resumen de uso de la ruta de login
router.get('/login', (req, res) => {
    res.json({
        message: 'Para iniciar sesion, envie un POST a /login con correoUniversitario y contrasena',
        endpoint: 'POST /login',
        requiredFields: ['correoUniversitario', 'contrasena']
    });
});

// POST /login - Inicia sesion
router.post('/login', async (req, res) => {
    const { correoUniversitario, contrasena } = req.body || {};

    if (!correoUniversitario || !contrasena) {
        return res.status(400).json({ success: false, message: 'Correo y contrasena requeridos' });
    }

    try {
        const user = await userModel.findByCorreo(correoUniversitario);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Correo o contrasena invalidos' });
        }

        if (user.bloqueado) {
            return res.status(403).json({ success: false, message: 'La cuenta esta bloqueada, contacte al administrador' });
        }

        const ok = await userModel.comparePassword(correoUniversitario, contrasena);
        if (!ok) {
            return res.status(401).json({ success: false, message: 'Correo o contrasena invalidos' });
        }

        req.session.user = {
            id: user._id,
            correoUniversitario: user.correoUniversitario,
            nombre: user.nombre,
            role: user.rol || user.role || 'estudiante',
            telefono: user.telefono || null,
            carrera: user.carrera || '',
            intereses: Array.isArray(user.intereses) ? user.intereses : [],
            comuna: user.comuna || '',
            direccion: user.direccion || '',
            edad: user.edad || null,
            status: user.status || ''
        };

        res.json({
            success: true,
            message: 'Sesion iniciada correctamente',
            user: req.session.user
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Error en inicio de sesion', error: err.message });
    }
});

// POST /password/forgot - Inicia flujo de recuperacion de contrasena
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

// POST /password/reset - Completa el reseteo de contrasena
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

// GET /profile - Obtiene el perfil del usuario autenticado
router.get('/profile', ensureAuth, async (req, res) => {
    try {
        const user = await userModel.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        req.session.user = {
            id: user._id,
            correoUniversitario: user.correoUniversitario,
            nombre: user.nombre,
            role: user.rol || user.role || 'estudiante',
            telefono: user.telefono || null,
            carrera: user.carrera || '',
            intereses: Array.isArray(user.intereses) ? user.intereses : [],
            comuna: user.comuna || '',
            direccion: user.direccion || '',
            edad: user.edad || null,
            status: user.status || ''
        };

        res.json({
            success: true,
            user: req.session.user
        });
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ success: false, message: 'Error al obtener perfil', error: err.message });
    }
});

// PUT /profile - Actualiza el perfil del usuario autenticado
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

// GET /logout - Cierra sesion
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error cerrando sesion', error: err.message });
        }
        res.json({ success: true, message: 'Sesion cerrada correctamente' });
    });
});

module.exports = router;
