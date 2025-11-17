require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const helmet = require('helmet');
const MongoStore = require('connect-mongo');
// Import fs-extra module for file operations
const fs = require('fs-extra');
// Import markdown-it for Markdown to HTML conversion
const md = require('markdown-it')();
// Import front-matter for parsing metadata
const fm = require('front-matter');
// Import promisify to convert callback functions to promises
const { promisify } = require('util');
// Promisify fs.stat function
const stat = promisify(fs.stat);

const cors = require('cors');

// Session support
// Security and middleware
const session = require('express-session');
const { authLimiter } = require('./middleware/rateLimiter');
const { csrfToken, validateCSRFToken } = require('./middleware/csrf');
const { initEmailService } = require('./lib/emailService');
const db = require('./lib/db');

// Security headers
app.use(helmet());

// Set EJS as view engine
app.set('view engine', 'ejs');
// Set views directory
app.set('views', path.join(__dirname, 'views'));

app.set("trust proxy", 1);

// Serve static images
app.use('/images', express.static(path.join(__dirname, 'images')));

app.use(cors({
    origin: function (origin, callback) {
        const allowed = (process.env.FRONTEND_ORIGIN || '')
            .split(',')
            .map(o => o.trim());

        // localhost extra
        allowed.push('http://localhost:5173', 'http://localhost:5174');

        if (!origin) return callback(null, true);
        if (allowed.includes(origin)) return callback(null, true);
        return callback(new Error('CORS not allowed for origin ' + origin), false);
    },
    credentials: true
}));


// Body parsing for form submissions
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JSON body parser for APIs
app.use(express.json());

// Session configuration with MongoDB store (MUST come before csrfToken middleware)
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in production (requires HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Use MongoDB store for sessions (if connected)
db.connect().then(() => {
    sessionConfig.store = MongoStore.create({
        mongoUrl: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ulsconnect',
        touchAfter: 24 * 3600 // lazy session update (24 hours)
    });
}).catch(err => {
    console.warn('⚠️  MongoDB session store unavailable, using memory store');
});

app.use(session(sessionConfig));

// CSRF token middleware (generate tokens for all requests) - MUST come after session
app.use(csrfToken);

// Initialize email service
initEmailService();

// Apply rate limiting to auth endpoints
app.post('/signup', authLimiter);
app.post('/login', authLimiter);

// Mount auth routes (created separately)
try {
    const authRouter = require(path.join(__dirname, 'routes', 'auth'));
    app.use('/', authRouter);
} catch (err) {
    // If the routes file doesn't exist yet, ignore so app still runs
    console.warn('Auth routes not available:', err && err.message ? err.message : err);
}

// Mount activity routes
try {
    const activityRouter = require(path.join(__dirname, 'routes', 'activityRoutes'));
    app.use('/api/activities', activityRouter);
} catch (err) {
    console.warn('Activity routes not available:', err && err.message ? err.message : err);
}

// Mount registration routes (student requests + admin approvals)
try {
    const registrationRouter = require(path.join(__dirname, 'routes', 'registrationRoutes'));
    app.use('/auth', registrationRouter);
} catch (err) {
    console.warn('Registration routes not available:', err && err.message ? err.message : err);
}

try {
    const activityRouter = require(path.join(__dirname, 'routes', 'activity'));
    app.use('/api/actividades', activityRouter);
} catch (err) {
    // If the routes file doesn't exist yet, ignore so app still runs
}

// Try connecting to DB at startup so errors are visible early
db.connect().then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.warn('Warning: could not connect to MongoDB. Auth will fail without a DB.');
    // log error for debugging
    console.warn(err && err.message ? err.message : err);
});

// Fetch blog posts
async function getBlogPosts() {
    // Define content directory path
    const contentDir = path.join(__dirname, 'content');
    // Read files in content directory
    const files = await fs.readdir(contentDir);
    const posts = [];

    for (const file of files) {
        if (file.endsWith('.md')) {
            // Get file path
            const filePath = path.join(contentDir, file);
            // Read file content
            const fileContent = await fs.readFile(filePath, 'utf8');
            // Parse front-matter
            const { attributes, body } = fm(fileContent);

            // Get summary
            const maxContentLength = 200;
            let summary = body;
            if (body.length > maxContentLength) {
                summary = summary.substring(0, maxContentLength) + '...';
            }
            // Convert Markdown to HTML
            const htmlContent = md.render(body);
            // Get file stats
            const stats = await stat(filePath);
            // Get file creation date
            let creationDate = new Date(stats.ctime);
            if (attributes.date) {
                creationDate = new Date(attributes.date);
            }
            // Get slug from file name
            const slug = file.replace('.md', '').replace(/ /g, '-');

            // Create post object
            const post = {
                title: attributes.title || file.replace('.md', ''),
                summary: attributes.summary || summary, // Use summary if available
                content: htmlContent,
                dateString: creationDate.toISOString(), // Convert date to string
                date: creationDate,
                tags: attributes.tags || [],
                slug: slug,
            };
            posts.push(post);
        }
    }

    // Sort posts by creation date in descending order
    posts.sort((a, b) => b.date - a.date);
    return posts;
}

// Home page route - Returns available posts as JSON
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

// Single post route - Returns full post content as JSON
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

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});