const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const zlib = require('zlib');

const root = __dirname;
const statePath = path.join(root, 'data-store.json');

// Files that should never be served directly
const FORBIDDEN_FILES = new Set([
  'data-store.json',
  'package.json',
  'vercel.json',
  'guest-admin.test.js',
  '.env',
  '.env.example',
]);

// Admin credentials from env (with startup warning for defaults)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (ADMIN_USERNAME === 'admin' && ADMIN_PASSWORD === 'admin123') {
  console.warn('⚠️  WARNING: Using default admin credentials (admin/admin123). Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables for production.');
}

// In-memory session stores (lost on restart - known limitation)
const adminSessions = new Map(); // token -> { username, createdAt }
const customerSessions = new Map(); // token -> { accountId, email, createdAt }

// Rate limiting: IP -> { count, resetAt }
const loginAttempts = new Map(); // key: "admin:IP" or "customer:IP"
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 10;

// Write queue for atomic data-store.json updates
let writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  writeQueue = writeQueue.then(() => fn()).catch(err => console.error('Write queue error:', err));
  return writeQueue;
}

function ensureStateFile() {
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({
      guests: [],
      accounts: [],
      homePage: {
        headline: 'Your Link.',
        subheadline: 'One Tap.',
        description: 'Custom NFC cards & keychains for your social, business, and brand.',
        image: 'img/ONE TAP.png',
        badges: ['ONE TAP', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'ANY LINK'],
        accountText: 'My Account'
      }
    }, null, 2));
  }
}

function readState() {
  ensureStateFile();
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(next) {
  // Atomic write: write to temp file then rename
  const tmpPath = statePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2));
  fs.renameSync(tmpPath, statePath);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function encodeBase64(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeBase64(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
}

function getBaseUrl(requestUrl) {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const host = requestUrl && requestUrl.headers && requestUrl.headers.host ? requestUrl.headers.host : 'localhost:3000';
  const scheme = requestUrl && requestUrl.socket && requestUrl.socket.encrypted ? 'https' : 'http';
  return `${scheme}://${host}`;
}

function generateToken() {
  return 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

function generateId() {
  return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function getQrDisplayUrl(value, size = 220) {
  const encoded = encodeURIComponent(String(value || ''));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${encoded}`;
}

function buildGuestPreviewUrl(profile = {}, baseUrl = getBaseUrl()) {
  const payload = {
    name: String(profile.name || 'Customer').trim() || 'Customer',
    title: String(profile.title || '').trim(),
    tagline: String(profile.tagline || '').trim(),
    accent: String(profile.accent || '#2563EB').trim() || '#2563EB',
    avatar: String(profile.avatar || '').trim(),
    website: String(profile.website || '').trim(),
    email: String(profile.email || '').trim(),
    theme: profile.theme === 'dark' ? 'dark' : 'light',
    mode: profile.mode === 'local' ? 'local' : 'public',
    phones: Array.isArray(profile.phones) ? profile.phones : [],
    emails: Array.isArray(profile.emails) ? profile.emails : [],
    links: Array.isArray(profile.links) ? profile.links : [],
    address: profile.address || {}
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${baseUrl}/profile.html#data=${encoded}`;
}

// Password hashing with scrypt (salt:hash format)
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 32 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p });
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) {
    // Legacy plaintext - should be migrated on boot
    return password === stored;
  }
  const [, saltB64, hashB64] = stored.split(':');
  const salt = Buffer.from(saltB64, 'base64');
  const hash = Buffer.from(hashB64, 'base64');
  const derived = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p });
  return crypto.timingSafeEqual(hash, derived);
}

// Migrate any plaintext passwords to hashed on boot
function migratePasswords() {
  const state = readState();
  let changed = false;
  for (const account of state.accounts || []) {
    if (account.password && !account.password.startsWith('scrypt:')) {
      account.password = hashPassword(account.password);
      changed = true;
    }
  }
  if (changed) {
    writeState(state);
    console.log('Migrated legacy plaintext passwords to scrypt hashes');
  }
}

function createGuestInviteData({ name, email, notes = '' }, baseUrl = 'http://localhost:3000') {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);

  if (!cleanName || !cleanEmail) {
    return { error: 'Name and email are required' };
  }

  const state = readState();
  const emailExists = [...(state.guests || []), ...(state.accounts || [])].some(item => normalizeEmail(item.email) === cleanEmail);
  if (emailExists) {
    return { error: 'Email already exists' };
  }

  const token = generateToken();
  const invitePayload = encodeBase64({ token, name: cleanName, email: cleanEmail, createdAt: new Date().toISOString() });
  const signupUrl = `${baseUrl}/guest-signup.html?token=${encodeURIComponent(token)}&invite=${encodeURIComponent(invitePayload)}`;
  const invite = {
    id: generateId(),
    name: cleanName,
    email: cleanEmail,
    notes: String(notes || '').slice(0, 500), // max length
    token,
    status: 'pending',
    createdAt: new Date().toISOString(),
    signupUrl,
    qrUrl: getQrDisplayUrl(signupUrl)
  };

  state.guests = [...(state.guests || []), invite];
  writeState(state);
  return invite;
}

function findGuestByToken(token) {
  const state = readState();
  return (state.guests || []).find(item => item.token === token) || null;
}

function createAccountForGuest({ guestToken, name, email, password }, baseUrl = 'http://localhost:3000') {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '').trim();

  if (!guestToken) return { error: 'Invalid guest token' };

  const state = readState();
  const guest = (state.guests || []).find(item => item.token === guestToken);
  if (!guest) return { error: 'Invalid guest token' };
  if (guest.status === 'used') return { error: 'This invitation has already been used' };
  if (!cleanName || !cleanEmail || !cleanPassword) return { error: 'Name, email and password are required' };
  if (cleanPassword.length < 8) return { error: 'Password must be at least 8 characters' };
  if (normalizeEmail(guest.email) !== cleanEmail) return { error: 'This account must be created with the email from the admin invitation.' };
  if ((state.accounts || []).some(account => normalizeEmail(account.email) === cleanEmail)) return { error: 'This email already has an account.' };

  const previewUrl = buildGuestPreviewUrl({
    name: cleanName,
    email: cleanEmail,
    accent: '#2563EB'
  }, baseUrl);

  const account = {
    id: generateId(),
    guestToken,
    name: cleanName,
    email: cleanEmail,
    password: hashPassword(cleanPassword),
    role: 'guest',
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  state.guests = (state.guests || []).map(item => item.token === guestToken ? {
    ...item,
    status: 'used',
    usedAt: new Date().toISOString(),
    previewUrl,
    qrUrl: getQrDisplayUrl(previewUrl)
  } : item);
  state.accounts = [...(state.accounts || []), account];
  writeState(state);

  return account;
}

function loginCustomerData({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '').trim();
  const state = readState();
  const account = (state.accounts || []).find(item => normalizeEmail(item.email) === cleanEmail && verifyPassword(cleanPassword, item.password));
  if (!account) return { ok: false, error: 'Invalid email or password.' };
  if (String(account.status || 'active') === 'inactive') return { ok: false, error: 'This account has been deactivated by the admin.' };

  const customerToken = generateSessionToken();
  customerSessions.set(customerToken, { accountId: account.id, email: account.email, createdAt: Date.now() });

  return { ok: true, account, session: { id: account.id, name: account.name, email: account.email, role: account.role }, customerToken };
}

function saveCustomerProfileData(profile, customerToken) {
  const session = customerSessions.get(customerToken);
  if (!session) return { error: 'Invalid or expired session. Please log in again.' };

  const state = readState();
  const account = (state.accounts || []).find(item => item.id === session.accountId);
  if (!account) return { error: 'Account not found' };
  if (String(account.status || 'active') === 'inactive') return { error: 'This account has been deactivated by the admin.' };

  const payload = {
    id: session.accountId,
    name: String(profile.name || account.name || 'Customer').trim() || 'Customer',
    title: String(profile.title || '').trim().slice(0, 100),
    tagline: String(profile.tagline || '').trim().slice(0, 200),
    accent: String(profile.accent || '#2563EB').trim() || '#2563EB',
    avatar: String(profile.avatar || profile.avatarUrl || '').trim().slice(0, 200000), // ~200KB max
    avatarUrl: String(profile.avatar || profile.avatarUrl || '').trim().slice(0, 200000),
    website: String(profile.website || '').trim().slice(0, 200),
    company: String(profile.company || '').trim().slice(0, 100),
    phone: String(profile.phone || '').trim().slice(0, 50),
    location: String(profile.location || '').trim().slice(0, 100),
    instagram: String(profile.instagram || '').trim().slice(0, 200),
    facebook: String(profile.facebook || '').trim().slice(0, 200),
    tiktok: String(profile.tiktok || '').trim().slice(0, 200),
    bio: String(profile.bio || '').trim().slice(0, 1000),
    theme: profile.theme === 'dark' ? 'dark' : 'light',
    mode: profile.mode === 'local' ? 'local' : 'public',
    updatedAt: new Date().toISOString()
  };

  state.accounts = (state.accounts || []).map(item => item.id === session.accountId ? { ...item, name: payload.name } : item);
  writeState(state);

  return payload;
}

// Admin session management
function createAdminSession() {
  const token = generateSessionToken();
  adminSessions.set(token, { username: ADMIN_USERNAME, createdAt: Date.now() });
  return token;
}

function validateAdminSession(token) {
  const session = adminSessions.get(token);
  if (!session) return null;
  // Optional: add TTL here if desired
  return session;
}

function deleteAdminSession(token) {
  adminSessions.delete(token);
}

function requireAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return null;
  return validateAdminSession(token);
}

function requireCustomer(req) {
  const token = req.headers['x-customer-token'];
  if (!token) return null;
  return customerSessions.get(token) || null;
}

function checkRateLimit(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
  }
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

function sendRateLimited(res, retryAfter) {
  res.writeHead(429, {
    'Content-Type': 'application/json',
    'Retry-After': String(retryAfter)
  });
  res.end(JSON.stringify({ error: 'Too many login attempts. Please try again later.' }));
}

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP: allow inline scripts for now (will be improved by moving to external files)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.qrserver.com;");
}

function addCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico'].includes(ext)) {
    // Generate ETag from file stats
    try {
      const stats = fs.statSync(filePath);
      const etag = `"${stats.mtimeMs.toString(16)}-${stats.size.toString(16)}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } catch {}
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
}

function serveStaticFile(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  
  // Block forbidden files
  const filename = path.basename(pathname);
  if (FORBIDDEN_FILES.has(filename) || filename.startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let filePath = path.join(root, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for known HTML routes
      if (['/guest-signup.html', '/customer-login.html', '/customer-account.html', '/guest-admin.html', '/profile.html', '/preview.html'].includes(pathname)) {
        const fallbackPath = path.join(root, pathname.replace(/^\//, ''));
        fs.readFile(fallbackPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          const ext = path.extname(fallbackPath).toLowerCase();
          res.writeHead(200, { 'Content-Type': ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html; charset=utf-8' });
          addSecurityHeaders(res);
          res.end(content);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    addSecurityHeaders(res);
    addCacheHeaders(res, filePath);

    // Handle conditional GET (ETag)
    const etag = res.getHeader('ETag');
    if (etag && req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    // Handle gzip compression for text assets
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const shouldCompress = acceptEncoding.includes('gzip') && ['text/html', 'text/css', 'application/javascript', 'application/json'].includes(mime[ext]);

    if (shouldCompress) {
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext], 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
      stream.pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

// --- API Handlers ---

function handleAdminLogin(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const rateKey = `admin:${ip}`;
  const rate = checkRateLimit(rateKey);
  if (!rate.allowed) return sendRateLimited(res, rate.retryAfter);

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const username = String(data.username || '').trim().toLowerCase();
      const password = String(data.password || '').trim();

      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = createAdminSession();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, token }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid admin credentials' }));
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

function handleAdminLogout(req, res) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  deleteAdminSession(req.headers['x-admin-token']);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

function handleGuestsList(req, res) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(readState().guests || []));
}

function handleGuestLookup(req, res, url) {
  // Public endpoint for guest-signup.html to validate a single invite
  const token = url.searchParams.get('token');
  if (!token) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Token required' }));
    return;
  }
  const guest = findGuestByToken(token);
  if (!guest) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invite not found' }));
    return;
  }
  // Don't expose the full invite payload in public lookup
  const { invite, ...safeGuest } = guest;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(safeGuest));
}

function handleGuestsCreate(req, res) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const baseUrl = getBaseUrl(req);
      const result = createGuestInviteData(data, baseUrl);
      res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

function handleGuestsDelete(req, res) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  const id = decodeURIComponent(req.url.split('/api/guests/')[1] || '');
  const state = readState();
  state.guests = (state.guests || []).filter(item => item.id !== id);
  writeState(state);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

function handleAccountsList(req, res) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(readState().accounts || []));
}

function handleAccountsCreate(req, res) {
  // Public endpoint - guest creates account from invite
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const baseUrl = getBaseUrl(req);
      const result = createAccountForGuest(data, baseUrl);
      if (result.error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
      } else {
        // Create customer session on successful account creation
        const customerToken = generateSessionToken();
        customerSessions.set(customerToken, { accountId: result.id, email: result.email, createdAt: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, customerToken }));
        return;
      }
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

function handleAccountPatch(req, res, accountId) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const state = readState();
      const account = (state.accounts || []).find(a => a.id === accountId);
      if (!account) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Account not found' }));
        return;
      }
      if (data.status === 'active' || data.status === 'inactive') {
        account.status = data.status;
        account.updatedAt = new Date().toISOString();
        // If deactivating, invalidate any live customer sessions for this account
        if (data.status === 'inactive') {
          for (const [token, session] of customerSessions.entries()) {
            if (session.accountId === accountId) {
              customerSessions.delete(token);
            }
          }
        }
        writeState(state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, account }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid status' }));
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

function handleAccountDelete(req, res, accountId) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  const state = readState();
  state.accounts = (state.accounts || []).filter(a => a.id !== accountId);
  // Also invalidate any customer sessions
  for (const [token, session] of customerSessions.entries()) {
    if (session.accountId === accountId) {
      customerSessions.delete(token);
    }
  }
  writeState(state);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

function handleCustomerLogin(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const rateKey = `customer:${ip}`;
  const rate = checkRateLimit(rateKey);
  if (!rate.allowed) return sendRateLimited(res, rate.retryAfter);

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const result = loginCustomerData(data);
      if (result.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

function handleCustomerProfile(req, res) {
  const session = requireCustomer(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired session. Please log in again.' }));
    return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const customerToken = req.headers['x-customer-token'];
      const result = saveCustomerProfileData(data, customerToken);
      res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

function handleHomepageGet(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(readState().homePage || {}));
}

function handleHomepagePut(req, res) {
  const auth = requireAdmin(req);
  if (!auth) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const state = readState();
      const incoming = JSON.parse(body || '{}');
      // Basic validation
      if (incoming.badges && !Array.isArray(incoming.badges)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Badges must be an array' }));
        return;
      }
      if (incoming.description && incoming.description.length > 500) {
        incoming.description = incoming.description.slice(0, 500);
      }
      state.homePage = { ...(state.homePage || {}), ...incoming };
      writeState(state);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state.homePage));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    }
  });
}

// --- Main Server ---

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Add security headers to all responses
  addSecurityHeaders(res);

  // --- API Routes ---
  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    return handleAdminLogin(req, res);
  }
  if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
    return handleAdminLogout(req, res);
  }

  if (url.pathname === '/api/guests' && req.method === 'GET') {
    return handleGuestsList(req, res);
  }
  if (url.pathname === '/api/guests/lookup' && req.method === 'GET') {
    return handleGuestLookup(req, res, url);
  }
  if (url.pathname === '/api/guests' && req.method === 'POST') {
    return handleGuestsCreate(req, res);
  }
  if (url.pathname.startsWith('/api/guests/') && req.method === 'DELETE') {
    return handleGuestsDelete(req, res);
  }

  if (url.pathname === '/api/accounts' && req.method === 'GET') {
    return handleAccountsList(req, res);
  }
  if (url.pathname === '/api/accounts' && req.method === 'POST') {
    return handleAccountsCreate(req, res);
  }
  if (url.pathname.match(/^\/api\/accounts\/[^/]+$/) && req.method === 'PATCH') {
    const accountId = url.pathname.split('/api/accounts/')[1];
    return handleAccountPatch(req, res, accountId);
  }
  if (url.pathname.match(/^\/api\/accounts\/[^/]+$/) && req.method === 'DELETE') {
    const accountId = url.pathname.split('/api/accounts/')[1];
    return handleAccountDelete(req, res, accountId);
  }

  if (url.pathname === '/api/customers/login' && req.method === 'POST') {
    return handleCustomerLogin(req, res);
  }
  if (url.pathname === '/api/customers/profile' && req.method === 'POST') {
    return handleCustomerProfile(req, res);
  }

  if (url.pathname === '/api/homepage' && req.method === 'GET') {
    return handleHomepageGet(req, res);
  }
  if (url.pathname === '/api/homepage' && req.method === 'PUT') {
    return handleHomepagePut(req, res);
  }

  // --- Static Files ---
  serveStaticFile(req, res, url);
});

// Run password migration on boot
migratePasswords();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`OneTap server running on http://localhost:${PORT}`);
});