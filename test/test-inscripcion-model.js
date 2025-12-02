require('dotenv').config();
const db = require('../lib/db');
const InscripcionModel = require('../lib/inscripcionModel');
const Inscripcion = require('../lib/schema/Inscripcion');
const Usuario = require('../lib/schema/Usuario');
const Actividad = require('../lib/schema/Actividad');
const bcrypt = require('bcryptjs');

// Datos de prueba
let testUsers = [];
let testActivity = null;
let testInscription = null;

async function setupTestData() {
  await db.connect();
  
  // Crear usuarios de prueba
  const hash = await bcrypt.hash('testpass123', 10);
  const users = [];
  for (let i = 1; i <= 4; i++) {
    const user = new Usuario({
      correoUniversitario: `inscripcion.user${i}@test.cl`,
      contrasena: hash,
      nombre: `Inscripcion User ${i}`,
      rol: 'estudiante'
    });
    await user.save();
    users.push(user);
  }
  testUsers = users;

  // Crear actividad de prueba con capacidad
  const activity = new Actividad({
    titulo: `Inscripcion Test Activity ${Date.now()}`,
    descripcion: 'Test activity for inscripcion model',
    area: 'Comunidad',
    tipo: 'Taller',
    fechaInicio: new Date(Date.now() + 60 * 60 * 1000),
    fechaFin: new Date(Date.now() + 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'La Serena',
      nombreLugar: 'Test Location',
      lng: -70.601
    },
    capacidad: 2, // Capacidad limitada
    estado: 'activa',
    creadoPor: testUsers[0]._id
  });
  await activity.save();
  testActivity = activity;
}

async function cleanupTestData() {
  try {
    if (testInscription) {
      await Inscripcion.findByIdAndDelete(testInscription._id);
    }
    // Limpiar todas las inscripciones para usuarios de prueba
    await Inscripcion.deleteMany({ usuario: { $in: testUsers.map(u => u._id) } });
    
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

async function test_crear() {
  console.log('\n[TEST] crear - básico');
  try {
    const inscription = await InscripcionModel.crear(
      testUsers[0]._id,
      testActivity._id
    );

    if (!inscription) throw new Error('Inscripcion no creada');
    if (!inscription._id) throw new Error('Inscripcion sin ID');
    if (inscription.usuario._id.toString() !== testUsers[0]._id.toString())
      throw new Error('Mismatch en ID de usuario');
    
    const actividadId = inscription.actividad._id
      ? inscription.actividad._id.toString()
      : inscription.actividad.toString();
    if (actividadId !== testActivity._id.toString())
      throw new Error('Mismatch en ID de actividad');
    
    if (inscription.estado !== 'activa')
      throw new Error(`El estado debe ser 'activa', se obtuvo '${inscription.estado}'`);

    testInscription = inscription;
    console.log('✓ Crear exitoso');
    return true;
  } catch (err) {
    console.error('✗ Crear falló:', err.message);
    return false;
  }
}

async function test_crear_reduceCapa() {
  console.log('\n[TEST] crear - reduce capacidad');
  try {
    // Verificar capacidad antes
    const actBefore = await Actividad.findById(testActivity._id);
    const capacityBefore = actBefore.capacidad;

    // Crear otra inscripción
    const inscription2 = await InscripcionModel.crear(
      testUsers[1]._id,
      testActivity._id
    );

    // Verificar capacidad después
    const actAfter = await Actividad.findById(testActivity._id);
    const capacityAfter = actAfter.capacidad;

    if (capacityAfter !== capacityBefore - 1)
      throw new Error(`La capacidad debe disminuir en 1, era ${capacityBefore}, ahora es ${capacityAfter}`);

    console.log('✓ Crear - reduce capacidad exitoso');
    return true;
  } catch (err) {
    console.error('✗ Crear - reduce capacidad falló:', err.message);
    return false;
  }
}

async function test_crear_duplicate() {
  console.log('\n[TEST] crear - prevención de duplicados');
  try {
    // Intentar crear una segunda inscripción para el mismo usuario y actividad
    try {
      await InscripcionModel.crear(testUsers[0]._id, testActivity._id);
      throw new Error('Debe lanzar error por inscripción duplicada');
    } catch (err) {
      if (!err.message.includes('Ya estas inscrito'))
        throw new Error(`Mensaje de error incorrecto: ${err.message}`);
    }

    console.log('✓ Prevención de duplicados exitosa');
    return true;
  } catch (err) {
    console.error('✗ Prevención de duplicados falló:', err.message);
    return false;
  }
}

async function test_crear_noCapacity() {
  console.log('\n[TEST] crear - sin capacidad');
  try {
    // Crear inscripciones hasta llenar la capacidad
    const actBefore = await Actividad.findById(testActivity._id);
    const remainingCapacity = actBefore.capacidad;

    // Usuarios 0 y 1 ya están inscritos (2 usados)
    // Si capacidad es 2, no hay más espacio
    if (remainingCapacity > 0) {
      // Llenar capacidad restante
      const user = testUsers[2];
      await InscripcionModel.crear(user._id, testActivity._id);
    }

    // Ahora capacidad debe ser 0, intentar uno más
    try {
      await InscripcionModel.crear(testUsers[3]._id, testActivity._id);
      throw new Error('Debe lanzar error sin capacidad');
    } catch (err) {
      if (!err.message.includes('capacidad disponible'))
        throw new Error(`Mensaje de error incorrecto: ${err.message}`);
    }

    console.log('✓ Sin capacidad exitoso');
    return true;
  } catch (err) {
    console.error('✗ Sin capacidad falló:', err.message);
    return false;
  }
}

async function test_crear_inactiveActivity() {
  console.log('\n[TEST] crear - actividad inactiva');
  try {
    // Crear una actividad inactiva
    const inactiveActivity = new Actividad({
      titulo: `Actividad de prueba inactiva ${Date.now()}`,
      descripcion: 'Actividad de prueba inactiva',
      area: 'Comunidad',
      tipo: 'Taller',
      fechaInicio: new Date(Date.now() + 60 * 60 * 1000),
      fechaFin: new Date(Date.now() + 2 * 60 * 60 * 1000),
      ubicacion: {
        nombreComuna: 'La Serena',
        nombreLugar: 'Ubicación de prueba',
        lng: -70.601
      },
      capacidad: 25,
      estado: 'cancelada', // Inactiva
      creadoPor: testUsers[0]._id
    });
    await inactiveActivity.save();

    try {
      await InscripcionModel.crear(testUsers[2]._id, inactiveActivity._id);
      throw new Error('Debe lanzar error por actividad inactiva');
    } catch (err) {
      if (!err.message.includes('no esta activa'))
        throw new Error(`Mensaje de error incorrecto: ${err.message}`);
    }

    await Actividad.findByIdAndDelete(inactiveActivity._id);
    console.log('✓ Actividad inactiva exitoso');
    return true;
  } catch (err) {
    console.error('✗ Actividad inactiva falló:', err.message);
    return false;
  }
}

async function test_obtenerPorId() {
  console.log('\n[TEST] obtenerPorId');
  try {
    const inscription = await InscripcionModel.obtenerPorId(testInscription._id);

    if (!inscription) throw new Error('Inscripción no encontrada');
    if (inscription._id.toString() !== testInscription._id.toString())
      throw new Error('Mismatch en ID');
    if (inscription.usuario._id.toString() !== testUsers[0]._id.toString())
      throw new Error('Mismatch en ID de usuario');

    console.log('✓ obtenerPorId exitoso');
    return true;
  } catch (err) {
    console.error('✗ obtenerPorId falló:', err.message);
    return false;
  }
}

async function test_obtenerPorUsuario() {
  console.log('\n[TEST] obtenerPorUsuario');
  try {
    const inscriptions = await InscripcionModel.obtenerPorUsuario(testUsers[0]._id);

    if (!Array.isArray(inscriptions))
      throw new Error('El resultado debe ser un arreglo');
    if (inscriptions.length === 0)
      throw new Error('Debe haber al menos una inscripción');
    
    const found = inscriptions.find(i => i._id.toString() === testInscription._id.toString());
    if (!found)
      throw new Error('Inscripción de prueba no encontrada en resultados');

    console.log('✓ obtenerPorUsuario exitoso');
    return true;
  } catch (err) {
    console.error('✗ obtenerPorUsuario falló:', err.message);
    return false;
  }
}

async function test_obtenerPorActividad() {
  console.log('\n[TEST] obtenerPorActividad');
  try {
    const inscriptions = await InscripcionModel.obtenerPorActividad(testActivity._id);

    if (!Array.isArray(inscriptions))
      throw new Error('El resultado debe ser un arreglo');
    if (inscriptions.length < 2)
      throw new Error('Debe haber al menos 2 inscripciones (usuarios 0 y 1)');
    
    const found = inscriptions.find(i => i._id.toString() === testInscription._id.toString());
    if (!found)
      throw new Error('Inscripción de prueba no encontrada en resultados');

    console.log('✓ obtenerPorActividad exitoso');
    return true;
  } catch (err) {
    console.error('✗ obtenerPorActividad falló:', err.message);
    return false;
  }
}

async function test_cancelar() {
  console.log('\n[TEST] cancelar');
  try {
    const motivo = 'Cambio de horario';
    const cancelled = await InscripcionModel.cancelar(testInscription._id, motivo);

    if (!cancelled) throw new Error('Inscripción cancelada no retornada');
    if (cancelled.estado !== 'cancelada')
      throw new Error(`El estado debe ser 'cancelada', se obtuvo '${cancelled.estado}'`);
    if (cancelled.motivoCancelacion !== motivo)
      throw new Error(`El motivo debe ser '${motivo}', se obtuvo '${cancelled.motivoCancelacion}'`);

    console.log('✓ Cancelar exitoso');
    return true;
  } catch (err) {
    console.error('✗ Cancelar falló:', err.message);
    return false;
  }
}

async function test_obtenerActivas() {
  console.log('\n[TEST] obtenerActivas');
  try {
    // testInscription ahora está cancelada, verificamos las inscripciones del usuario 1
    const activas = await InscripcionModel.obtenerActivas(testUsers[1]._id);

    if (!Array.isArray(activas))
      throw new Error('El resultado debe ser un arreglo');
    if (activas.length === 0)
      throw new Error('Debe haber al menos una inscripción activa');
    
    // Verificar que todas sean 'activa'
    activas.forEach((insc, index) => {
      if (insc.estado !== 'activa')
        throw new Error(`Inscripción ${index} debe ser 'activa', se obtuvo '${insc.estado}'`);
    });

    console.log('✓ obtenerActivas exitoso');
    return true;
  } catch (err) {
    console.error('✗ obtenerActivas falló:', err.message);
    return false;
  }
}

async function test_errorHandling() {
  console.log('\n[TEST] Manejo de errores');
  try {
    // Prueba de usuarioId faltante
    try {
      await InscripcionModel.crear(null, testActivity._id);
      throw new Error('Debe lanzar error por usuarioId faltante');
    } catch (err) {
      if (!err.message.includes('usuarioId y actividadId'))
        throw new Error('Mensaje de error incorrecto por usuarioId faltante');
    }

    // Prueba de actividadId faltante
    try {
      await InscripcionModel.crear(testUsers[0]._id, null);
      throw new Error('Debe lanzar error por actividadId faltante');
    } catch (err) {
      if (!err.message.includes('usuarioId y actividadId'))
        throw new Error('Mensaje de error incorrecto por actividadId faltante');
    }

    // Prueba de actividad inexistente
    try {
      const fakeActivityId = '507f1f77bcf86cd799439011';
      await InscripcionModel.crear(testUsers[0]._id, fakeActivityId);
      throw new Error('Debe lanzar error por actividad inexistente');
    } catch (err) {
      if (!err.message.includes('Actividad no encontrada'))
        throw new Error('Mensaje de error incorrecto por actividad inexistente');
    }

    // Prueba de cancelar sin ID
    try {
      await InscripcionModel.cancelar(null);
      throw new Error('Debe lanzar error por ID de inscripción faltante');
    } catch (err) {
      if (err.message === 'Debe lanzar error por ID de inscripción faltante')
        throw err; // Re-lanzar si es nuestro error de prueba
      if (!err.message.includes('ID de inscripcion requerido'))
        throw new Error(`Mensaje de error incorrecto: ${err.message}`);
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
    console.log('Iniciando pruebas de InscripcionModel...');
    await setupTestData();
    console.log('Configuración de datos de prueba completada\n');

    // Ejecutar todas las pruebas en orden
    if (await test_crear()) passed++; else failed++;
    if (await test_crear_reduceCapa()) passed++; else failed++;
    if (await test_crear_duplicate()) passed++; else failed++;
    if (await test_crear_noCapacity()) passed++; else failed++;
    if (await test_crear_inactiveActivity()) passed++; else failed++;
    if (await test_obtenerPorId()) passed++; else failed++;
    if (await test_obtenerPorUsuario()) passed++; else failed++;
    if (await test_obtenerPorActividad()) passed++; else failed++;
    if (await test_cancelar()) passed++; else failed++;
    if (await test_obtenerActivas()) passed++; else failed++;
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
