// Rutas para gestionar solicitudes de registro de estudiantes
const express = require('express');
const router = express.Router();
const path = require('path');
const { body, param, validationResult } = require('express-validator');
const RegistrationRequest = require(path.join(__dirname, '..', 'lib', 'schema', 'RegistrationRequest'));
const ensureAuth = require('../middleware/ensureAuth');
const ensureRole = require('../middleware/ensureRole');
const { validateCSRFToken } = require('../middleware/csrf');
const userModel = require('../lib/userModel');
const { sendRegistrationRequestNotification, sendRegistrationApprovedNotification, sendRegistrationRejectedNotification } = require('../lib/emailService');

// Dominios de correo permitidos
// Allowed institutional email domains
const ALLOWED_DOMAINS = ['userena.cl', 'alumnouls.cl'];

// Valida que el correo pertenezca a los dominios institucionales
function isInstitutionalEmail(email) {
  const domain = email.split('@')[1];
  return ALLOWED_DOMAINS.includes(domain);
}

router.post('/request', [
  body('correoUniversitario').isEmail().withMessage('Correo inválido').custom(email => {
    if (!isInstitutionalEmail(email)) {
      throw new Error('Solo correos @userena.cl o @alumnouls.cl son permitidos');
    }
    return true;
  }),
  body('contrasena').isLength({ min: 6 }).withMessage('Contraseña mínima 6 caracteres'),
  body('nombre').isString().notEmpty().withMessage('Nombre requerido')
// Solicitud de registro de estudiante (queda pendiente hasta aprobacion de admin/staff)
  // Solicitud de registro de estudiante (queda pendiente hasta aprobacion de admin/staff)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { correoUniversitario, contrasena, nombre, telefono, carrera, intereses, comuna, direccion, edad, status } = req.body;
  try {
    const existing = await userModel.findByCorreo(correoUniversitario);
    if (existing) return res.status(409).json({ message: 'Usuario ya registrado' });

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

    sendRegistrationRequestNotification(reqDoc);

    res.status(201).json({ message: 'Solicitud enviada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creando solicitud' });
  }
});

// Admin/Staff: list pending requests
router.get('/requests', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const items = await RegistrationRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching requests' });
  }
});

router.get('/registration/requests', ensureRole(['admin', 'staff']), async (req, res) => {
  try {
    const items = await RegistrationRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching requests' });
  }
});

// Approve request
router.post('/requests/:id/approve', ensureRole(['admin', 'staff']), [param('id').isMongoId()], async (req, res) => {

// Aprobar solicitud pendiente: crea usuario y marca revisado
  // Aprobar solicitud pendiente: crea usuario y marca revisado
  const errors = validationResult(req);

  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = req.params.id;
    const reqDoc = await RegistrationRequest.findById(id);
    if (!reqDoc) return res.status(404).json({ message: 'Not found' });
    if (reqDoc.status !== 'pending') return res.status(400).json({ message: 'Request not pending' });

    const created = await userModel.createUserFromHash({
      correoUniversitario: reqDoc.correoUniversitario,
      contrasenaHash: reqDoc.contrasenaHash,
      nombre: reqDoc.nombre,
      telefono: reqDoc.telefono,
      carrera: reqDoc.carrera,
      intereses: reqDoc.intereses,
      comuna: reqDoc.comuna || '',
      direccion: reqDoc.direccion || '',
      edad: reqDoc.edad || null,
      status: reqDoc.status || ''
    });

    reqDoc.status = 'approved';
    reqDoc.reviewedBy = req.session && req.session.user ? req.session.user.id : null;
    reqDoc.reviewedAt = new Date();
    await reqDoc.save();

    sendRegistrationApprovedNotification(reqDoc.correoUniversitario, reqDoc.nombre);

    res.json({ message: 'Approved', user: { id: created._id, correoUniversitario: created.correoUniversitario } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error approving request' });
  }
});

router.post('/registration/requests/:id/approve', ensureRole(['admin', 'staff']), [param('id').isMongoId()], async (req, res) => {
  // duplicate of approve handler:
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = req.params.id;
    const reqDoc = await RegistrationRequest.findById(id);
    if (!reqDoc) return res.status(404).json({ message: 'Not found' });
    if (reqDoc.status !== 'pending') return res.status(400).json({ message: 'Request not pending' });

    const created = await userModel.createUserFromHash({
      correoUniversitario: reqDoc.correoUniversitario,
      contrasenaHash: reqDoc.contrasenaHash,
      nombre: reqDoc.nombre,
      telefono: reqDoc.telefono,
      carrera: reqDoc.carrera,
      intereses: reqDoc.intereses,
      comuna: reqDoc.comuna || '',
      direccion: reqDoc.direccion || '',
      edad: reqDoc.edad || null,
      status: reqDoc.status || ''
    });

    reqDoc.status = 'approved';
    reqDoc.reviewedBy = req.session && req.session.user ? req.session.user.id : null;
    reqDoc.reviewedAt = new Date();
    await reqDoc.save();

    sendRegistrationApprovedNotification(reqDoc.correoUniversitario, reqDoc.nombre);

    res.json({ message: 'Approved', user: { id: created._id, correoUniversitario: created.correoUniversitario } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error approving request' });
  }
});

// Rechazar solicitud pendiente: registra nota y envia aviso
// Reject request
router.post('/requests/:id/reject', ensureRole(['admin', 'staff']), [param('id').isMongoId(), body('notes').optional().isString()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = req.params.id;
    const reqDoc = await RegistrationRequest.findById(id);
    if (!reqDoc) return res.status(404).json({ message: 'Not found' });
    if (reqDoc.status !== 'pending') return res.status(400).json({ message: 'Request not pending' });

    reqDoc.status = 'rejected';
    reqDoc.reviewedBy = req.session && req.session.user ? req.session.user.id : null;
    reqDoc.reviewedAt = new Date();
    reqDoc.reviewNotes = req.body.notes || '';
    await reqDoc.save();

    sendRegistrationRejectedNotification(reqDoc.correoUniversitario, reqDoc.nombre, req.body.notes);

    res.json({ message: 'Rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error rejecting request' });
  }
});

router.post('/registration/requests/:id/reject', ensureRole(['admin', 'staff']), [param('id').isMongoId(), body('notes').optional().isString()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = req.params.id;
    const reqDoc = await RegistrationRequest.findById(id);
    if (!reqDoc) return res.status(404).json({ message: 'Not found' });
    if (reqDoc.status !== 'pending') return res.status(400).json({ message: 'Request not pending' });

    reqDoc.status = 'rejected';
    reqDoc.reviewedBy = req.session && req.session.user ? req.session.user.id : null;
    reqDoc.reviewedAt = new Date();
    reqDoc.reviewNotes = req.body.notes || '';
    await reqDoc.save();

    sendRegistrationRejectedNotification(reqDoc.correoUniversitario, reqDoc.nombre, req.body.notes);

    res.json({ message: 'Rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error rejecting request' });
  }
});

module.exports = router;