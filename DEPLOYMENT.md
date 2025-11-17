# ULSConnect Backend - Deployment & Testing Guide

## 🚀 Production Deployment Checklist

### 1. Environment Configuration
Before deploying to production, configure `.env` with production values:

```bash
# Copy template
cp .env.example .env

# Edit .env with production values:
PORT=3000
NODE_ENV=production

# MongoDB Connection
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# Session Security
SESSION_SECRET=<generate-strong-random-string-min-32-chars>

# SMTP Configuration (Email Notifications)
SMTP_HOST=<your-smtp-server>
SMTP_PORT=587
SMTP_USER=<your-email@domain.com>
SMTP_PASS=<your-email-password>
SMTP_FROM=noreply@ulsconnect.cl

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=5    # Max 5 requests per window

# CSRF Settings
CSRF_ENABLED=true
```

### 2. Dependencies Installation
```bash
npm install --production
```

### 3. Security Requirements

#### HTTPS/SSL Certificate
- Production requires HTTPS (secure cookies enabled when NODE_ENV=production)
- Obtain SSL certificate from Let's Encrypt or your provider
- Configure in your reverse proxy (nginx/Apache) or Express app

#### Database Authentication
- Enable MongoDB authentication with strong credentials
- Use connection string with credentials in MONGO_URI

#### Session Secret
- Generate cryptographically secure random string for SESSION_SECRET
- Minimum 32 characters recommended
- Never commit to version control

#### SMTP Credentials
- Use application-specific password if 2FA enabled
- Store credentials securely (never in code)
- Test email sending before production deployment

### 4. Deployment Steps

#### Option A: Docker Deployment
```bash
docker build -t ulsconnect-backend .
docker run -d \
  --name ulsconnect \
  -p 3000:3000 \
  --env-file .env \
  ulsconnect-backend
```

#### Option B: Traditional Server
```bash
# Copy files to server
scp -r . user@server:/var/www/ulsconnect/

# SSH into server
ssh user@server

# Install dependencies
cd /var/www/ulsconnect
npm install --production

# Start application with PM2 (recommended)
npm install -g pm2
pm2 start app.js --name "ulsconnect" --env production
pm2 startup
pm2 save
```

### 5. Nginx Reverse Proxy Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name api.ulsconnect.cl;
    
    ssl_certificate /etc/ssl/certs/ulsconnect.crt;
    ssl_certificate_key /etc/ssl/private/ulsconnect.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name api.ulsconnect.cl;
    return 301 https://$server_name$request_uri;
}
```

---

## 🧪 Testing Guide

### 1. Unit Tests - Registration Workflow

#### Test: Registration Request Creation (CSRF Protection)
```bash
# Get CSRF token from signup page
curl -c cookies.txt http://localhost:3000/signup

# Extract csrfToken from HTML and use in request
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "correoUniversitario": "estudiante@usena.cl",
    "nombre": "Test Estudiante",
    "contrasena": "SecurePass123!",
    "_csrf": "EXTRACTED_TOKEN_HERE"
  }'
# Expected: 200 with redirect or success message
```

#### Test: Rate Limiting (5 requests per 15 min)
```bash
# Make 6 rapid login attempts to trigger rate limit
for i in {1..6}; do
  curl -X POST http://localhost:3000/login \
    -H "Content-Type: application/json" \
    -d '{
      "correoUniversitario": "test@usena.cl",
      "contrasena": "wrong"
    }'
  echo "Attempt $i"
done
# Expected: 6th request returns 429 Too Many Requests
```

#### Test: Admin Approval with Email
```bash
# 1. Admin logs in
curl -c admin-cookies.txt -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "correoUniversitario": "admin@usena.cl",
    "contrasena": "admin_password"
  }'

# 2. Approve pending registration (sends email)
curl -X POST http://localhost:3000/registrations/requests/REGISTRATION_ID/approve \
  -b admin-cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"notes": "Welcome to ULS!"}'
# Expected: 200 + email sent to student
```

#### Test: Institutional Email Validation
```bash
# Valid: @usena.cl domain
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{
    "correoUniversitario": "student@usena.cl",
    "nombre": "Test",
    "contrasena": "Pass123!"
  }'
# Expected: 200 (accepted)

# Invalid: non-institutional domain
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{
    "correoUniversitario": "student@gmail.com",
    "nombre": "Test",
    "contrasena": "Pass123!"
  }'
# Expected: 400 with error about invalid email domain
```

### 2. Integration Tests - Session Persistence

#### Test: MongoDB Session Store
```bash
# 1. Login and get session
curl -c cookies.txt -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "correoUniversitario": "test@usena.cl",
    "contrasena": "password"
  }'

# 2. Verify session persists in MongoDB
mongo --uri "$MONGO_URI"
db.sessions.find({ "session.user.id": ObjectId("...") })
# Expected: Session document found

# 3. Restart app and verify session still valid
# (Kill and restart Node.js process)

# 4. Use same cookies
curl -b cookies.txt http://localhost:3000/profile
# Expected: 200 + user profile (not logged out after restart)
```

### 3. Security Tests

#### Test: CSRF Protection
```bash
# Attempt request without CSRF token
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "correoUniversitario": "test@usena.cl",
    "contrasena": "password"
  }'
# Expected: 403 Forbidden (invalid or missing CSRF token)
```

#### Test: Security Headers (Helmet)
```bash
curl -I http://localhost:3000/

# Expected headers:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=... (production only)
```

#### Test: Role-Based Access Control
```bash
# 1. Login as student
curl -c student-cookies.txt -X POST http://localhost:3000/login \
  -d '{"correoUniversitario": "student@usena.cl", "contrasena": "pass"}'

# 2. Attempt admin-only endpoint (should fail)
curl -b student-cookies.txt -X POST http://localhost:3000/activities \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Test Activity"}'
# Expected: 403 Forbidden or 401 Unauthorized

# 3. Login as admin and retry
curl -c admin-cookies.txt -X POST http://localhost:3000/login \
  -d '{"correoUniversitario": "admin@usena.cl", "contrasena": "pass"}'

curl -b admin-cookies.txt -X POST http://localhost:3000/activities \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Test Activity"}'
# Expected: 200 (created)
```

### 4. Email Notification Testing

#### Test: Registration Request Notification
```bash
# Create registration request
curl -X POST http://localhost:3000/registrations/request \
  -H "Content-Type: application/json" \
  -d '{
    "correoUniversitario": "new@usena.cl",
    "nombre": "New User",
    "contrasena": "Pass123!"
  }'

# Check admin email - should receive notification
# Email subject: "Nueva Solicitud de Registro - ULSConnect"
# Email body: Student details and approval link
```

#### Test: Approval Notification
```bash
# Admin approves registration (from previous test)
curl -X POST http://localhost:3000/registrations/requests/REQUEST_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"notes": "Aprobado"}'

# Check student email - should receive approval notification
# Email subject: "Tu registro ha sido aprobado - ULSConnect"
```

#### Test: Rejection Notification
```bash
# Admin rejects registration
curl -X POST http://localhost:3000/registrations/requests/REQUEST_ID/reject \
  -H "Content-Type: application/json" \
  -d '{"notes": "Email no válido"}'

# Check student email - should receive rejection notification
# Email subject: "Tu registro ha sido rechazado - ULSConnect"
```

---

## 📊 Production Monitoring

### 1. Application Logs
```bash
# View logs with PM2
pm2 logs ulsconnect

# View MongoDB session activity
db.sessions.stats()

# Check error count
grep "ERROR" /var/log/ulsconnect.log | wc -l
```

### 2. Health Check Endpoint (Optional - Add to app.js)
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});
```

Test with:
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2024-..."}
```

### 3. Database Monitoring
```bash
# Check MongoDB connection
mongo --uri "$MONGO_URI" --eval "db.adminCommand('ping')"

# Monitor active connections
db.serverStatus().connections

# Session collection size
db.sessions.stats().size
```

---

## 🔧 Troubleshooting

### Issue: CSRF Token Mismatch
**Cause:** Session not properly initialized or token expired
**Fix:**
1. Verify `SESSION_SECRET` is set and consistent
2. Check cookie settings match secure requirements
3. Ensure CSRF token is regenerated after login

### Issue: Emails Not Sending
**Cause:** SMTP configuration incorrect
**Fix:**
1. Verify SMTP credentials in `.env`
2. Check SMTP_HOST and SMTP_PORT are correct
3. Test manually: `node -e "require('./lib/emailService').initEmailService(); console.log('SMTP initialized')"`

### Issue: Rate Limiting Not Working
**Cause:** Proxy/load balancer not forwarding real IP
**Fix:**
1. Update app.js: `app.set('trust proxy', 1)`
2. Ensure X-Forwarded-For header passed by reverse proxy

### Issue: Sessions Lost After Restart
**Cause:** MongoDB session store not connected
**Fix:**
1. Verify MONGO_URI in `.env`
2. Check MongoDB server is running and accessible
3. Verify user permissions for sessions collection

---

## ✅ Pre-Deployment Checklist

- [ ] `.env` configured with production values
- [ ] MongoDB connection tested and verified
- [ ] SMTP credentials tested (email sending works)
- [ ] SSL/HTTPS certificate installed
- [ ] Reverse proxy configured (Nginx/Apache)
- [ ] Rate limiting tested (5 requests/15 min)
- [ ] CSRF protection tested (invalid tokens rejected)
- [ ] Session persistence tested (MongoDB store working)
- [ ] Email notifications tested (all three types working)
- [ ] Security headers verified (Helmet working)
- [ ] Database backups configured
- [ ] Monitoring/logging setup complete
- [ ] Team trained on incident response

---

## 📝 Maintenance Tasks

### Daily
- Monitor application logs for errors
- Check MongoDB disk usage

### Weekly
- Review failed login attempts
- Clean up expired sessions: `db.sessions.deleteMany({ "session.expires": { $lt: new Date() } })`

### Monthly
- Update dependencies: `npm audit fix`
- Review and rotate SESSION_SECRET if needed
- Analyze user registration trends

---

**Last Updated:** 2024
**Version:** 1.0 (Production Hardening Release)
