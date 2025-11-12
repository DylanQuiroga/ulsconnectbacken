# 🧪 Guía de Pruebas - ULS Connect Backend

## Estado Actual
✅ **Servidor:** Corriendo en `http://localhost:3000`
✅ **Base de Datos:** Conectada a MongoDB (o usando fallback a archivo JSON)
✅ **Formularios:** Listos para probar

---

## 📝 Pasos para Probar el Flujo Completo

### 1️⃣ Registro (Sign Up)
1. Abre: http://localhost:3000/signup
2. Completa el formulario:
   - **Correo universitario:** `estudiante@ulsconnect.edu`
   - **Nombre completo:** `Carlos García López`
   - **Contraseña:** `Segura123!`
3. Haz clic en "Crear cuenta"
4. ✅ Esperado: Se auto-loga y redirige a `/profile`

### 2️⃣ Perfil (Profile)
1. Después de registro, deberías estar en: http://localhost:3000/profile
2. Verifica que se muestre:
   - Mensaje: "Bienvenido, Carlos García López (estudiante@ulsconnect.edu)"
   - Botón: "Logout"
   - Link: "Back to home"
3. ✅ Esperado: Perfil visible con datos del usuario

### 3️⃣ Logout
1. Haz clic en "Logout"
2. ✅ Esperado: Redirige a home (`/`), sesión destruida

### 4️⃣ Login (con usuario existente)
1. Abre: http://localhost:3000/login
2. Usa las credenciales de registro:
   - **Correo:** `estudiante@ulsconnect.edu`
   - **Contraseña:** `Segura123!`
3. Haz clic en "Iniciar sesión"
4. ✅ Esperado: Redirige a `/profile` mostrando tus datos

### 5️⃣ Protección de Rutas
1. Logout nuevamente
2. Intenta acceder a: http://localhost:3000/profile (sin estar logeado)
3. ✅ Esperado: Te redirige a `/login`

### 6️⃣ Errores de Validación
1. En `/signup`, intenta registrarte con:
   - Correo vacío → "Correo, nombre y contraseña son requeridos"
   - Mismo correo que otro usuario → "El usuario ya existe"
2. En `/login`, intenta con:
   - Credenciales inválidas → "Correo o contraseña inválidos"

---

## 📊 Estado de Datos

### Si usas MongoDB
- **Ubicación:** `mongodb://127.0.0.1:27017/ulsconnect`
- **Colección:** `usuarios`
- Cada usuario incluye: `_id`, `correoUniversitario`, `contrasena` (hash), `nombre`, `rol`, `telefono`, `carrera`, `intereses`, `creadoEn`, `actualizadoEn`

### Si usas Fallback (archivo JSON)
- **Ubicación:** `.dev-users.json` (en raíz del proyecto)
- Los datos se guardan entre sesiones
- Útil para desarrollo sin MongoDB

**Para resetear datos de desarrollo:**
```powershell
Remove-Item .\.dev-users.json -ErrorAction SilentlyContinue
```

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| "No es posible conectar con el servidor remoto" | Verifica que `node app.js` está corriendo |
| "El usuario ya existe" al registrarse | Usa otro correo o limpia `.dev-users.json` |
| Sesión no persiste tras logout/login | Normal con sesiones en memoria; permanecerá en MongoDB/archivo |
| Formulario luce sin estilos | Es intencional (HTML bare). Se pueden añadir CSS después |

---

## 🎯 Comportamiento Esperado por Endpoint

| Endpoint | Método | Requiere Auth | Esperado |
|----------|--------|---------------|----------|
| `/` | GET | ❌ | Home con posts (blog) |
| `/signup` | GET | ❌ | Formulario de registro |
| `/signup` | POST | ❌ | Crea usuario, auto-loga, redirige a `/profile` |
| `/login` | GET | ❌ | Formulario de login |
| `/login` | POST | ❌ | Valida, crea sesión, redirige a `/profile` |
| `/profile` | GET | ✅ | Datos del usuario; sino → redirige a `/login` |
| `/logout` | GET | ✅ | Destruye sesión, redirige a `/` |
| `/blog/:postTitle` | GET | ❌ | Post individual (blog existente) |

---

## 🚀 Próxima Fase

Una vez confirmado que auth funciona:
1. Implementar **actividades** (CRUD)
2. Implementar **inscripciones** a actividades
3. Implementar **registro de asistencia**
4. Añadir **roles y autorización**
5. Crear **API REST** con endpoints JSON

---

**Última actualización:** 12 de Noviembre de 2025
