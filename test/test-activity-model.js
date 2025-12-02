require('dotenv').config();
const db = require('../lib/db');
const ActividadModel = require('../lib/activityModel');
const Actividad = require('../lib/schema/Actividad');
const Usuario = require('../lib/schema/Usuario');
const bcrypt = require('bcryptjs');

// Datos de prueba
let testUser = null;
let testActivity = null;

async function setupTestData() {
  await db.connect();
  
  // Crear usuario de prueba
  const hash = await bcrypt.hash('testpass123', 10);
  const user = new Usuario({
    correoUniversitario: `activity.user@test.cl`,
    contrasena: hash,
    nombre: 'Activity User Test',
    rol: 'admin'
  });
  await user.save();
  testUser = user;
}

async function cleanupTestData() {
  try {
    if (testActivity) {
      await Actividad.findByIdAndDelete(testActivity._id);
    }
    if (testUser) {
      await Usuario.findByIdAndDelete(testUser._id);
    }
  } catch (err) {
    console.error('Error en limpieza:', err.message);
  }
}

function createActivityData() {
  const now = Date.now();
  return {
    titulo: `Actividad de prueba ${now}`,
    descripcion: 'Descripción de actividad de prueba',
    area: 'Comunidad',
    tipo: 'Taller',
    fechaInicio: new Date(now + 60 * 60 * 1000),
    fechaFin: new Date(now + 2 * 60 * 60 * 1000),
    ubicacion: {
      nombreComuna: 'La Serena',
      nombreLugar: 'Ubicación de prueba',
      lng: -70.601
    },
    capacidad: 25,
    estado: 'activa',
    creadoPor: testUser._id
  };
}

async function test_crear() {
  console.log('\n[TEST] Crear actividad');
  try {
    const actividadData = createActivityData();
    const actividad = await ActividadModel.crear(actividadData);

    if (!actividad) throw new Error('Actividad no creada');
    if (!actividad._id) throw new Error('Actividad sin ID');
    if (actividad.titulo !== actividadData.titulo)
      throw new Error('Mismatch en título');
    if (actividad.estado !== 'activa')
      throw new Error(`Estado debe ser 'activa', se obtuvo '${actividad.estado}'`);
    if (actividad.capacidad !== 25)
      throw new Error(`Capacidad debe ser 25, se obtuvo ${actividad.capacidad}`);

    testActivity = actividad;
    console.log('✓ Crear actividad exitoso');
    return true;
  } catch (err) {
    console.error('✗ Crear actividad falló:', err.message);
    return false;
  }
}

async function test_obtenerPorId() {
  console.log('\n[TEST] Obtener actividad por ID');
  try {
    const actividad = await ActividadModel.obtenerPorId(testActivity._id);

    if (!actividad) throw new Error('Actividad no encontrada');
    if (actividad._id.toString() !== testActivity._id.toString())
      throw new Error('Mismatch en ID');
    if (actividad.titulo !== testActivity.titulo)
      throw new Error('Mismatch en título');
    if (!actividad.creadoPor)
      throw new Error('Usuario creador no poblado');

    console.log('✓ Obtener actividad por ID exitoso');
    return true;
  } catch (err) {
    console.error('✗ Obtener actividad por ID falló:', err.message);
    return false;
  }
}

async function test_obtenerTodas() {
  console.log('\n[TEST] Obtener todas las actividades');
  try {
    const actividades = await ActividadModel.obtenerTodas();

    if (!Array.isArray(actividades))
      throw new Error('El resultado debe ser un arreglo');
    if (actividades.length === 0)
      throw new Error('Debe haber al menos una actividad');

    const found = actividades.find(a => a._id.toString() === testActivity._id.toString());
    if (!found)
      throw new Error('Actividad de prueba no encontrada en resultados');

    console.log('✓ Obtener todas las actividades exitoso');
    return true;
  } catch (err) {
    console.error('✗ Obtener todas las actividades falló:', err.message);
    return false;
  }
}

async function test_obtenerTodas_conFiltros() {
  console.log('\n[TEST] Obtener actividades con filtros');
  try {
    // Filtrar por área
    const actividadesArea = await ActividadModel.obtenerTodas({ area: 'Comunidad' });

    if (!Array.isArray(actividadesArea))
      throw new Error('El resultado debe ser un arreglo');
    if (actividadesArea.length === 0)
      throw new Error('Debe haber al menos una actividad con área Comunidad');

    // Filtrar por estado
    const actividadesEstado = await ActividadModel.obtenerTodas({ estado: 'activa' });
    
    if (!Array.isArray(actividadesEstado))
      throw new Error('El resultado debe ser un arreglo');
    if (actividadesEstado.length === 0)
      throw new Error('Debe haber al menos una actividad activa');

    console.log('✓ Obtener actividades con filtros exitoso');
    return true;
  } catch (err) {
    console.error('✗ Obtener actividades con filtros falló:', err.message);
    return false;
  }
}

async function test_actualizar() {
  console.log('\n[TEST] Actualizar actividad');
  try {
    const actualizaciones = {
      descripcion: 'Descripción actualizada de prueba',
      capacidad: 30,
      tipo: 'Conferencia'
    };

    const actualizada = await ActividadModel.actualizar(testActivity._id, actualizaciones);

    if (!actualizada) throw new Error('Actividad actualizada no retornada');
    if (actualizada.descripcion !== 'Descripción actualizada de prueba')
      throw new Error('Descripción no fue actualizada');
    if (actualizada.capacidad !== 30)
      throw new Error(`Capacidad debe ser 30, se obtuvo ${actualizada.capacidad}`);
    if (actualizada.tipo !== 'Conferencia')
      throw new Error('Tipo no fue actualizado');
    
    // Actualizar objeto de prueba
    testActivity = actualizada;

    console.log('✓ Actualizar actividad exitoso');
    return true;
  } catch (err) {
    console.error('✗ Actualizar actividad falló:', err.message);
    return false;
  }
}

async function test_obtenerPorArea() {
  console.log('\n[TEST] Obtener actividades por área');
  try {
    const actividades = await ActividadModel.obtenerPorArea('Comunidad');

    if (!Array.isArray(actividades))
      throw new Error('El resultado debe ser un arreglo');
    if (actividades.length === 0)
      throw new Error('Debe haber al menos una actividad');

    // Verificar que todas sean del área Comunidad
    actividades.forEach((act, index) => {
      if (act.area !== 'Comunidad')
        throw new Error(`Actividad ${index} debe ser área Comunidad, se obtuvo '${act.area}'`);
    });

    console.log('✓ Obtener actividades por área exitoso');
    return true;
  } catch (err) {
    console.error('✗ Obtener actividades por área falló:', err.message);
    return false;
  }
}

async function test_obtenerPorEstado() {
  console.log('\n[TEST] Obtener actividades por estado');
  try {
    const actividades = await ActividadModel.obtenerPorEstado('activa');

    if (!Array.isArray(actividades))
      throw new Error('El resultado debe ser un arreglo');
    if (actividades.length === 0)
      throw new Error('Debe haber al menos una actividad activa');

    // Verificar que todas sean estado 'activa'
    actividades.forEach((act, index) => {
      if (act.estado !== 'activa')
        throw new Error(`Actividad ${index} debe tener estado 'activa', se obtuvo '${act.estado}'`);
    });

    console.log('✓ Obtener actividades por estado exitoso');
    return true;
  } catch (err) {
    console.error('✗ Obtener actividades por estado falló:', err.message);
    return false;
  }
}

async function test_cerrarConvocatoria() {
  console.log('\n[TEST] Cerrar convocatoria');
  try {
    const motivo = 'fecha_alcanzada';
    const cerrada = await ActividadModel.cerrarConvocatoria(testActivity._id, motivo);

    if (!cerrada) throw new Error('Actividad cerrada no retornada');
    if (cerrada.estado !== 'closed')
      throw new Error(`Estado debe ser 'closed', se obtuvo '${cerrada.estado}'`);
    if (cerrada.motivoCierre !== motivo)
      throw new Error(`Motivo debe ser '${motivo}', se obtuvo '${cerrada.motivoCierre}'`);
    if (!cerrada.fechaCierre)
      throw new Error('Fecha de cierre no fue establecida');

    testActivity = cerrada;

    console.log('✓ Cerrar convocatoria exitoso');
    return true;
  } catch (err) {
    console.error('✗ Cerrar convocatoria falló:', err.message);
    return false;
  }
}

async function test_estaActiva() {
  console.log('\n[TEST] Verificar si está activa');
  try {
    // testActivity está cerrada ahora, debe retornar false
    const estaActiva = await ActividadModel.estaActiva(testActivity._id);

    if (estaActiva !== false)
      throw new Error('Actividad cerrada debe retornar false, se obtuvo true');

    // Crear una nueva actividad activa para verificar
    const actividadData = createActivityData();
    const nuevaActividad = await ActividadModel.crear(actividadData);

    const estaActivaNueva = await ActividadModel.estaActiva(nuevaActividad._id);

    if (estaActivaNueva !== true)
      throw new Error('Actividad activa debe retornar true, se obtuvo false');

    // Limpiar actividad temporal
    await Actividad.findByIdAndDelete(nuevaActividad._id);

    console.log('✓ Verificar si está activa exitoso');
    return true;
  } catch (err) {
    console.error('✗ Verificar si está activa falló:', err.message);
    return false;
  }
}

async function test_eliminar() {
  console.log('\n[TEST] Eliminar actividad');
  try {
    // Crear una actividad temporal para eliminar
    const actividadData = createActivityData();
    const actividad = await ActividadModel.crear(actividadData);

    const id = actividad._id;

    // Eliminar
    const eliminada = await ActividadModel.eliminar(id);

    if (!eliminada) throw new Error('Actividad eliminada no retornada');
    if (eliminada._id.toString() !== id.toString())
      throw new Error('Mismatch en ID de actividad eliminada');

    // Verificar que fue eliminada
    const noExiste = await ActividadModel.obtenerPorId(id);
    if (noExiste)
      throw new Error('Actividad aún existe después de eliminar');

    console.log('✓ Eliminar actividad exitoso');
    return true;
  } catch (err) {
    console.error('✗ Eliminar actividad falló:', err.message);
    return false;
  }
}

async function test_cerrarConvocatoria_motivoPersonalizado() {
  console.log('\n[TEST] Cerrar convocatoria con motivo personalizado');
  try {
    // Crear actividad nueva para este test
    const actividadData = createActivityData();
    const actividad = await ActividadModel.crear(actividadData);

    const motivo = 'cupo_lleno';
    const cerrada = await ActividadModel.cerrarConvocatoria(actividad._id, motivo);

    if (cerrada.motivoCierre !== motivo)
      throw new Error(`Motivo debe ser '${motivo}', se obtuvo '${cerrada.motivoCierre}'`);

    // Limpiar
    await Actividad.findByIdAndDelete(actividad._id);

    console.log('✓ Cerrar convocatoria con motivo personalizado exitoso');
    return true;
  } catch (err) {
    console.error('✗ Cerrar convocatoria con motivo personalizado falló:', err.message);
    return false;
  }
}

async function test_errorHandling() {
  console.log('\n[TEST] Manejo de errores');
  try {
    // Prueba de obtener con ID inválido
    try {
      await ActividadModel.obtenerPorId('invalid_id');
      throw new Error('Debe lanzar error con ID inválido');
    } catch (err) {
      if (!err.message.includes('Error al obtener actividad'))
        throw new Error('Mensaje de error incorrecto para ID inválido');
    }

    // Prueba de actualizar con ID inválido
    try {
      await ActividadModel.actualizar('invalid_id', { titulo: 'Nueva' });
      // No se espera un error, simplemente retorna null
    } catch (err) {
      if (!err.message.includes('Error al actualizar'))
        throw new Error('Mensaje de error incorrecto para actualizar');
    }

    // Prueba de eliminar con ID inválido
    try {
      await ActividadModel.eliminar('invalid_id');
      // No se espera un error, simplemente retorna null
    } catch (err) {
      if (!err.message.includes('Error al eliminar'))
        throw new Error('Mensaje de error incorrecto para eliminar');
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
    console.log('Iniciando pruebas de ActividadModel...');
    await setupTestData();
    console.log('Configuración de datos de prueba completada\n');

    // Ejecutar todas las pruebas en orden
    if (await test_crear()) passed++; else failed++;
    if (await test_obtenerPorId()) passed++; else failed++;
    if (await test_obtenerTodas()) passed++; else failed++;
    if (await test_obtenerTodas_conFiltros()) passed++; else failed++;
    if (await test_actualizar()) passed++; else failed++;
    if (await test_obtenerPorArea()) passed++; else failed++;
    if (await test_obtenerPorEstado()) passed++; else failed++;
    if (await test_cerrarConvocatoria()) passed++; else failed++;
    if (await test_estaActiva()) passed++; else failed++;
    if (await test_eliminar()) passed++; else failed++;
    if (await test_cerrarConvocatoria_motivoPersonalizado()) passed++; else failed++;
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
