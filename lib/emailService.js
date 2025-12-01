// Servicio de correo para enviar notificaciones (registro, cierre de actividad, reset de contraseña)
const nodemailer = require('nodemailer');

let transporter = null;

async function initEmailService() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  // Omitir si no hay configuracion de correo (entornos de desarrollo)
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('Email service no configurado. Notificaciones se omitiran.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10) || 587,
    secure: Number(SMTP_PORT) === 465, // true para 465, false para otros puertos
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  try {
    await transporter.verify();
    console.log('Email service inicializado');
  } catch (err) {
    console.warn('Verificacion de email service fallo:', err.message);
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
        <p>Revisa la solicitud en el panel de administracion.</p>
      `
    });
    console.log(`Notificacion de registro enviada a ${adminEmail}`);
  } catch (err) {
    console.error('Error enviando correo de registro:', err.message);
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
        <h2>Bienvenido ${nombre}!</h2>
        <p>Tu solicitud de registro ha sido aprobada.</p>
        <p>Ya puedes iniciar sesion con tus credenciales.</p>
        <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/login">Iniciar sesion</a></p>
      `
    });
    console.log(`Notificacion de aprobacion enviada a ${email}`);
  } catch (err) {
    console.error('Error enviando correo de aprobacion:', err.message);
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
        ${notes ? `<p><strong>Razon:</strong> ${notes}</p>` : ''}
        <p>Si tienes preguntas, contacta con administracion.</p>
      `
    });
    console.log(`Notificacion de rechazo enviada a ${email}`);
  } catch (err) {
    console.error('Error enviando correo de rechazo:', err.message);
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
        <p><strong>Razon:</strong> ${razon}</p>
        <p>No se aceptaran mas inscripciones para esta actividad.</p>
        <p>Si tienes alguna pregunta, contacta con administracion.</p>
      `
    });
    console.log(`Notificacion de cierre enviada a ${email}`);
  } catch (err) {
    console.error('Error enviando correo de cierre:', err.message);
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
    console.log(`Instrucciones de reseteo enviadas a ${email}`);
  } catch (err) {
    console.error('Error enviando correo de reseteo:', err.message);
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
