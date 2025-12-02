require('dotenv').config();
const db = require('../lib/db');
const AttendanceModel = require('../lib/attendanceModel');
const Attendance = require('../lib/schema/Attendance');
const Inscripcion = require('../lib/schema/Inscripcion');
const Usuario = require('../lib/schema/Usuario');
const Actividad = require('../lib/schema/Actividad');
const bcrypt = require('bcryptjs');

// Test data
let testUsers = [];
let testActivity = null;
let testInscriptions = [];
let testAttendance = null;

async function setupTestData() {
  await db.connect();
  
  // Create test users
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

  // Create test activity
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

  // Create test inscriptions with 'activa' status
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
    console.error('Cleanup error:', err.message);
  }
}

async function test_createAttendanceList() {
  console.log('\n[TEST] createAttendanceList');
  try {
    const attendance = await AttendanceModel.createAttendanceList(
      testActivity._id,
      testUsers[0]._id
    );

    // Verify attendance was created
    if (!attendance) throw new Error('Attendance not created');
    if (!attendance._id) throw new Error('Attendance missing ID');

    const actividadId = attendance.actividad._id;

    if (actividadId.toString() !== testActivity._id.toString())
      throw new Error('Activity ID mismatch');
    
    // Verify inscriptions list
    if (!Array.isArray(attendance.inscripciones)) 
      throw new Error('inscripciones is not an array');
    if (attendance.inscripciones.length !== testUsers.length) 
      throw new Error(`Expected ${testUsers.length} inscriptions, got ${attendance.inscripciones.length}`);

    // Verify all inscriptions have default 'ausente'
    attendance.inscripciones.forEach((entry, index) => {
      if (entry.asistencia !== 'ausente') 
        throw new Error(`Entry ${index} asistencia should be 'ausente', got '${entry.asistencia}'`);
    });

    // Verify registradoPor
    if (attendance.registradoPor._id.toString() !== testUsers[0]._id.toString()) 
      throw new Error('registradoPor mismatch');

    testAttendance = attendance;
    console.log('✓ createAttendanceList passed');
    return true;
  } catch (err) {
    console.error('✗ createAttendanceList failed:', err.message);
    return false;
  }
}

async function test_createAttendanceList_duplicate() {
  console.log('\n[TEST] createAttendanceList - duplicate prevention');
  try {
    // Try creating another attendance for the same activity
    const attendance2 = await AttendanceModel.createAttendanceList(
      testActivity._id,
      testUsers[0]._id
    );

    // Should return the existing one
    if (attendance2._id.toString() !== testAttendance._id.toString()) 
      throw new Error('Should return existing attendance, not create a new one');

    console.log('✓ createAttendanceList duplicate prevention passed');
    return true;
  } catch (err) {
    console.error('✗ createAttendanceList duplicate prevention failed:', err.message);
    return false;
  }
}

async function test_takeAttendance() {
  console.log('\n[TEST] takeAttendance');
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

    // Verify updates
    if (!updated) throw new Error('Updated attendance not returned');

    const user0Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[0]._id.toString());
    const user1Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[1]._id.toString());
    const user2Entry = updated.inscripciones.find(e => e.usuario._id.toString() === testUsers[2]._id.toString());

    if (!user0Entry || user0Entry.asistencia !== 'presente') 
      throw new Error('User 0 should be marked as presente');
    if (!user1Entry || user1Entry.asistencia !== 'presente') 
      throw new Error('User 1 should be marked as presente');
    if (!user2Entry || user2Entry.asistencia !== 'ausente') 
      throw new Error('User 2 should be marked as ausente');

    testAttendance = updated;
    console.log('✓ takeAttendance passed');
    return true;
  } catch (err) {
    console.error('✗ takeAttendance failed:', err.message);
    return false;
  }
}

async function test_takeAttendance_justificada() {
  console.log('\n[TEST] takeAttendance with justificada');
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
      throw new Error('User 0 should be marked as justificada');

    testAttendance = updated;
    console.log('✓ takeAttendance with justificada passed');
    return true;
  } catch (err) {
    console.error('✗ takeAttendance with justificada failed:', err.message);
    return false;
  }
}

async function test_updateAttendanceEntries() {
  console.log('\n[TEST] updateAttendanceEntries');
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

    if (!result.attendance) throw new Error('Attendance not returned');
    if (!Array.isArray(result.skipped)) throw new Error('skipped should be an array');

    const user0Entry = result.attendance.inscripciones.find(e => e.usuario._id.toString() === testUsers[0]._id.toString());
    const user1Entry = result.attendance.inscripciones.find(e => e.usuario._id.toString() === testUsers[1]._id.toString());
    const user2Entry = result.attendance.inscripciones.find(e => e.usuario._id.toString() === testUsers[2]._id.toString());

    if (!user0Entry || user0Entry.asistencia !== 'presente') 
      throw new Error('User 0 update failed');
    if (!user1Entry || user1Entry.asistencia !== 'justificada') 
      throw new Error('User 1 update failed');
    if (!user2Entry || user2Entry.asistencia !== 'ausente') 
      throw new Error('User 2 update failed');

    testAttendance = result.attendance;
    console.log('✓ updateAttendanceEntries passed');
    return true;
  } catch (err) {
    console.error('✗ updateAttendanceEntries failed:', err.message);
    return false;
  }
}

async function test_updateAttendanceEntries_withSkipped() {
  console.log('\n[TEST] updateAttendanceEntries - with skipped users');
  try {
    const fakeUserId = '507f1f77bcf86cd799439011'; // Fake MongoDB ID
    const updates = [
      { usuario: testUsers[0]._id, asistencia: 'presente' },
      { usuario: fakeUserId, asistencia: 'presente' } // This user doesn't exist in inscripciones
    ];

    const result = await AttendanceModel.updateAttendanceEntries(
      testAttendance._id,
      updates,
      testUsers[0]._id
    );

    if (!Array.isArray(result.skipped) || result.skipped.length === 0) 
      throw new Error('Should have skipped the fake user ID');
    if (!result.skipped[0].includes(fakeUserId)) 
      throw new Error('skipped should contain the fake user ID');

    console.log('✓ updateAttendanceEntries with skipped users passed');
    return true;
  } catch (err) {
    console.error('✗ updateAttendanceEntries with skipped users failed:', err.message);
    return false;
  }
}

async function test_refreshAttendanceList() {
  console.log('\n[TEST] refreshAttendanceList');
  try {
    // First, cancel one inscription
    const inscripcionToCancel = testInscriptions[2];
    inscripcionToCancel.estado = 'cancelada';
    await inscripcionToCancel.save();

    // Refresh the attendance list
    const refreshed = await AttendanceModel.refreshAttendanceList(
      testAttendance._id,
      testUsers[0]._id
    );

    // Should now only have 2 inscriptions (the third was cancelled)
    if (!refreshed) throw new Error('Refreshed attendance not returned');
    if (refreshed.inscripciones.length !== 2) 
      throw new Error(`Expected 2 inscriptions after cancel, got ${refreshed.inscripciones.length}`);

    // All should be reset to 'ausente'
    refreshed.inscripciones.forEach((entry, index) => {
      if (entry.asistencia !== 'ausente') 
        throw new Error(`Entry ${index} should be reset to 'ausente', got '${entry.asistencia}'`);
    });

    testAttendance = refreshed;
    console.log('✓ refreshAttendanceList passed');
    return true;
  } catch (err) {
    console.error('✗ refreshAttendanceList failed:', err.message);
    return false;
  }
}

async function test_errorHandling() {
  console.log('\n[TEST] Error handling');
  try {
    // Test missing attendanceId
    try {
      await AttendanceModel.takeAttendance(null, {}, testUsers[0]._id);
      throw new Error('Should throw error for missing attendanceId');
    } catch (err) {
      if (!err.message.includes('attendanceId requerido')) 
        throw new Error('Wrong error message for missing attendanceId');
    }

    // Test missing sessionUserId
    try {
      await AttendanceModel.takeAttendance(testAttendance._id, {}, null);
      throw new Error('Should throw error for missing sessionUserId');
    } catch (err) {
      if (!err.message.includes('sessionUserId requerido')) 
        throw new Error('Wrong error message for missing sessionUserId');
    }

    // Test invalid attendance ID
    try {
      await AttendanceModel.takeAttendance('invalid_id', {}, testUsers[0]._id);
      throw new Error('Should throw error for invalid attendance ID');
    } catch (err) {
      if (!err.message.includes('Registro de asistencia no encontrado')) 
        throw new Error('Wrong error message for invalid attendance ID');
    }

    console.log('✓ Error handling passed');
    return true;
  } catch (err) {
    console.error('✗ Error handling failed:', err.message);
    return false;
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  try {
    console.log('Starting AttendanceModel tests...');
    await setupTestData();
    console.log('Test data setup complete');

    // Run all tests
    if (await test_createAttendanceList()) passed++; else failed++;
    if (await test_createAttendanceList_duplicate()) passed++; else failed++;
    if (await test_takeAttendance()) passed++; else failed++;
    if (await test_takeAttendance_justificada()) passed++; else failed++;
    if (await test_updateAttendanceEntries()) passed++; else failed++;
    if (await test_updateAttendanceEntries_withSkipped()) passed++; else failed++;
    if (await test_refreshAttendanceList()) passed++; else failed++;
    if (await test_errorHandling()) passed++; else failed++;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests completed: ${passed} passed, ${failed} failed`);
    console.log(`${'='.repeat(50)}`);

    await cleanupTestData();
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('TEST SUITE ERROR:', err.message);
    await cleanupTestData();
    process.exit(1);
  }
}

run();
