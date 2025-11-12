# ULS Connect Backend - Autenticación con Login/Signup

## 📋 Descripción
Backend para ULS Connect con autenticación basada en sesiones. Permite registro, login, visualización de perfil y logout de usuarios.

## 🎯 Características
- ✅ Registro de usuarios (`/signup`)
- ✅ Login seguro (`/login`) con contraseñas hasheadas (bcrypt)
- ✅ Perfil protegido (`/profile`)
- ✅ Logout (`/logout`)
- ✅ Blog de actividades (rutas existentes `/` y `/blog/:postTitle`)
- ✅ Soporte para MongoDB y fallback a archivo JSON (desarrollo)

## 🗂️ Estructura de Base de Datos

### Colección: `usuarios`
```json
{
  "_id": "ObjectId",
  "correoUniversitario": "string (unique)",
  "contrasena": "string (hash bcrypt)",
  "nombre": "string",
  "rol": "string (default: 'estudiante')",
  "telefono": "string|null",
  "carrera": "string",
  "intereses": ["string"],
  "creadoEn": "Date",
  "actualizadoEn": "Date"
}
```

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```powershell
cd C:\Users\Daniel\Documents\GitHub\ULSConnect\ulsconnectbacken
npm install
```

### 2. Iniciar el servidor
```powershell
node app.js
```

Verás en consola:
```
Server running on port 3000
Connected to MongoDB
```

O si MongoDB no está disponible:
```
⚠️  MongoDB unavailable, using file-based fallback for development
```

### 3. Acceder desde navegador

#### Registro
- URL: `http://localhost:3000/signup`
- Formulario requiere: **Correo universitario**, **Nombre**, **Contraseña**
- Tras registro exitoso, se auto-loga y redirige a `/profile`

#### Login
- URL: `http://localhost:3000/login`
- Formulario requiere: **Correo universitario**, **Contraseña**
- Tras login exitoso, redirige a `/profile`

#### Perfil (protegido)
- URL: `http://localhost:3000/profile`
- Muestra: **Nombre** y **Correo** del usuario autenticado
- Botón para **Logout**

#### Logout
- URL: `http://localhost:3000/logout`
- Destruye la sesión y redirige a home

## 🗄️ MongoDB

### Opción 1: MongoDB Community Server Instalado Localmente
Si tienes MongoDB Server corriendo localmente en `mongodb://127.0.0.1:27017`, la app conectará automáticamente.

**Verificar que mongod está corriendo:**
```powershell
mongod --version
```

### Opción 2: MongoDB Atlas (Cloud)
Para usar una instancia remota, set la variable de entorno:
```powershell
$env:MONGO_URI = 'mongodb+srv://<usuario>:<contraseña>@cluster0.mongodb.net/ulsconnect'
node app.js
```

### Opción 3: Fallback a Archivo JSON (Desarrollo)
Si MongoDB no está disponible, la app automáticamente usa almacenamiento en archivo (`.dev-users.json`). Ideal para desarrollo sin dependencias externas.

## 🛠️ Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `app.js` | Servidor principal (Express) |
| `lib/db.js` | Conexión a MongoDB con Mongoose |
| `lib/models/Usuario.js` | Esquema Mongoose de usuarios |
| `lib/userModel.js` | API de autenticación (con fallback) |
| `lib/userModelFallback.js` | Almacenamiento en archivo JSON (dev) |
| `routes/auth.js` | Rutas de signup, login, profile, logout |
| `views/signup.ejs` | Formulario de registro |
| `views/login.ejs` | Formulario de login |
| `views/profile.ejs` | Página de perfil (protegida) |

## 🔒 Seguridad

**Actual (Desarrollo):**
- Contraseñas hasheadas con bcrypt (10 rounds)
- Sesiones en memoria
- Cookie sin flag `secure` (HTTPS deshabilitado)

**Recomendaciones para Producción:**
- Usar store de sesiones persistente (Redis, MongoDB, etc.)
- Activar flag `secure` en cookies (HTTPS obligatorio)
- Cambiar `SESSION_SECRET` a variable de entorno fuerte
- Validar y sanitizar inputs
- Implementar rate limiting para login/signup
- Usar CORS si API y frontend están en dominios diferentes

## 📦 Dependencias

| Paquete | Versión | Propósito |
|---------|---------|----------|
| express | ^4.21.2 | Framework web |
| ejs | ^3.1.10 | Motor de templates |
| mongoose | ^7.5.0 | ODM para MongoDB |
| bcryptjs | ^2.4.3 | Hash de contraseñas |
| express-session | ^1.17.3 | Manejo de sesiones |
| fs-extra | ^11.3.0 | Operaciones con archivos |
| markdown-it | ^14.1.0 | Parser Markdown |
| front-matter | ^4.0.2 | Parser de metadatos |

## 🧪 Pruebas Manuales

### Test: Crear usuario
```powershell
$body = @{
    correoUniversitario = "test@universidad.edu"
    nombre = "Juan Pérez"
    contrasena = "MiPassword123"
}
Invoke-WebRequest -Uri 'http://localhost:3000/signup' `
  -Method POST `
  -ContentType 'application/x-www-form-urlencoded' `
  -Body ([Uri]::EscapeDataString(($body.GetEnumerator() | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '&')) `
  -UseBasicParsing
```

### Test: Login
```powershell
$body = @{
    correoUniversitario = "test@universidad.edu"
    contrasena = "MiPassword123"
}
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$response = Invoke-WebRequest -Uri 'http://localhost:3000/login' `
  -Method POST `
  -ContentType 'application/x-www-form-urlencoded' `
  -Body ([Uri]::EscapeDataString(($body.GetEnumerator() | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '&')) `
  -WebSession $session `
  -UseBasicParsing
# La sesión estará en $session.Cookies
```

## 🔄 Próximos Pasos

1. **Endpoints de actividades** - Crear CRUD para `actividades`
2. **Inscripciones** - Endpoints para registrarse en actividades
3. **Validaciones** - Email, strength de contraseña, etc.
4. **Autorización** - Roles y permisos (admin, coordinador, etc.)
5. **Tests automatizados** - Supertest + Mocha/Jest
6. **API REST** - Considerar JWT en lugar de sesiones
7. **CORS** - Si el frontend está en otro dominio

## 📞 Soporte

Para problemas:
1. Verifica que MongoDB está corriendo (o que tienes conexión Atlas)
2. Revisa logs en la consola de Node
3. Confirma que el puerto 3000 no está ocupado
4. Limpia el archivo `.dev-users.json` si quieres resetear usuarios de desarrollo
