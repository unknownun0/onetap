const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createGuestInvite,
  createGuestAccount,
  getGuestByToken,
  listGuests,
  setStore,
  getStore,
  getCustomerSession,
  setCustomerSession,
  loginCustomer,
  saveCustomerProfile,
  getCustomerProfile,
  listAccounts,
  deactivateAccount,
  deleteAccount,
  getHomePageSettings,
  setHomePageSettings
} = require('./guest-admin.js');

test('admin can edit the home page content, image, and product details', () => {
  const next = {
    headline: 'Your Link.',
    subheadline: 'One Tap.',
    description: 'Custom NFC cards and keychains for your social, business and brand.',
    image: 'https://example.com/onetap.png',
    badges: ['ONE TAP', 'FACEBOOK', 'LINKEDIN'],
    accountText: 'My Account'
  };

  const saved = setHomePageSettings(next);
  const loaded = getHomePageSettings();

  assert.deepEqual(saved, next);
  assert.equal(loaded.headline, 'Your Link.');
  assert.equal(loaded.image, 'https://example.com/onetap.png');
  assert.deepEqual(loaded.badges, ['ONE TAP', 'FACEBOOK', 'LINKEDIN']);
});

test('createGuestInvite adds a new guest with a token and sign-up URL', () => {
  setStore('guests', []);
  setStore('accounts', []);

  const guest = createGuestInvite({ name: 'Jane Doe', email: 'jane@example.com' });

  assert.equal(guest.name, 'Jane Doe');
  assert.match(guest.token, /^guest_[A-Za-z0-9_-]+$/);
  assert.equal(guest.status, 'pending');
  assert.match(guest.signupUrl, /guest-signup\.html\?token=/);
  assert.match(guest.qrUrl, /api\.qrserver\.com/);
  assert.equal(listGuests().length, 1);
});

test('createGuestAccount marks the guest as used and creates an account', () => {
  setStore('guests', []);
  setStore('accounts', []);
  const guest = createGuestInvite({ name: 'John Doe', email: 'john@example.com' });

  const account = createGuestAccount({
    guestToken: guest.token,
    name: 'John Doe',
    email: 'john@example.com',
    password: 'secret123'
  });

  assert.equal(account.email, 'john@example.com');
  assert.equal(account.role, 'guest');
  assert.equal(getGuestByToken(guest.token).status, 'used');
  assert.equal(getStore('accounts').length, 1);
});

test('duplicate guest email is rejected', () => {
  setStore('guests', []);
  setStore('accounts', []);
  createGuestInvite({ name: 'Alpha', email: 'alpha@example.com' });

  const result = createGuestInvite({ name: 'Beta', email: 'alpha@example.com' });

  assert.equal(result.error, 'Email already exists');
});

test('customer can sign in and keep a session for their account page', () => {
  setStore('guests', []);
  setStore('accounts', []);
  setCustomerSession(null);

  const guest = createGuestInvite({ name: 'Customer User', email: 'customer@example.com' });
  const account = createGuestAccount({
    guestToken: guest.token,
    name: 'Customer User',
    email: 'customer@example.com',
    password: 'secret123'
  });

  const login = loginCustomer({ email: 'customer@example.com', password: 'secret123' });

  assert.equal(login.ok, true);
  assert.equal(login.account.email, 'customer@example.com');
  assert.equal(getCustomerSession().email, 'customer@example.com');
  assert.equal(account.email, 'customer@example.com');
});

test('customer can save profile settings and keep them for their preview', () => {
  setStore('guests', []);
  setStore('accounts', []);
  setCustomerSession(null);

  const guest = createGuestInvite({ name: 'Profile User', email: 'profile@example.com' });
  createGuestAccount({
    guestToken: guest.token,
    name: 'Profile User',
    email: 'profile@example.com',
    password: 'secret123'
  });

  loginCustomer({ email: 'profile@example.com', password: 'secret123' });

  const saved = saveCustomerProfile({
    name: 'Profile User',
    title: 'Brand Designer',
    tagline: 'Helping brands look sharper',
    accent: '#0f172a'
  });

  assert.equal(saved.name, 'Profile User');
  assert.equal(saved.title, 'Brand Designer');
  assert.equal(getCustomerProfile().tagline, 'Helping brands look sharper');
});

test('used invite shows the customer preview link instead of the original invitation', () => {
  setStore('guests', []);
  setStore('accounts', []);
  setCustomerSession(null);

  const guest = createGuestInvite({ name: 'Preview User', email: 'preview@example.com' });
  createGuestAccount({
    guestToken: guest.token,
    name: 'Preview User',
    email: 'preview@example.com',
    password: 'secret123'
  });

  const updatedGuest = getGuestByToken(guest.token);
  assert.ok(updatedGuest.previewUrl.includes('profile.html#data='));
  assert.ok(!updatedGuest.previewUrl.includes('guest-signup.html?token='));
});

test('admin can deactivate and delete customer accounts', () => {
  setStore('guests', []);
  setStore('accounts', []);
  setCustomerSession(null);

  const guest = createGuestInvite({ name: 'Admin User', email: 'adminuser@example.com' });
  const account = createGuestAccount({
    guestToken: guest.token,
    name: 'Admin User',
    email: 'adminuser@example.com',
    password: 'secret123'
  });

  const deactivated = deactivateAccount(account.id);
  assert.equal(deactivated.status, 'inactive');
  assert.equal(loginCustomer({ email: 'adminuser@example.com', password: 'secret123' }).ok, false);

  const deleted = deleteAccount(account.id);
  assert.equal(deleted, true);
  assert.equal(listAccounts().length, 0);
});
