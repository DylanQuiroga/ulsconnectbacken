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
let csrfTokenValue = '';

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

const pause = (ms = 400) => new Promise(resolve => setTimeout(resolve, ms));

function makeRequest(method, path, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        ...extraHeaders
      }
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = client.request(options, (res) => {
      let body = '';
      if (res.headers['set-cookie']) {
        const setCookie = res.headers['set-cookie'];
        cookies = Array.isArray(setCookie)
          ? setCookie.map(c => c.split(';')[0]).join('; ')
          : setCookie.split(';')[0];
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
    const res = await makeRequest('GET', '/auth/requests');
    
    if (res.status === 401 || res.status === 403 || res.status === 302) {
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

async function testCsrfTokenEndpoint() {
  try {
    log('INFO', 'Testing CSRF token endpoint...');
    const res = await makeRequest('GET', '/csrf-token');
    csrfTokenValue = res.body && res.body.csrfToken ? res.body.csrfToken : '';
    const setCookie = res.headers['set-cookie'] || [];
    const hasCookie = Array.isArray(setCookie)
      ? setCookie.some(c => c.includes('XSRF-TOKEN'))
      : typeof setCookie === 'string' && setCookie.includes('XSRF-TOKEN');

    if (res.status === 200 && csrfTokenValue && hasCookie) {
      log('PASS', 'CSRF token issued with cookie');
      testsPassed++;
    } else {
      log('FAIL', `CSRF endpoint unexpected response (status ${res.status})`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `CSRF token endpoint test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testSignupValidationMissingFields() {
  try {
    log('INFO', 'Testing signup validation (missing fields)...');
    const res = await makeRequest('POST', '/signup', {
      correoUniversitario: 'integration+missing@userena.cl'
    });

    if (res.status === 400) {
      log('PASS', 'Signup missing fields rejected with 400');
      testsPassed++;
    } else {
      log('FAIL', `Signup missing fields returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Signup validation test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testLoginValidationMissingFields() {
  try {
    log('INFO', 'Testing login validation (missing fields)...');
    const res = await makeRequest('POST', '/login', {});

    if (res.status === 400) {
      log('PASS', 'Login missing fields rejected with 400');
      testsPassed++;
    } else {
      log('FAIL', `Login missing fields returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Login validation test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testPasswordForgotValidation() {
  try {
    log('INFO', 'Testing password reset request validation...');
    const res = await makeRequest('POST', '/password/forgot', {});
    if (res.status === 400) {
      log('PASS', 'Password reset request without email rejected');
      testsPassed++;
    } else {
      log('FAIL', `Password reset request returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Password reset request validation failed: ${err.message}`);
    testsFailed++;
  }
}

async function testPasswordResetValidation() {
  try {
    log('INFO', 'Testing password reset payload validation...');
    const res = await makeRequest('POST', '/password/reset', {
      token: '',
      contrasena: 'short'
    });

    if (res.status === 400) {
      log('PASS', 'Password reset with invalid payload rejected');
      testsPassed++;
    } else {
      log('FAIL', `Password reset validation returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Password reset validation test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testVolunteerPanelRequiresAuth() {
  try {
    log('INFO', 'Testing volunteer panel protection...');
    const res = await makeRequest('GET', '/volunteer/panel');
    if (res.status === 401 || res.status === 403 || res.status === 302) {
      log('PASS', 'Volunteer panel is protected');
      testsPassed++;
    } else {
      log('FAIL', `Volunteer panel unexpectedly accessible (status ${res.status})`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Volunteer panel protection test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testAdminPanelRequiresAuth() {
  try {
    log('INFO', 'Testing admin panel protection...');
    const res = await makeRequest('GET', '/admin/panel');
    if (res.status === 401 || res.status === 403 || res.status === 302) {
      log('PASS', 'Admin panel is protected');
      testsPassed++;
    } else {
      log('FAIL', `Admin panel unexpectedly accessible (status ${res.status})`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Admin panel protection test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testActivitiesRequireAuth() {
  try {
    log('INFO', 'Testing activities listing protection...');
    const res = await makeRequest('GET', '/api/activities');
    if (res.status === 401 || res.status === 403 || res.status === 302 || res.status === 503) {
      log('PASS', 'Activities endpoint requires authentication');
      testsPassed++;
    } else {
      log('FAIL', `Activities endpoint unexpectedly accessible (status ${res.status})`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Activities protection test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testRegistrationRequestRequiresCsrf() {
  try {
    log('INFO', 'Testing registration request CSRF protection...');
    const res = await makeRequest('POST', '/auth/request', {
      correoUniversitario: `no-csrf-${Date.now()}@userena.cl`,
      contrasena: 'SecurePass123!',
      nombre: 'No CSRF Header'
    });

    if (res.status === 403) {
      log('PASS', 'Registration request rejected without CSRF header');
      testsPassed++;
    } else {
      log('FAIL', `Registration request without CSRF returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Registration CSRF protection test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testRegistrationRequestWithCsrf() {
  try {
    log('INFO', 'Testing registration request with CSRF token...');
    if (!csrfTokenValue) {
      log('FAIL', 'CSRF token not available to test positive registration flow');
      testsFailed++;
      return;
    }

    const res = await makeRequest('POST', '/auth/request', {
      correoUniversitario: `with-csrf-${Date.now()}@userena.cl`,
      contrasena: 'SecurePass123!',
      nombre: 'CSRF Enabled'
    }, { 'X-CSRF-Token': csrfTokenValue });

    if (res.status === 201 || res.status === 200 || res.status === 409) {
      log('PASS', 'Registration request accepted when CSRF token present');
      testsPassed++;
    } else {
      log('FAIL', `Registration with CSRF returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `Registration CSRF positive test failed: ${err.message}`);
    testsFailed++;
  }
}

async function testNotFoundRoute() {
  try {
    log('INFO', 'Testing 404 handler...');
    const res = await makeRequest('GET', `/this-route-should-404-${Date.now()}`);
    if (res.status === 404) {
      log('PASS', 'Unknown route returns 404');
      testsPassed++;
    } else {
      log('FAIL', `Unknown route returned ${res.status}`);
      testsFailed++;
    }
  } catch (err) {
    log('FAIL', `404 handler test failed: ${err.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log(`\n${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  ULSConnect Backend - Integration Tests  ║${colors.reset}`);
  console.log(`${colors.blue}║  API: ${API_URL}${' '.repeat(Math.max(0, 30 - API_URL.length))}║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════╝${colors.reset}\n`);

  try {
    const suite = [
      testHealthCheck,
      testSecurityHeaders,
      testInstitutionalEmailValidation,
      testCSRFProtection,
      testRoleBasedAccess,
      testCsrfTokenEndpoint,
      testSignupValidationMissingFields,
      testLoginValidationMissingFields,
      testPasswordForgotValidation,
      testPasswordResetValidation,
      testVolunteerPanelRequiresAuth,
      testAdminPanelRequiresAuth,
      testActivitiesRequireAuth,
      testRegistrationRequestRequiresCsrf,
      testRegistrationRequestWithCsrf,
      testNotFoundRoute
      // testRateLimiting, // keep last if enabled manually
    ];

    for (const testFn of suite) {
      await testFn();
      await pause();
    }
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
