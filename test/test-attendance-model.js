require('dotenv').config();
const db = require('../lib/db');
const AttendanceModel = require('../lib/attendanceModel');
const Attendance = require('../lib/schema/Attendance');
const Inscripcion = require('../lib/schema/Inscripcion');
const Usuario = require('../lib/schema/Usuario');
const Actividad = require('../lib/schema/Actividad');
const bcrypt = require('bcryptjs');

// Datos de prueba
let testUsers = [];
let testActivity = null;
let testInscriptions = [];
let testAttendance = null;

async function setupTestData() {
  await db.connect();
  
  // Crear usuarios de prueba
  const hash = await bcrypt.hash('testpass123', 10);
  const users = [];
  for (let i = 1; i <= 3; i++) {
    const user = new Usuario({
      correoUniversitario: `test.user${i}@test.cl`,
      contrasena: hash,
      nombre: `Test User ${i}`,
      rol: 'estudiante'
    });
    await user.save();
    users.push(user);
  }
  testUsers = users;

  // Crear actividad de prueba
  const activity = new Actividad({
    titulo: `Test Activity ${Date.now()}`,
    descripcion: 'Test activity for attendance model',
    area: 'Comunidad',
    tipo: 'Taller',
    fechaInicio: new Date(Date.now() + 60 * 60 * 1000),
    fechaFin: new Date(Date.now() + 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'La Serena',
      nombreLugar: 'Test Location',
      lng: -70.601
    },
    capacidad: 25,
    estado: 'activa',
    creadoPor: testUsers[0]._id
  });
  await activity.save();
  testActivity = activity;

  // Crear inscripciones de prueba con estado 'activa'
  const inscriptions = [];
  for (const user of testUsers) {
    const inscription = new Inscripcion({
      usuario: user._id,
      actividad: activity._id,
      estado: 'activa'
    });
    await inscription.save();
    inscriptions.push(inscription);
  }
  testInscriptions = inscriptions;
}

async function cleanupTestData() {
  try {
    if (testAttendance) {
      await Attendance.findByIdAndDelete(testAttendance._id);
    }
    if (testInscriptions.length > 0) {
      await Inscripcion.deleteMany({ _id: { $in: testInscriptions.map(i => i._id) } });
    }
    if (testActivity) {
      await Actividad.findByIdAndDelete(testActivity._id);
    }
    if (testUsers.length > 0) {
      await Usuario.deleteMany({ _id: { $in: testUsers.map(u => u._id) } });
    }
  } catch (err) {
    console.error('Error en limpieza:', err.message);
  }
}

async function test_createAttendanceList() {
  console.log('\n[TEST] Crear lista de asistencia');
  try {
    const attendance = await AttendanceModel.createAttendanceList(
      testActivity._id,
      testUsers[0]._id
    );

    // Verificar que la asistencia fue creada
    if (!attendance) throw new Error('Asistencia no creada');
    if (!attendance._id) throw new Error('Asistencia sin ID');

    const actividadId = attendance.actividad._id;

    if (actividadId.toString() !== testActivity._id.toString())
      throw new Error('Mismatch en ID de actividad');
    
    // Verificar lista de inscripciones
    if (!Array.isArray(attendance.inscripciones)) 
      throw new Error('inscripciones no es un arreglo');
    if (attendance.inscripciones.length !== testUsers.length) 
      throw new Error(`Se esperaban ${testUsers.length} inscripciones, se obtuvieron ${attendance.inscripciones.length}`);

    // Verificar que todas las inscripciones tengan 'ausente' por defecto
    attendance.inscripciones.forEach((entry, index) => {
      if (entry.asistencia !== 'ausente') 
        throw new Error(`Entrada ${index} asistencia debe ser 'ausente', se obtuvo '${entry.asistencia}'`);
    });

    // Verificar registradoPor
    if (attendance.registradoPor._id.toString() !== testUsers[0]._id.toString()) 
      throw new Error('Mismatch en registradoPor');

    testAttendance = attendance;
    console.log('✓ Crear lista de asistencia exitoso');
    return true;
  } catch (err) {
    console.error('✗ Crear lista de asistencia falló:', err.message);
    return false;
  }
}

async function test_createAttendanceList_duplicate() {
  console.log('\n[TEST] Crear lista de asistencia - prevención de duplicados');
  try {
    // Intentar crear otra asistencia para la misma actividad
    const attendance2 = await AttendanceModel.createAttendanceList(
      testActivity._id,
      testUsers[0]._id
    );

    // Debe retornar la existente
    if (attendance2._id.toString() !== testAttendance._id.toString()) 
      throw new Error('Debe retornar la asistencia existente, no crear una nueva');

    console.log('✓ Prevención de duplicados exitosa');
    return true;
  } catch (err) {
    console.error('✗ Prevención de duplicados falló:', err.message);
    return false;
  }
}

async function test_takeAttendance() {
  console.log('\n[TEST] Tomar asistencia');
  try {
    const payload = {
      presentes: [testUsers[0]._id, testUsers[1]._id],
      ausentes: [testUsers[2]._id],
      justificadas: []
    };

    const updated = await AttendanceModel.takeAttendance(
      testAttendance._id,
      payload,
      testUsers[0]._id
    );

    // Verificar actualizaciones
    if (!updated) throw new Error('Asistencia actualizada no retornada');

    const user0Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[0]._id.toString());
    const user1Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[1]._id.toString());
    const user2Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[2]._id.toString());

    if (!user0Entry || user0Entry.asistencia !== 'presente') 
      throw new Error('Usuario 0 debe estar marcado como presente');
    if (!user1Entry || user1Entry.asistencia !== 'presente') 
      throw new Error('Usuario 1 debe estar marcado como presente');
    if (!user2Entry || user2Entry.asistencia !== 'ausente') 
      throw new Error('Usuario 2 debe estar marcado como ausente');

    testAttendance = updated;
    console.log('✓ Tomar asistencia exitoso');
    return true;
  } catch (err) {
    console.error('✗ Tomar asistencia falló:', err.message);
    return false;
  }
}

async function test_takeAttendance_justificada() {
  console.log('\n[TEST] Tomar asistencia con justificada');
  try {
    const payload = {
      presentes: [],
      ausentes: [],
      justificadas: [testUsers[0]._id]
    };

    const updated = await AttendanceModel.takeAttendance(
      testAttendance._id,
      payload,
      testUsers[0]._id
    );

    const user0Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[0]._id.toString());
    if (!user0Entry || user0Entry.asistencia !== 'justificada') 
      throw new Error('Usuario 0 debe estar marcado como justificada');

    testAttendance = updated;
    console.log('✓ Tomar asistencia con justificada exitoso');
    return true;
  } catch (err) {
    console.error('✗ Tomar asistencia con justificada falló:', err.message);
    return false;
  }
}

async function test_updateAttendanceEntries() {
  console.log('\n[TEST] Actualizar entradas de asistencia');
  try {
    const updates = [
      { usuario: testUsers[0]._id, asistencia: 'presente' },
      { usuario: testUsers[1]._id, asistencia: 'justificada' },
      { usuario: testUsers[2]._id, asistencia: 'ausente' }
    ];

    const result = await AttendanceModel.updateAttendanceEntries(
      testAttendance._id,
      updates,
      testUsers[0]._id
    );

    if (!result.attendance) throw new Error('Asistencia no retornada');
    if (!Array.isArray(result.skipped)) throw new Error('omitidos debe ser un arreglo');

    const user0Entry = result.attendance.inscripciones.find(e => e.usuario._id.toString() === testUsers[0]._id.toString());
    const user1Entry = result.attendance.inscripciones.find(e => e.usuario._id.toString() === testUsers[1]._id.toString());
    const user2Entry = result.attendance.inscripciones.find(e => e.usuario._id.toString() === testUsers[2]._id.toString());

    if (!user0Entry || user0Entry.asistencia !== 'presente') 
      throw new Error('Actualización del usuario 0 falló');
    if (!user1Entry || user1Entry.asistencia !== 'justificada') 
      throw new Error('Actualización del usuario 1 falló');
    if (!user2Entry || user2Entry.asistencia !== 'ausente') 
      throw new Error('Actualización del usuario 2 falló');

    testAttendance = result.attendance;
    console.log('✓ Actualizar entradas de asistencia exitoso');
    return true;
  } catch (err) {
    console.error('✗ Actualizar entradas de asistencia falló:', err.message);
    return false;
  }
}

async function test_updateAttendanceEntries_withSkipped() {
  console.log('\n[TEST] Actualizar entradas - con usuarios omitidos');
  try {
    const fakeUserId = '507f1f77bcf86cd799439011'; // ID falso de MongoDB
    const updates = [
      { usuario: testUsers[0]._id, asistencia: 'presente' },
      { usuario: fakeUserId, asistencia: 'presente' } // Este usuario no existe en inscripciones
    ];

    const result = await AttendanceModel.updateAttendanceEntries(
      testAttendance._id,
      updates,
      testUsers[0]._id
    );

    if (!Array.isArray(result.skipped) || result.skipped.length === 0) 
      throw new Error('Debe omitir el ID de usuario falso');
    if (!result.skipped[0].includes(fakeUserId)) 
      throw new Error('omitidos debe contener el ID de usuario falso');

    console.log('✓ Actualizar entradas con usuarios omitidos exitoso');
    return true;
  } catch (err) {
    console.error('✗ Actualizar entradas con usuarios omitidos falló:', err.message);
    return false;
  }
}

async function test_refreshAttendanceList() {
  console.log('\n[TEST] Refrescar lista de asistencia');
  try {
    // Primero, cancelar una inscripción
    const inscripcionToCancel = testInscriptions[2];
    inscripcionToCancel.estado = 'cancelada';
    await inscripcionToCancel.save();

    // Refrescar la lista de asistencia
    const refreshed = await AttendanceModel.refreshAttendanceList(
      testAttendance._id,
      testUsers[0]._id
    );

    // Ahora debe tener solo 2 inscripciones (la tercera fue cancelada)
    if (!refreshed) throw new Error('Asistencia refrescada no retornada');
    if (refreshed.inscripciones.length !== 2) 
      throw new Error(`Se esperaban 2 inscripciones después de cancelar, se obtuvieron ${refreshed.inscripciones.length}`);

    // Todas deben estar en 'ausente'
    refreshed.inscripciones.forEach((entry, index) => {
      if (entry.asistencia !== 'ausente') 
        throw new Error(`Entrada ${index} debe reiniciarse a 'ausente', se obtuvo '${entry.asistencia}'`);
    });

    testAttendance = refreshed;
    console.log('✓ Refrescar lista de asistencia exitoso');
    return true;
  } catch (err) {
    console.error('✗ Refrescar lista de asistencia falló:', err.message);
    return false;
  }
}

async function test_errorHandling() {
  console.log('\n[TEST] Manejo de errores');
  try {
    // Prueba de attendanceId faltante
    try {
      await AttendanceModel.takeAttendance(null, {}, testUsers[0]._id);
      throw new Error('Debe lanzar error por attendanceId faltante');
    } catch (err) {
      if (!err.message.includes('attendanceId requerido')) 
        throw new Error('Mensaje de error incorrecto por attendanceId faltante');
    }

    // Prueba de sessionUserId faltante
    try {
      await AttendanceModel.takeAttendance(testAttendance._id, {}, null);
      throw new Error('Debe lanzar error por sessionUserId faltante');
    } catch (err) {
      if (!err.message.includes('sessionUserId requerido')) 
        throw new Error('Mensaje de error incorrecto por sessionUserId faltante');
    }

    // Prueba de ID de asistencia inválido
    try {
      await AttendanceModel.takeAttendance('invalid_id', {}, testUsers[0]._id);
      throw new Error('Debe lanzar error por ID de asistencia inválido');
    } catch (err) {
      if (!err.message.includes('Registro de asistencia no encontrado')) 
        throw new Error('Mensaje de error incorrecto por ID de asistencia inválido');
    }

    console.log('✓ Manejo de errores exitoso');
    return true;
  } catch (err) {
    console.error('✗ Manejo de errores falló:', err.message);
    return false;
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  try {
    console.log('Iniciando pruebas de AttendanceModel...');
    await setupTestData();
    console.log('Configuración de datos de prueba completada\n');

    // Ejecutar todas las pruebas
    if (await test_createAttendanceList()) passed++; else failed++;
    if (await test_createAttendanceList_duplicate()) passed++; else failed++;
    if (await test_takeAttendance()) passed++; else failed++;
    if (await test_takeAttendance_justificada()) passed++; else failed++;
    if (await test_updateAttendanceEntries()) passed++; else failed++;
    if (await test_updateAttendanceEntries_withSkipped()) passed++; else failed++;
    if (await test_refreshAttendanceList()) passed++; else failed++;
    if (await test_errorHandling()) passed++; else failed++;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Pruebas completadas: ${passed} exitosas, ${failed} fallidas`);
    console.log(`${'='.repeat(50)}`);

    await cleanupTestData();
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('ERROR EN SUITE DE PRUEBAS:', err.message);
    await cleanupTestData();
    process.exit(1);
  }
}

run();
