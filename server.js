const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const statePath = path.join(root, 'data-store.json');

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
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2));
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

  // Use the full host header (includes port) so QR codes and preview URLs
  // point back to the correct port on the same network.
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
    notes,
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
    password: cleanPassword,
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
  const account = (state.accounts || []).find(item => normalizeEmail(item.email) === cleanEmail && String(item.password || '') === cleanPassword);
  if (!account) return { ok: false, error: 'Invalid email or password.' };
  if (String(account.status || 'active') === 'inactive') return { ok: false, error: 'This account has been deactivated by the admin.' };

  return { ok: true, account, session: { id: account.id, name: account.name, email: account.email, role: account.role } };
}

function saveCustomerProfileData(profile, sessionId) {
  const state = readState();
  const account = (state.accounts || []).find(item => item.id === sessionId);
  if (!account) return { error: 'You must be logged in to save your profile.' };

  const payload = {
    id: sessionId,
    name: String(profile.name || account.name || 'Customer').trim() || 'Customer',
    title: String(profile.title || '').trim(),
    tagline: String(profile.tagline || '').trim(),
    accent: String(profile.accent || '#2563EB').trim() || '#2563EB',
    avatar: String(profile.avatar || profile.avatarUrl || '').trim(),
    avatarUrl: String(profile.avatar || profile.avatarUrl || '').trim(),
    website: String(profile.website || '').trim(),
    company: String(profile.company || '').trim(),
    phone: String(profile.phone || '').trim(),
    location: String(profile.location || '').trim(),
    instagram: String(profile.instagram || '').trim(),
    facebook: String(profile.facebook || '').trim(),
    tiktok: String(profile.tiktok || '').trim(),
    bio: String(profile.bio || '').trim(),
    theme: profile.theme === 'dark' ? 'dark' : 'light',
    mode: profile.mode === 'local' ? 'local' : 'public',
    updatedAt: new Date().toISOString()
  };

  state.accounts = (state.accounts || []).map(item => item.id === sessionId ? { ...item, name: payload.name } : item);
  writeState(state);

  return payload;
}

function serveStaticFile(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  let filePath = path.join(root, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (pathname === '/guest-signup.html' || pathname === '/customer-login.html' || pathname === '/customer-account.html' || pathname === '/guest-admin.html' || pathname === '/profile.html' || pathname === '/preview.html') {
        const fallbackPath = path.join(root, pathname.replace(/^\//, ''));
        fs.readFile(fallbackPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          const ext = path.extname(fallbackPath).toLowerCase();
          res.writeHead(200, { 'Content-Type': ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html; charset=utf-8' });
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

    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/guests' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readState().guests || []));
    return;
  }

  if (url.pathname === '/api/guests' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const baseUrl = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
        const result = createGuestInviteData(data, baseUrl);
        res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (url.pathname.startsWith('/api/guests/') && req.method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.split('/api/guests/')[1]);
    const state = readState();
    state.guests = (state.guests || []).filter(item => item.id !== id);
    writeState(state);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/accounts' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readState().accounts || []));
    return;
  }

  if (url.pathname === '/api/accounts' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const baseUrl = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
        const result = createAccountForGuest(data, baseUrl);
        res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (url.pathname === '/api/customers/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const result = loginCustomerData(data);
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (url.pathname === '/api/customers/profile' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const sessionId = data.sessionId || null;
        const result = saveCustomerProfileData(data, sessionId);
        res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (url.pathname === '/api/homepage' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readState().homePage || {}));
    return;
  }

  if (url.pathname === '/api/homepage' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const state = readState();
        const incoming = JSON.parse(body || '{}');
        state.homePage = { ...((state.homePage || {})), ...incoming };
        writeState(state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state.homePage));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  serveStaticFile(req, res, url);
});

server.listen(3000, () => {
  console.log('OneTap server running on http://localhost:3000');
});
