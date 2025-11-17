# ULSConnect JSON API Guide

**Current Version:** Pure JSON API (No HTML/EJS Rendering)

All endpoints now return JSON responses with appropriate HTTP status codes. This guide details the JSON API endpoints.

---

## Table of Contents

1. [Server Startup](#server-startup)
2. [Authentication Endpoints](#authentication-endpoints)
3. [Registration Endpoints](#registration-endpoints)
4. [Activity Endpoints](#activity-endpoints)
5. [Blog Endpoints](#blog-endpoints)
6. [Error Handling](#error-handling)
7. [Status Codes](#status-codes)

---

## Server Startup

### Development Mode (with auto-reload)
```bash
npm run dev
```
Expected output:
```
Server running on port 3000
Connected to MongoDB
```

### Production Mode
```bash
npm start
# or
node app.js
```

---

## Authentication Endpoints

### Base URL
```
http://localhost:3000/auth
```

### 1. Signup Instructions (GET)
**GET** `/signup`

Returns instructions for signing up via JSON API.

**Response (200 OK):**
```json
{
  "message": "Para registrarse, envíe un POST a /auth/signup...",
  "endpoint": "POST /auth/signup",
  "requiredFields": ["correoUniversitario", "contrasena", "nombre"],
  "optionalFields": ["telefono", "carrera", "intereses"]
}
```

---

### 2. Sign Up (POST)
**POST** `/signup`

Create a registration request (requires admin approval before user can login).

**Request Body:**
```json
{
  "correoUniversitario": "estudiante@userena.cl",
  "contrasena": "SecurePassword123",
  "nombre": "Juan Pérez",
  "telefono": "+56912345678",
  "carrera": "Ingeniería en Informática",
  "intereses": ["Python", "Web Development"]
}
```

**Response (201 Created) - Success:**
```json
{
  "success": true,
  "message": "Solicitud de registro enviada. Un administrador revisará su cuenta.",
  "registrationRequestId": "507f1f77bcf86cd799439011"
}
```

**Response (400 Bad Request) - Validation Error:**
```json
{
  "success": false,
  "message": "Correo, nombre y contraseña son requeridos"
}
```

**Response (409 Conflict) - User/Request Exists:**
```json
{
  "success": false,
  "message": "El usuario ya existe"
}
```
or
```json
{
  "success": false,
  "message": "Ya existe una solicitud pendiente para este correo"
}
```

---

### 3. Login Instructions (GET)
**GET** `/login`

Returns instructions for logging in via JSON API.

**Response (200 OK):**
```json
{
  "message": "Para iniciar sesión, envíe un POST a /auth/login...",
  "endpoint": "POST /auth/login",
  "requiredFields": ["correoUniversitario", "contrasena"]
}
```

---

### 4. Login (POST)
**POST** `/login`

Authenticate user and establish session.

**Request Body:**
```json
{
  "correoUniversitario": "estudiante@userena.cl",
  "contrasena": "SecurePassword123"
}
```

**Response (200 OK) - Success:**
```json
{
  "success": true,
  "message": "Sesión iniciada correctamente",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "correoUniversitario": "estudiante@userena.cl",
    "nombre": "Juan Pérez",
    "role": "estudiante"
  }
}
```

**Response (400 Bad Request) - Missing Fields:**
```json
{
  "success": false,
  "message": "Correo y contraseña requeridos"
}
```

**Response (401 Unauthorized) - Invalid Credentials:**
```json
{
  "success": false,
  "message": "Correo o contraseña inválidos"
}
```

---

### 5. Get Profile (GET)
**GET** `/profile`

Retrieve current authenticated user's profile.

**Headers:**
```
Cookie: connect.sid=<session_id>
```

**Response (200 OK) - Authenticated:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "correoUniversitario": "estudiante@userena.cl",
    "nombre": "Juan Pérez",
    "role": "estudiante"
  }
}
```

**Response (401 Unauthorized) - Not Authenticated:**
```json
{
  "success": false,
  "message": "No autenticado"
}
```

---

### 6. Logout (GET)
**GET** `/logout`

Destroy session and logout user.

**Response (200 OK) - Success:**
```json
{
  "success": true,
  "message": "Sesión cerrada correctamente"
}
```

---

## Registration Endpoints

### Base URL
```
http://localhost:3000/auth
```

### 1. List Pending Requests (GET)
**GET** `/requests`

List all pending registration requests (admin/staff only).

**Headers:**
```
Cookie: connect.sid=<session_id>
```

**Response (200 OK):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "correoUniversitario": "nuevo@userena.cl",
    "nombre": "Nuevo Usuario",
    "telefono": "+56912345678",
    "carrera": "Ingeniería",
    "intereses": ["Python"],
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

**Response (401 Unauthorized):** User not authenticated
**Response (403 Forbidden):** User not admin/staff

---

### 2. Approve Registration Request (POST)
**POST** `/requests/:id/approve`

Approve a pending registration request (creates user account).

**URL Parameters:**
- `id`: MongoDB ID of registration request

**Response (200 OK) - Success:**
```json
{
  "message": "Approved",
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "correoUniversitario": "nuevo@userena.cl"
  }
}
```

**Response (404 Not Found):**
```json
{
  "message": "Not found"
}
```

**Response (400 Bad Request):**
```json
{
  "message": "Request not pending"
}
```

---

### 3. Reject Registration Request (POST)
**POST** `/requests/:id/reject`

Reject a pending registration request.

**URL Parameters:**
- `id`: MongoDB ID of registration request

**Request Body (Optional):**
```json
{
  "notes": "Correo institucional no válido"
}
```

**Response (200 OK) - Success:**
```json
{
  "message": "Rejected"
}
```

---

## Activity Endpoints

### Base URL
```
http://localhost:3000/api/activities
```

### 1. List All Activities (GET)
**GET** `/`

Retrieve all activities sorted by start date.

**Response (200 OK):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439013",
    "titulo": "Workshop: Python Avanzado",
    "descripcion": "Taller sobre técnicas avanzadas de Python",
    "area": "Tecnología",
    "tipo": "workshop",
    "fechaInicio": "2024-02-15T10:00:00Z",
    "fechaFin": "2024-02-15T12:00:00Z",
    "ubicacion": "Sala 101",
    "capacidad": 30,
    "estado": "published"
  }
]
```

---

### 2. Create Activity (POST)
**POST** `/`

Create a new activity (admin/staff only).

**Request Body:**
```json
{
  "titulo": "Seminario: Cloud Computing",
  "descripcion": "Introducción a servicios en la nube",
  "area": "Tecnología",
  "tipo": "seminar",
  "fechaInicio": "2024-03-01T14:00:00Z",
  "fechaFin": "2024-03-01T16:00:00Z",
  "ubicacion": "Auditorio",
  "capacidad": 50,
  "estado": "draft"
}
```

**Response (201 Created):**
```json
{
  "_id": "507f1f77bcf86cd799439014",
  "titulo": "Seminario: Cloud Computing",
  ...
}
```

---

### 3. Get Single Activity (GET)
**GET** `/:id`

Retrieve details of a specific activity.

**URL Parameters:**
- `id`: MongoDB ID of activity

**Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "titulo": "Workshop: Python Avanzado",
  ...
}
```

**Response (404 Not Found):**
```json
{
  "message": "Not found"
}
```

---

### 4. Update Activity (PUT)
**PUT** `/:id`

Update activity details (admin/staff only).

**Request Body:**
```json
{
  "titulo": "Workshop: Python Avanzado (Actualizado)",
  "capacidad": 40,
  "estado": "published"
}
```

**Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "titulo": "Workshop: Python Avanzado (Actualizado)",
  ...
}
```

---

### 5. Delete Activity (DELETE)
**DELETE** `/:id`

Delete an activity (admin/staff only).

**Response (200 OK):**
```json
{
  "message": "Deleted"
}
```

---

### 6. Enroll in Activity (POST)
**POST** `/:id/enroll`

Enroll a user in an activity (estudiante only).

**Request Body:**
```json
{
  "idUsuario": "507f1f77bcf86cd799439011",
  "respuestas": {
    "experiencia": "Intermedio",
    "motivacion": "Aprender nuevas habilidades"
  }
}
```

**Response (201 Created):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "idActividad": "507f1f77bcf86cd799439013",
  "idUsuario": "507f1f77bcf86cd799439011",
  "estado": "inscrito",
  "respuestas": {...}
}
```

**Response (409 Conflict):**
```json
{
  "message": "Already enrolled"
}
```

---

### 7. Unenroll from Activity (POST)
**POST** `/:id/unenroll`

Cancel enrollment in an activity (estudiante only).

**Request Body:**
```json
{
  "idUsuario": "507f1f77bcf86cd799439011"
}
```

**Response (200 OK):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "estado": "cancelado"
}
```

---

### 8. List Enrollments (GET)
**GET** `/:id/enrollments`

List all enrollments for an activity.

**Response (200 OK):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439015",
    "idActividad": "507f1f77bcf86cd799439013",
    "idUsuario": {
      "_id": "507f1f77bcf86cd799439011",
      "nombre": "Juan Pérez",
      "correoUniversitario": "juan@userena.cl"
    },
    "estado": "inscrito"
  }
]
```

---

### 9. Record Attendance (POST)
**POST** `/:id/attendance`

Record attendance for a user in an activity (admin/staff or the student recording their own).

**Request Body:**
```json
{
  "idUsuario": "507f1f77bcf86cd799439011",
  "fecha": "2024-02-15T10:15:00Z",
  "metodo": "QR",
  "evento": "Entrada"
}
```

**Response (201 Created):**
```json
{
  "enrollment": {...},
  "attendance": {
    "_id": "507f1f77bcf86cd799439016",
    "idActividad": "507f1f77bcf86cd799439013",
    "idUsuario": "507f1f77bcf86cd799439011",
    "fecha": "2024-02-15T10:15:00Z",
    "evento": "Entrada"
  }
}
```

**Response (403 Forbidden):**
```json
{
  "message": "Estudiantes sólo pueden registrar su propia asistencia"
}
```

---

### 10. List Attendance (GET)
**GET** `/:id/attendance`

List all attendance records for an activity.

**Response (200 OK):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439016",
    "idActividad": "507f1f77bcf86cd799439013",
    "idUsuario": {
      "_id": "507f1f77bcf86cd799439011",
      "nombre": "Juan Pérez",
      "correoUniversitario": "juan@userena.cl"
    },
    "fecha": "2024-02-15T10:15:00Z"
  }
]
```

---

## Blog Endpoints

### 1. List All Blog Posts (GET)
**GET** `/`

Retrieve all available blog posts with summaries.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Available blog posts",
  "posts": [
    {
      "title": "Mi Primer Post",
      "slug": "mi-primer-post",
      "summary": "Este es un resumen...",
      "dateString": "2024-01-10T00:00:00.000Z",
      "tags": ["tecnología", "javascript"],
      "url": "/blog/mi-primer-post"
    }
  ]
}
```

---

### 2. Get Single Blog Post (GET)
**GET** `/blog/:postTitle`

Retrieve full content of a specific blog post.

**URL Parameters:**
- `postTitle`: Slug of the post (e.g., `mi-primer-post`)

**Response (200 OK):**
```json
{
  "success": true,
  "post": {
    "title": "Mi Primer Post",
    "slug": "mi-primer-post",
    "content": "<h1>Mi Primer Post</h1><p>Contenido del post en HTML...</p>",
    "dateString": "2024-01-10T00:00:00.000Z",
    "tags": ["tecnología", "javascript"]
  }
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "message": "Post not found"
}
```

---

## Error Handling

All errors return consistent JSON format:

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "Detalle técnico opcional"
}
```

---

## Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET/POST requests, login success |
| 201 | Created | Resource created (signup, enroll, activities created) |
| 400 | Bad Request | Validation errors, missing required fields |
| 401 | Unauthorized | Not authenticated / Invalid credentials |
| 403 | Forbidden | Authenticated but not authorized (wrong role) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate registration, duplicate enrollment, already exists |
| 500 | Internal Error | Database/system errors |

---

## Security Features

- ✅ **CSRF Protection:** All POST endpoints (except public ones) require CSRF token validation
- ✅ **Rate Limiting:** Auth endpoints (/signup, /login) limited to 5 requests per 15 minutes
- ✅ **Session Management:** User sessions stored in MongoDB (24-hour expiration)
- ✅ **Password Hashing:** bcryptjs with salt rounds 10
- ✅ **Role-Based Access:** Admin/Staff, Estudiante roles with appropriate restrictions
- ✅ **Helmet.js:** Security headers enabled by default

---

## Testing with Postman

1. Import the `ULSConnect.postman_collection.json` file into Postman
2. Follow the endpoints listed in this guide
3. Use the `baseUrl` variable: `http://localhost:3000`
4. Sessions are automatically managed by Postman cookies

---

**Last Updated:** 2024-01-15
**API Version:** 1.0 (Pure JSON)
