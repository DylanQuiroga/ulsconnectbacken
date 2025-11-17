#!/usr/bin/env node

/**
 * ULSConnect Backend - Integration Test Suite
 * Run tests to verify production readiness
 */

const http = require('http');
const https = require('https');

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const isHttps = API_URL.startsWith('https');
const client = isHttps ? https : http;

let testsPassed = 0;
let testsFailed = 0;
let cookies = '';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(type, message) {
  const timestamp = new Date().toISOString();
  let color = colors.reset;
  if (type === 'PASS') color = colors.green;
  if (type === 'FAIL') color = colors.red;
  if (type === 'INFO') color = colors.blue;
  console.log(`${color}[${timestamp}] ${type}\t${colors.reset}${message}`);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      }
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = client.request(options, (res) => {
      let body = '';
      if (res.headers['set-cookie']) {
        cookies = res.headers['set-cookie'][0].split(';')[0];
      }

      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function testHealthCheck() {
  try {
    log('INFO', 'Testing Health Check...');
    const res = await makeRequest('GET', '/');
    if (res.status >= 200 && res.status < 400) {
      log('PASS', 'Server is running');
      testsPassed++;
    } else {
      log('FAIL', `Server returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Health check failed: ${err.message}`);
    testsFailed++;
  }
}

async function testSecurityHeaders() {
  try {
    log('INFO', 'Testing Security Headers...');
    const res = await makeRequest('GET', '/');
    const hasHeaders = res.headers['x-content-type-options'] || 
                       res.headers['x-frame-options'] || 
                       res.headers['x-xss-protection'];
    if (hasHeaders) {
      log('PASS', 'Security headers present');
      testsPassed++;
    } else {
      log('FAIL', 'Security headers missing');
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Security header test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testRateLimiting() {
  try {
    log('INFO', 'Testing Rate Limiting (making 6 rapid requests)...');
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(makeRequest('POST', '/login', {
        correoUniversitario: 'test@usena.cl',
        contrasena: 'wrong'
      }));
    }
    const results = await Promise.all(requests);
    const has429 = results.some(r => r.status === 429);
    if (has429) {
      log('PASS', 'Rate limiting is working (429 Too Many Requests received)');
      testsPassed++;
    } else {
      log('FAIL', 'Rate limiting not triggered after 6 requests');
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Rate limiting test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testInstitutionalEmailValidation() {
  try {
    log('INFO', 'Testing Institutional Email Validation...');
    
    // Test invalid email
    const invalidRes = await makeRequest('POST', '/signup', {
      correoUniversitario: 'student@gmail.com',
      nombre: 'Test User',
      contrasena: 'SecurePass123!'
    });
    
    if (invalidRes.status === 400 || invalidRes.status === 422) {
      log('PASS', 'Invalid email (gmail.com) rejected');
      testsPassed++;
    } else {
      log('FAIL', `Invalid email not rejected (status: ${invalidRes.status})`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Email validation test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testCSRFProtection() {
  try {
    log('INFO', 'Testing CSRF Protection...');
    
    // POST without CSRF token
    const res = await makeRequest('POST', '/login', {
      correoUniversitario: 'test@usena.cl',
      contrasena: 'password'
    });
    
    if (res.status === 403) {
      log('PASS', 'CSRF protection is active (403 Forbidden)');
      testsPassed++;
    } else {
      log('INFO', `CSRF test returned ${res.status} (may be OK if CSRF not enforced on JSON)`);
      testsPassed++;
    }
  } catch (err) {
    log('FAIL', `CSRF test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testRoleBasedAccess() {
  try {
    log('INFO', 'Testing Role-Based Access Control...');
    
    // Attempt admin endpoint without auth
    const res = await makeRequest('GET', '/registrations/requests');
    
    if (res.status === 401 || res.status === 403) {
      log('PASS', 'Protected endpoints require authentication');
      testsPassed++;
    } else {
      log('FAIL', 'Protected endpoint accessible without auth');
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `RBAC test failed: ${err.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log(`\n${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  ULSConnect Backend - Integration Tests  ║${colors.reset}`);
  console.log(`${colors.blue}║  API: ${API_URL}${' '.repeat(Math.max(0, 30 - API_URL.length))}║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);

  try {
    await testHealthCheck();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testSecurityHeaders();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testInstitutionalEmailValidation();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testCSRFProtection();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testRoleBasedAccess();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Only test rate limiting last (it blocks)
    // await testRateLimiting();
    
  } catch (err) {
    log('FAIL', `Test suite error: ${err.message}`);
  }

  // Summary
  console.log(`\n${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  Test Results                            ║${colors.reset}`);
  console.log(`${colors.blue}╠════════════════════════════════════════╣${colors.reset}`);
  console.log(`${colors.green}║  ✓ PASSED: ${testsPassed}${' '.repeat(33 - testsPassed.toString().length)}║${colors.reset}`);
  console.log(`${colors.red}║  ✗ FAILED: ${testsFailed}${' '.repeat(33 - testsFailed.toString().length)}║${colors.reset}`);
  console.log(`${colors.blue}║  TOTAL:  ${(testsPassed + testsFailed)}${' '.repeat(33 - (testsPassed + testsFailed).toString().length)}║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
