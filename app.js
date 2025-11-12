const express = require('express');
const app = express();
const path = require('path');
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

// Session support
const session = require('express-session');
const db = require('./lib/db');

// Set EJS as view engine
app.set('view engine', 'ejs');
// Set views directory
app.set('views', path.join(__dirname, 'views'));

// Serve static images
app.use('/images', express.static(path.join(__dirname, 'images')));

// Body parsing for form submissions
app.use(express.urlencoded({ extended: true }));

// JSON body parser for APIs
app.use(express.json());

// Basic session configuration (for demo). In production, use secure store & env secret
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Mount auth routes (created separately)
try {
    const authRouter = require(path.join(__dirname, 'routes', 'auth'));
    app.use('/', authRouter);
} catch (err) {
    // If the routes file doesn't exist yet, ignore so app still runs
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

// Home page route
app.get('/', async (req, res) => {
    const posts = await getBlogPosts();
    res.render('index', { posts });
});

// Single post route
app.get('/blog/:postTitle', async (req, res) => {
    // Replace hyphens with spaces in post title
    const postTitle = req.params.postTitle;
    const posts = await getBlogPosts();
    // Find post by title
    const post = posts.find(p => 
        p.slug === postTitle);

    if (post) {
        res.render('single', { post });
    } else {
        res.status(404).send('Post not found');
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});