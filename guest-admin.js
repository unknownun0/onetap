const STORAGE_KEYS = {
  guests: 'onetap_guests',
  accounts: 'onetap_accounts'
};

const DEFAULT_STORE = {
  guests: [],
  accounts: []
};

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
  if (typeof window === 'undefined') {
    return DEFAULT_STORE;
  }

  const raw = localStorage.getItem('onetap_admin_state');
  if (!raw) return DEFAULT_STORE;

  try {
    return { ...DEFAULT_STORE, ...JSON.parse(raw) };
  } catch (error) {
    return DEFAULT_STORE;
  }
}

function writeStorage(data) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('onetap_admin_state', JSON.stringify(data));
  }
}

function setStore(key, value) {
  const state = readStorage();
  state[key] = value;
  writeStorage(state);
  return value;
}

function getStore(key) {
  const state = readStorage();
  return state[key] || [];
}

function generateToken() {
  return 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
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
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=png&data=${encodeURIComponent(signupUrl)}`
  };

  const guests = [...existingGuests, invite];
  setStore('guests', guests);
  return invite;
}

function getGuestByToken(token) {
  return getStore('guests').find(guest => guest.token === token) || null;
}

function listGuests() {
  return getStore('guests');
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

  const guests = getStore('guests').map(item => item.token === guestToken ? { ...item, status: 'used', usedAt: new Date().toISOString() } : item);
  const accounts = [...getStore('accounts'), account];

  setStore('guests', guests);
  setStore('accounts', accounts);
  return account;
}

if (typeof module !== 'undefined') {
  module.exports = {
    STORAGE_KEYS,
    createGuestInvite,
    createGuestAccount,
    getGuestByToken,
    listGuests,
    setStore,
    getStore,
    generateToken,
    normalizeEmail
  };
}
