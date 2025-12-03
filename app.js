require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const helmet = require('helmet');
const MongoStore = require('connect-mongo');
const cors = require('cors');
// Importa fs-extra para operaciones de archivos
const fs = require('fs-extra');
// Importa markdown-it para convertir Markdown a HTML
const md = require('markdown-it')();
// Importa front-matter para parsear metadatos
const fm = require('front-matter');
// Importa promisify para convertir callbacks a promesas
const { promisify } = require('util');
// Promisifica la funcion fs.stat
const stat = promisify(fs.stat);

// Seguridad y middleware
const session = require('express-session');
const { authLimiter } = require('./middleware/rateLimiter');
const { csrfToken, validateCSRFToken } = require('./middleware/csrf');
const { initEmailService } = require('./lib/emailService');
const db = require('./lib/db');

// Configuracion de CORS con validacion dinamica de origen
app.use(cors({
    origin: function (origin, callback) {
        const allowed = (process.env.FRONTEND_ORIGIN || '')
            .split(',')
            .map(o => o.trim());

        // Agrega localhost para desarrollo
        allowed.push('http://localhost:5173', 'http://localhost:5174');

        // Permite solicitudes sin origen (apps moviles, Postman, curl)
        if (!origin) return callback(null, true);

        if (allowed.includes(origin)) return callback(null, true);

        return callback(new Error('CORS not allowed for origin ' + origin), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token']
}));

// Cabeceras de seguridad
app.use(helmet());

// Sirve imagenes estaticas
app.use('/images', express.static(path.join(__dirname, 'images')));

// Parseo de body para formularios
app.use(express.urlencoded({ extended: true }));

// Parseo de JSON para APIs
app.use(express.json());

// Configuracion de sesion con store MongoDB (debe ir antes del middleware csrfToken)
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true en produccion (requiere HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
};

// Configura el store de sesion en MongoDB para evitar fallback a memoria
try {
    sessionConfig.store = MongoStore.create({
        mongoUrl: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ulsconnect',
        touchAfter: 24 * 3600 // actualizacion perezosa de sesion (24 horas)
    });
} catch (err) {
    console.warn('⚠️  MongoDB session store unavailable, using memory store');
}

app.use(session(sessionConfig));

// Middleware CSRF (genera tokens para todas las solicitudes) - debe ir despues de la sesion
app.use(csrfToken);

// Endpoint para obtener el token CSRF
app.get('/csrf-token', (req, res) => {
    const token = req.session.csrfToken || res.locals.csrfToken;

    // Guarda el token en una cookie accesible desde JavaScript
    res.cookie('XSRF-TOKEN', token, {
        httpOnly: false, // Importante: false para que JS pueda leerla
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    });

    res.json({
        success: true,
        csrfToken: token
    });
});

// Inicializa el servicio de correo
initEmailService();

// Aplica rate limiting a endpoints de autenticacion
app.post('/signup', authLimiter);
app.post('/login', authLimiter);

// Monta rutas de autenticacion
try {
    const authRouter = require(path.join(__dirname, 'routes', 'auth'));
    app.use('/', authRouter);
} catch (err) {
    // Si el archivo de rutas no existe, ignora para que la app siga corriendo
    console.warn('Auth routes not available:', err && err.message ? err.message : err);
}

// Monta rutas de registro (solicitudes de estudiantes y aprobaciones)
try {
    const registrationRouter = require(path.join(__dirname, 'routes', 'registrationRoutes'));
    app.use('/auth', registrationRouter);
} catch (err) {
    console.warn('Registration routes not available:', err && err.message ? err.message : err);
}

try {
    const activityRouter = require(path.join(__dirname, 'routes', 'activityRoutes'));
    app.use('/events', activityRouter);
    app.use('/api/activities', activityRouter);
} catch (err) {
    // Si el archivo de rutas no existe, ignora para que la app siga corriendo
}

// Monta rutas del panel de voluntarios
try {
    const volunteerPanelRouter = require(path.join(__dirname, 'routes', 'volunteerPanelRoutes'));
    app.use('/volunteer', volunteerPanelRouter);
} catch (err) {
    console.warn('Volunteer panel routes not available:', err && err.message ? err.message : err);
}

// Monta rutas del panel de admin/coordinador
try {
    const adminPanelRouter = require(path.join(__dirname, 'routes', 'adminPanelRoutes'));
    app.use('/admin', adminPanelRouter);
} catch (err) {
    console.warn('Admin panel routes not available:', err && err.message ? err.message : err);
}

// Monta rutas de inscripcion
try {
    const inscripcionRoutes = require(path.join(__dirname, 'routes', 'inscripcionRoutes'));
    app.use('/inscripciones', inscripcionRoutes);
} catch (err) {
    // Si el archivo de rutas no existe, ignora para que la app siga corriendo
}

// Monta rutas de asistencia
try {
    const attendanceRoutes = require(path.join(__dirname, 'routes', 'attendanceRoutes'));
    app.use('/attendance', attendanceRoutes);
} catch (err) {
    console.warn('Attendance routes not available:', err && err.message ? err.message : err);
}

// Intenta conectar a la BD al inicio para ver errores temprano
db.connect().then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.warn('Warning: could not connect to MongoDB. Auth will fail without a DB.');
    // Registra el error para depuracion
    console.warn(err && err.message ? err.message : err);
});

// Obtiene entradas del blog
async function getBlogPosts() {
    // Define la ruta del directorio de contenido
    const contentDir = path.join(__dirname, 'content');
    // Si el directorio no existe, devuelve un arreglo vacio
    const exists = await fs.pathExists(contentDir);
    if (!exists) return [];

    // Lee archivos en el directorio de contenido
    const files = await fs.readdir(contentDir);
    const posts = [];

    for (const file of files) {
        if (file.endsWith('.md')) {
            // Obtiene la ruta del archivo
            const filePath = path.join(contentDir, file);
            // Lee el contenido del archivo
            const fileContent = await fs.readFile(filePath, 'utf8');
            // Parsea el front-matter
            const { attributes, body } = fm(fileContent);

            // Calcula el resumen
            const maxContentLength = 200;
            let summary = body;
            if (body.length > maxContentLength) {
                summary = summary.substring(0, maxContentLength) + '...';
            }
            // Convierte Markdown a HTML
            const htmlContent = md.render(body);
            // Obtiene estadisticas del archivo
            const stats = await stat(filePath);
            // Obtiene la fecha de creacion
            let creationDate = new Date(stats.ctime);
            if (attributes.date) {
                creationDate = new Date(attributes.date);
            }
            // Genera el slug desde el nombre del archivo
            const slug = file.replace('.md', '').replace(/ /g, '-');

            // Crea el objeto post
            const post = {
                title: attributes.title || file.replace('.md', ''),
                summary: attributes.summary || summary, // Usa el resumen si esta disponible
                content: htmlContent,
                dateString: creationDate.toISOString(), // Convierte la fecha a string
                date: creationDate,
                tags: attributes.tags || [],
                slug: slug,
            };
            posts.push(post);
        }
    }

    // Ordena los posts por fecha de creacion descendente
    posts.sort((a, b) => b.date - a.date);
    return posts;
}

// Ruta raiz - devuelve las entradas disponibles como JSON
app.get('/', async (req, res) => {
    try {
        const posts = await getBlogPosts();
        res.json({
            success: true,
            message: 'Available blog posts',
            posts: posts.map(p => ({
                title: p.title,
                slug: p.slug,
                summary: p.summary,
                dateString: p.dateString,
                tags: p.tags,
                url: `/blog/${p.slug}`
            }))
        });
    } catch (err) {
        console.error('Error fetching posts:', err);
        res.status(500).json({ success: false, message: 'Error fetching posts', error: err.message });
    }
});

// Ruta de post individual - devuelve el contenido completo como JSON
app.get('/blog/:postTitle', async (req, res) => {
    try {
        const postTitle = req.params.postTitle;
        const posts = await getBlogPosts();
        const post = posts.find(p => p.slug === postTitle);

        if (post) {
            res.json({
                success: true,
                post: {
                    title: post.title,
                    slug: post.slug,
                    content: post.content,
                    dateString: post.dateString,
                    tags: post.tags
                }
            });
        } else {
            res.status(404).json({ success: false, message: 'Post not found' });
        }
    } catch (err) {
        console.error('Error fetching post:', err);
        res.status(500).json({ success: false, message: 'Error fetching post', error: err.message });
    }
});

// Inicia el servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Available at: http://localhost:${port}`);
    console.log(`Available at: http://127.0.0.1:${port}`);
});
