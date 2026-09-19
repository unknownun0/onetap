const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createGuestInvite,
  createGuestAccount,
  getGuestByToken,
  listGuests,
  setStore,
  getStore
} = require('./guest-admin.js');

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
