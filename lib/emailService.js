// Email service for sending notifications
const nodemailer = require('nodemailer');

let transporter = null;

async function initEmailService() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  
  // Skip if email config is empty (development without email)
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️  Email service not configured. Notifications will be skipped.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 587,
    secure: (SMTP_PORT == 465), // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  // Verify connection
  try {
    await transporter.verify();
    console.log('✅ Email service initialized');
  } catch (err) {
    console.warn('⚠️  Email service verification failed:', err.message);
  }

  return transporter;
}

async function sendRegistrationRequestNotification(registrationRequest) {
  if (!transporter) return;

  try {
    const { correoUniversitario, nombre } = registrationRequest;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ulsconnect.dev';

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ulsconnect.dev',
      to: adminEmail,
      subject: `Nueva solicitud de registro: ${nombre}`,
      html: `
        <h2>Nueva solicitud de registro</h2>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Correo:</strong> ${correoUniversitario}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
        <p>Revisa la solicitud en el panel de administración.</p>
      `
    });
    console.log(`📧 Registration notification sent to ${adminEmail}`);
  } catch (err) {
    console.error('❌ Error sending email:', err.message);
  }
}

async function sendRegistrationApprovedNotification(email, nombre) {
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ulsconnect.dev',
      to: email,
      subject: 'Tu solicitud de registro ha sido aprobada',
      html: `
        <h2>¡Bienvenido ${nombre}!</h2>
        <p>Tu solicitud de registro ha sido aprobada.</p>
        <p>Ya puedes iniciar sesión con tus credenciales.</p>
        <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/login">Iniciar sesión</a></p>
      `
    });
    console.log(`📧 Approval notification sent to ${email}`);
  } catch (err) {
    console.error('❌ Error sending email:', err.message);
  }
}

async function sendRegistrationRejectedNotification(email, nombre, notes) {
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ulsconnect.dev',
      to: email,
      subject: 'Tu solicitud de registro ha sido rechazada',
      html: `
        <h2>Solicitud rechazada</h2>
        <p>Lamentablemente, tu solicitud de registro ha sido rechazada.</p>
        ${notes ? `<p><strong>Razón:</strong> ${notes}</p>` : ''}
        <p>Si tienes preguntas, contacta con administración.</p>
      `
    });
    console.log(`📧 Rejection notification sent to ${email}`);
  } catch (err) {
    console.error('❌ Error sending email:', err.message);
  }
}

async function sendActivityClosedNotification(email, nombre, actividadTitulo, motivo) {
  if (!transporter) return;

  try {
    let razon = 'La fecha de cierre ha sido alcanzada';
    if (motivo === 'cupo_completo') {
      razon = 'El cupo de la actividad se ha completado';
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ulsconnect.dev',
      to: email,
      subject: `Convocatoria cerrada: ${actividadTitulo}`,
      html: `
        <h2>Convocatoria cerrada</h2>
        <p>Hola ${nombre},</p>
        <p>La convocatoria para la actividad <strong>${actividadTitulo}</strong> ha sido cerrada.</p>
        <p><strong>Razón:</strong> ${razon}</p>
        <p>No se aceptarán más inscripciones para esta actividad.</p>
        <p>Si tienes alguna pregunta, contacta con administración.</p>
      `
    });
    console.log(`📧 Activity closed notification sent to ${email}`);
  } catch (err) {
    console.error('❌ Error sending email:', err.message);
  }
}

async function sendPasswordResetEmail({ email, nombre, token, expiresAt }) {
  if (!transporter) return;

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ulsconnect.dev',
      to: email,
      subject: 'Instrucciones para restablecer tu contrasena',
      html: `
        <h2>Hola ${nombre || 'voluntario'}</h2>
        <p>Recibimos una solicitud para restablecer tu contrasena.</p>
        <p>Haz clic en el siguiente enlace o copialo en tu navegador:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Este enlace expirara el ${new Date(expiresAt).toLocaleString()}.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `
    });
    console.log(`Password reset instructions sent to ${email}`);
  } catch (err) {
    console.error('Error sending password reset email:', err.message);
  }
}

module.exports = { 
  initEmailService, 
  sendRegistrationRequestNotification,
  sendRegistrationApprovedNotification,
  sendRegistrationRejectedNotification,
  sendActivityClosedNotification,
  sendPasswordResetEmail
};
