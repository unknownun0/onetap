const STORAGE_KEYS = {
  guests: 'onetap_guests',
  accounts: 'onetap_accounts',
  homePage: 'onetap_homepage_settings'
};

const DEFAULT_STORE = {
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
};

const memoryStorage = {};

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
    },
    setItem(key, value) {
      memoryStorage[key] = String(value);
    },
    removeItem(key) {
      delete memoryStorage[key];
    }
  };
}

function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
  }
  return 'http://localhost';
}

function generateId() {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readStorage() {
  const raw = getStorage().getItem('onetap_admin_state');
  if (!raw) return DEFAULT_STORE;

  try {
    return { ...DEFAULT_STORE, ...JSON.parse(raw) };
  } catch (error) {
    return DEFAULT_STORE;
  }
}

function writeStorage(data) {
  getStorage().setItem('onetap_admin_state', JSON.stringify(data));
}

function setStore(key, value) {
  const state = readStorage();
  state[key] = value;
  writeStorage(state);
  return value;
}

function getStore(key) {
  const state = readStorage();
  if (key === 'homePage') {
    return state.homePage || DEFAULT_STORE.homePage;
  }
  return state[key] || [];
}

function getHomePageSettings() {
  return {
    ...DEFAULT_STORE.homePage,
    ...getStore('homePage')
  };
}

function setHomePageSettings(settings = {}) {
  const current = getHomePageSettings();
  const next = {
    ...current,
    ...settings,
    badges: Array.isArray(settings.badges) ? settings.badges.map(item => String(item).trim()).filter(Boolean) : (current.badges || [])
  };

  setStore('homePage', next);
  return next;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function generateToken() {
  return 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function encodeProfileData(profile) {
  const json = JSON.stringify(profile || {});

  if (typeof btoa === 'function') {
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  return encodeURIComponent(json);
}

function generateQrFallbackDataUrl(value, size = 220) {
  const text = String(value || '');
  const cell = 10;
  const border = 2;
  const matrixSize = Math.max(10, Math.floor(size / cell));
  const pad = 12;

  const rects = [];
  const hashSeed = Array.from(text).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0);

  for (let y = 0; y < matrixSize; y += 1) {
    for (let x = 0; x < matrixSize; x += 1) {
      const posX = x * cell + pad;
      const posY = y * cell + pad;
      const inFinder = (x < 7 && y < 7) || (x >= matrixSize - 7 && y < 7) || (x < 7 && y >= matrixSize - 7);
      const shouldPaint = !inFinder && ((hashSeed + x * 13 + y * 17 + text.length * 3) % 3 === 0 || ((hashSeed >> ((x + y) % 16)) & 1) === 1);
      if (shouldPaint) {
        rects.push(`<rect x="${posX}" y="${posY}" width="${cell - border}" height="${cell - border}" rx="1" fill="#0F172A" />`);
      }
    }
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR fallback">
      <rect width="100%" height="100%" fill="#ffffff"/>
      ${rects.join('')}
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getQrDisplayUrl(value, size = 220) {
  const encoded = encodeURIComponent(String(value || ''));
  const remoteUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${encoded}`;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return generateQrFallbackDataUrl(value, size);
  }

  return remoteUrl;
}

function buildGuestPreviewUrl(profile = {}) {
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

  return `${getBaseUrl()}profile.html#data=${encodeProfileData(payload)}`;
}

function createGuestInvite({ name, email, notes = '' }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);

  if (!cleanName || !cleanEmail) {
    return { error: 'Name and email are required' };
  }

  const existingGuests = getStore('guests');
  const existingAccounts = getStore('accounts');
  const emailExists = [...existingGuests, ...existingAccounts].some(item => normalizeEmail(item.email) === cleanEmail);

  if (emailExists) {
    return { error: 'Email already exists' };
  }

  const token = generateToken();
  const signupUrl = `${getBaseUrl()}guest-signup.html?token=${encodeURIComponent(token)}`;
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

  const guests = [...existingGuests, invite];
  setStore('guests', guests);
  return invite;
}

function getGuestByToken(token) {
  return getStore('guests').find(guest => guest.token === token) || null;
}

function getUsedInviteRedirectUrl(token) {
  const guest = getGuestByToken(token);
  if (!guest || guest.status !== 'used') {
    return null;
  }

  return guest.previewUrl || `${getBaseUrl()}profile.html#data=${encodeProfileData({
    name: guest.name,
    email: guest.email,
    accent: '#2563EB'
  })}`;
}

function listGuests() {
  return getStore('guests');
}

function deleteGuestInvite(inviteId) {
  const guests = getStore('guests').filter(item => item.id !== inviteId);
  setStore('guests', guests);
  return true;
}

function listAccounts() {
  return getStore('accounts');
}

function deactivateAccount(accountId) {
  const accounts = getStore('accounts').map(item => item.id === accountId ? { ...item, status: 'inactive', updatedAt: new Date().toISOString() } : item);
  setStore('accounts', accounts);

  const session = getCustomerSession();
  if (session && session.id === accountId) {
    setCustomerSession(null);
  }

  return accounts.find(item => item.id === accountId) || null;
}

function deleteAccount(accountId) {
  const accounts = getStore('accounts').filter(item => item.id !== accountId);
  setStore('accounts', accounts);

  const session = getCustomerSession();
  if (session && session.id === accountId) {
    setCustomerSession(null);
  }

  return true;
}

function createGuestAccount({ guestToken, name, email, password }) {
  const guest = getGuestByToken(guestToken);
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '').trim();

  if (!guest) {
    return { error: 'Invalid guest token' };
  }

  if (guest.status === 'used') {
    return { error: 'This invitation has already been used' };
  }

  if (!cleanName || !cleanEmail || !cleanPassword) {
    return { error: 'Name, email and password are required' };
  }

  if (normalizeEmail(guest.email) !== cleanEmail) {
    return { error: 'This account must be created with the email from the admin invitation.' };
  }

  const existingAccounts = getStore('accounts');
  const emailAlreadyUsed = existingAccounts.some(account => normalizeEmail(account.email) === cleanEmail);
  if (emailAlreadyUsed) {
    return { error: 'This email already has an account.' };
  }

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

  const previewUrl = buildGuestPreviewUrl({
    name: cleanName,
    email: cleanEmail,
    accent: '#2563EB'
  });

  const guests = getStore('guests').map(item => item.token === guestToken ? {
    ...item,
    status: 'used',
    usedAt: new Date().toISOString(),
    previewUrl,
    qrUrl: getQrDisplayUrl(previewUrl)
  } : item);
  const accounts = [...existingAccounts, account];

  setStore('guests', guests);
  setStore('accounts', accounts);

  setCustomerSession({
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    loggedInAt: new Date().toISOString()
  });

  return account;
}

function getAdminSession() {
  try {
    return JSON.parse(getStorage().getItem('onetap_admin_session') || 'null');
  } catch (error) {
    return null;
  }
}

function setAdminSession(value) {
  if (value) {
    getStorage().setItem('onetap_admin_session', JSON.stringify(value));
    return value;
  }
  getStorage().removeItem('onetap_admin_session');
  return null;
}

function loginAdmin({ username, password }) {
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  if (cleanUser === 'admin' && cleanPass === 'admin123') {
    const session = { username: 'admin', loggedInAt: new Date().toISOString() };
    setAdminSession(session);
    return { ok: true, session };
  }

  return { ok: false, error: 'Invalid admin credentials' };
}

function logoutAdmin() {
  getStorage().removeItem('onetap_admin_session');
  return true;
}

function getCustomerSession() {
  try {
    return JSON.parse(getStorage().getItem('onetap_customer_session') || 'null');
  } catch (error) {
    return null;
  }
}

function setCustomerSession(value) {
  if (value) {
    getStorage().setItem('onetap_customer_session', JSON.stringify(value));
    return value;
  }
  getStorage().removeItem('onetap_customer_session');
  return null;
}

function loginCustomer({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '').trim();

  if (!cleanEmail || !cleanPassword) {
    return { ok: false, error: 'Email and password are required.' };
  }

  const account = getStore('accounts').find(item => normalizeEmail(item.email) === cleanEmail && String(item.password || '') === cleanPassword);
  if (!account) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (String(account.status || 'active') === 'inactive') {
    return { ok: false, error: 'This account has been deactivated by the admin.' };
  }

  const session = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    loggedInAt: new Date().toISOString()
  };

  setCustomerSession(session);
  return { ok: true, account, session };
}

function logoutCustomer() {
  setCustomerSession(null);
  return true;
}

function getCustomerProfile() {
  const session = getCustomerSession();
  const key = session && session.id ? `onetap_customer_profile_${session.id}` : 'onetap_customer_profile';

  try {
    const raw = getStorage().getItem(key);
    if (!raw) {
      const legacy = getStorage().getItem('onetap_customer_profile');
      if (!legacy) return null;
      return JSON.parse(legacy);
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveCustomerProfile(profile) {
  const session = getCustomerSession();
  if (!session || !session.id) {
    return { error: 'You must be logged in to save your profile.' };
  }

  const payload = {
    id: session.id,
    name: String(profile && profile.name ? profile.name : session.name || 'Customer').trim() || 'Customer',
    title: String(profile && profile.title ? profile.title : '').trim(),
    tagline: String(profile && profile.tagline ? profile.tagline : '').trim(),
    accent: String(profile && profile.accent ? profile.accent : '#2563EB').trim() || '#2563EB',
    avatar: String(profile && profile.avatar ? profile.avatar : '').trim(),
    website: String(profile && profile.website ? profile.website : '').trim(),
    bio: String(profile && profile.bio ? profile.bio : '').trim(),
    theme: (profile && (profile.theme === 'dark' || profile.theme === 'light')) ? profile.theme : 'light',
    mode: profile && (profile.mode === 'local' || profile.mode === 'public') ? profile.mode : 'public',
    phones: Array.isArray(profile && profile.phones) ? profile.phones : [],
    emails: Array.isArray(profile && profile.emails) ? profile.emails : [],
    links: Array.isArray(profile && profile.links) ? profile.links : [],
    address: profile && profile.address ? profile.address : {},
    updatedAt: new Date().toISOString()
  };

  const key = `onetap_customer_profile_${session.id}`;
  getStorage().setItem(key, JSON.stringify(payload));

  const accounts = getStore('accounts').map(item => item.id === session.id ? { ...item, name: payload.name } : item);
  const guests = getStore('guests').map(item => {
    if (normalizeEmail(item.email) !== normalizeEmail(session.email)) return item;
    const previewUrl = buildGuestPreviewUrl({
      name: payload.name,
      title: payload.title,
      tagline: payload.tagline,
      accent: payload.accent,
      avatar: payload.avatar,
      website: payload.website,
      email: session.email
    });

    return {
      ...item,
      name: payload.name,
      status: item.status === 'used' ? 'used' : item.status,
      previewUrl,
      qrUrl: getQrDisplayUrl(previewUrl)
    };
  });

  setStore('accounts', accounts);
  setStore('guests', guests);
  setCustomerSession({
    ...session,
    name: payload.name,
    updatedAt: new Date().toISOString()
  });

  return payload;
}

if (typeof module !== 'undefined') {
  module.exports = {
    STORAGE_KEYS,
    createGuestInvite,
    createGuestAccount,
    getGuestByToken,
    getUsedInviteRedirectUrl,
    listGuests,
    deleteGuestInvite,
    listAccounts,
    deactivateAccount,
    deleteAccount,
    getHomePageSettings,
    setHomePageSettings,
    setStore,
    getStore,
    generateToken,
    normalizeEmail,
    getAdminSession,
    setAdminSession,
    loginAdmin,
    logoutAdmin,
    getCustomerSession,
    setCustomerSession,
    loginCustomer,
    logoutCustomer,
    getCustomerProfile,
    saveCustomerProfile,
    generateQrFallbackDataUrl,
    getQrDisplayUrl,
    readFileAsDataUrl
  };
}
