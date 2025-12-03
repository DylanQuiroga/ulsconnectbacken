# Backend ULSConnect

![Static Badge](https://img.shields.io/badge/NodeJs-JS?logo=nodedotjs&labelColor=grey&color=brightgreen)
![Static Badge](https://img.shields.io/badge/Express-%20?logo=express&labelColor=grey&color=yellow)
![Static Badge](https://img.shields.io/badge/Mongodb-%20?logo=mongodb&labelColor=grey&color=%2347A248)
![Static Badge](https://img.shields.io/badge/Jest-%20?logo=jest&labelColor=grey&color=%23C21325)

# Equipo de desarrollo.
<table>
  <tr>
    <td align="center">
      <a href="https://github.com/danielestebanRA">
        <img src="https://github.com/danielestebanRA.png" width="100px;" alt="danielestebanRA"/>
        <br />
        <sub><b>Daniel Rojas</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/vema17">
        <img src="https://github.com/vema17.png" width="100px;" alt="vema17"/>
        <br />
        <sub><b>Vicente Muñoz</b></sub>
      </a>
    </td>
    <td align="center">
       <a href="https://github.com/BenjaSilva19">
         <img src="https://github.com/BenjaSilva19.png" width="100px;" alt="BenjaSilva19"/>
         <br />
         <sub><b>Benjamín Silva</b></sub>
       </a>
     </td>
    <td align="center">
       <a href="https://github.com/DylanQuiroga">
         <img src="https://github.com/DylanQuiroga.png" width="100px;" alt="DylanQuiroga"/>
         <br />
         <sub><b>Dylan Quiroga</b></sub>
       </a>
     </td>
    <td align="center">
       <a href="https://github.com/Josepizarro14">
         <img src="https://github.com/Josepizarro14.png" width="100px;" alt="Josepizarro14"/>
         <br />
         <sub><b>José Pizarro</b></sub>
       </a>
     </td>
    <td align="center">
      <a href="https://github.com/Fherder">
        <img src="https://github.com/Fherder.png" width="100px;" alt="Fherder"/>
        <br />
        <sub><b>Ethan Pimentel</b></sub>
      </a>
    </td>
  </tr>
</table>

## Descripción general.
Este es el backend de ULSConnect, creado con Express.js y listo para desplegarse en Leapcell.
ULSConnect es una propuesta de plataforma web para el voluntariado de SOULS, un programa de voluntarios y actividades benéficas de la Universidad de La Serena.

El propósito de esta página es permitir a los administradores publicar, administrar y recibir métricas de los eventos. Por otra parte, los estudiantes pueden inscribirse como voluntarios en ULSConnect para registrarse en dichas actividades.

## ❇️Características.
- **Administración de eventos:** Administradores pueden publicar, cerrar, y editar convocatorias.
- **Registro de asistencia:** Administradores pueden crear lista de asistencia de un evento, tomar la asistencia de voluntarios, actualizar la lista y editar lista ya existente.
- **Registro de voluntarios:** Un estudiante puede elevar una solicitud para registrarse a SOULS, esta solicitud puede ser aceptada o rechazada por un adminsitrador.
- **Incripción de actividades:** Un voluntario puede inscribirse a un evento, y en caso de cambiar de idea puede cancelar su inscripción.

## 🔧Tecnologías usadas.
- NodeJs.
- Express.
- MongoDB.
- Leapcell.
  
## 📝Prerequisitos.
- Git.
- NodeJs.
- Jest (Para pruebas).
- MongoDB.

## ⬇️Instalación.
1. Clonar repositorio:

   ```
   git clone https://github.com/DylanQuiroga/ulsconnectbacken.git
   cd ulsconnectbacken
   ```
2. Configurar .env:
    ```
    PORT=3000
    NODE_ENV=development
    
    # Configuración de Mongo
    MONGO_URI= [Tu base de datos]
    # Configuración de sesion
    SESSION_SECRET=dev-secret
    
    # Configuración de Email (opcional)
    SMTP_HOST= [opcional]
    SMTP_PORT= 587
    SMTP_USER= [opcional]
    SMTP_PASS= [opcional]
    SMTP_FROM = [opcional]
    
    ADMIN_EMAIL= [opcional]
    
    # Limite de peticiones
    RATE_LIMIT_WINDOW_MS=900000
    RATE_LIMIT_MAX_REQUESTS=5
    
    # Security
    CSRF_TOKEN_LENGTH=32
  
    ```
## ▶️Executar aplicación.
Para iniciar la aplicación abre powershell o cmd en la raíz del proyecto (donde se encuentra el archivo app.js) y ocupa los siguiente comandos:
1. Instala librerías de JavaScript del proyecto:
    ```
    npm install
    ```
2. Inicia el backend:
    ```
    node app.js
    ```
La aplicación estara corriendo en `http://localhost:3000`
