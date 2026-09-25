# OneTap PH — Digital Business Card & Link-in-Bio Platform

A vanilla-JS, zero-dependency platform for creating NFC-powered digital business cards and link-in-bio pages. Includes admin dashboard for managing invites, customer portal for profile editing, and public profile rendering via URL hash.

## Features

- **Landing Page** (`index.html`) — Product showcase with 3 NFC products (Stand, Card, Keychain)
- **Admin Dashboard** (`guest-admin.html`) — Create guest invites, manage customers, edit homepage content
- **Guest Signup** (`guest-signup.html`) — Invite-only account creation from admin-generated links
- **Customer Portal** (`customer-account.html`) — Profile editor with live preview
- **Public Profiles** (`profile.html`, `preview.html`) — Data encoded in URL hash, no server storage needed
- **NFC Ready** — QR codes on invites, profiles work with NFC cards/stands/keychains
- **Contact Sharing** — vCard download, bottom sheet with quick actions (Call, SMS, Email)

## Tech Stack

- **Frontend**: Vanilla JS, CSS Variables (design system), Inter font
- **Backend**: Node.js `http` module (no Express, no npm deps)
- **Database**: JSON file (`data-store.json`) with atomic writes + write queue
- **Auth**: Server-side sessions with scrypt password hashing, rate limiting
- **Deployment**: Vercel-ready, runs on any Node host

## Quick Start

```bash
# Install Node.js 18+ (for crypto.scryptSync, global fetch)
# No npm install needed - zero dependencies

# Configure environment (copy and edit)
cp .env.example .env
# Edit .env with secure ADMIN_USERNAME / ADMIN_PASSWORD

# Run server
node server.js
# → http://localhost:3000
```

## Pages

| Page | Purpose |
|------|---------|
| `/` | Landing page with product showcase |
| `/guest-admin.html` | Admin dashboard (login required) |
| `/customer-login.html` | Customer login |
| `/customer-account.html` | Customer profile editor |
| `/guest-signup.html?token=...` | Guest account creation from invite |
| `/profile.html#data=...` | Public profile (shareable link) |
| `/preview.html#data=...` | Preview with edit/publish buttons |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `ADMIN_USERNAME` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin password | `admin123` |
| `ADMIN_PASSWORD_HASH` | Pre-hashed admin password (scrypt) | — |
| `VERCEL_URL` | Auto-set on Vercel | — |

**⚠️ Security**: Change `ADMIN_USERNAME` and `ADMIN_PASSWORD` in production. The app warns on startup if defaults are used.

### Generating a Pre-hashed Admin Password

```bash
node -e "
const crypto = require('crypto');
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync('your-secure-password', salt, 32, {N:16384,r:8,p:1});
console.log('scrypt:' + salt.toString('base64') + ':' + hash.toString('base64'));
"
```

Add the output to `.env` as `ADMIN_PASSWORD_HASH` (and remove `ADMIN_PASSWORD`).

## Default Login

- **Admin**: `admin` / `admin123` (change via env vars)
- **Customer**: Created via admin invite → `guest-signup.html`

## API Endpoints

### Admin (require `x-admin-token` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login → returns token |
| POST | `/api/admin/logout` | Invalidate admin token |
| GET | `/api/guests` | List all guest invites |
| GET | `/api/guests/lookup?token=` | Public invite lookup |
| POST | `/api/guests` | Create guest invite |
| DELETE | `/api/guests/:id` | Delete invite |
| GET | `/api/accounts` | List all customer accounts |
| PATCH | `/api/accounts/:id` | Activate/deactivate account `{status}` |
| DELETE | `/api/accounts/:id` | Delete account |
| GET | `/api/homepage` | Get homepage settings |
| PUT | `/api/homepage` | Update homepage settings |

### Customer (require `x-customer-token` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/customers/login` | Login → returns `customerToken` + session |
| POST | `/api/customers/profile` | Save profile (uses token, not body `sessionId`) |

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/accounts` | Create account from guest invite |

## Security Features

- ✅ Passwords hashed with scrypt (N=16384, r=8, p=1)
- ✅ Legacy plaintext passwords auto-migrated on boot
- ✅ Server-side admin auth with opaque session tokens
- ✅ Customer tokens issued at login, validated on each request
- ✅ Rate limiting: 10 attempts / 5 min / IP on login endpoints
- ✅ Forbidden file list blocks `data-store.json`, `package.json`, `.env`, etc.
- ✅ Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- ✅ Gzip compression + ETag + Cache-Control on static assets
- ✅ Atomic file writes with write queue (no race conditions)
- ✅ Input validation & length limits on all fields

## Known Limitations

- **Sessions are in-memory** — restarting the server logs out all admins and customers
- **JSON file database** — fine for small scale; consider SQLite for concurrent writes at scale
- **Avatars stored inline** as data URLs in `data-store.json` — large images bloat the DB
- **CSP allows `'unsafe-inline'`** — inline scripts on each page; future work: move to external files + nonce/hash CSP

## Project Structure

```
index.html              # Landing page + profile builder
customer-login.html      # Customer login
customer-account.html    # Customer profile editor
guest-signup.html        # Guest → account from invite
guest-admin.html         # Admin dashboard
profile.html / preview.html  # Public profile renderers
app.js                   # Shared profile rendering (icons, vCard, contact sheet)
guest-admin.js           # Client logic: auth, storage, API calls
server.js                # Node http server + JSON-file DB
data-store.json          # Runtime data (guests, accounts, homepage)
styles.css               # Design system (CSS variables, dark mode)
guest-admin.test.js      # Node test suite (offline/local paths)
.env.example             # Environment config template
vercel.json              # Vercel deployment config
```

## Running Tests

```bash
# Runs 11 tests covering offline/local code paths
node --test guest-admin.test.js
```

## Deploying to Vercel

1. Push this folder to a Git repo
2. Import in Vercel — no build command needed
3. Set environment variables in Vercel dashboard:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD` (or `ADMIN_PASSWORD_HASH`)
4. Deploy — `server.js` runs as a serverless function

**Note**: On serverless platforms, in-memory sessions (admin/customer tokens) will reset on each cold start. For production, consider a persistent session store (Redis, database).

## License

MIT