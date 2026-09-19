/* app.js — shared logic for the link-in-bio site.
   Loaded by preview.html and profile.html (create.html has its own inline script).
   No frameworks, no dependencies. */

/* ---------- Icons: defined once, reused everywhere ---------- */
/* Each value is trusted, hand-authored SVG markup (never user data),
   so it's safe to insert via innerHTML. Profile data itself is always
   rendered with textContent / createElement. */
const ICONS = {
  website:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9s1.3-6.3 3.8-9z"/></svg>',
  email:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/></svg>',
  phone:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4.5c0-.6.4-1 1-1h3.2c.5 0 .9.3 1 .8l1 3.8c.1.4 0 .9-.3 1.2L8 10.6a13 13 0 0 0 5.4 5.4l1.3-1.9c.3-.3.8-.4 1.2-.3l3.8 1c.5.1.8.5.8 1V19c0 .6-.4 1-1 1h-1.5C9.4 20 4 14.6 4 6.9V4.5z"/></svg>',
  sms:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5z"/></svg>',
  whatsapp:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l1.3-4A8 8 0 1 1 9 19l-5 1z"/><path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.4.9-1l-.3-1.2a.9.9 0 0 0-1-.6l-1 .2a5 5 0 0 1-2.8-2.8l.2-1a.9.9 0 0 0-.6-1L8.2 7.6a.9.9 0 0 0-1 .9c0 .3 0 .7.1 1"/></svg>',
  facebook:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M14 8.5h-1.5c-.8 0-1.5.7-1.5 1.5v2h3l-.4 3H11v6" /></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".8" fill="currentColor" stroke="none"/></svg>',
  tiktok:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4v9.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.3 2.3 1.9 4 4.5 4.2"/></svg>',
  youtube:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none"/></svg>',
  x:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  linkedin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8" cy="9" r=".6" fill="currentColor" stroke="none"/><path d="M8 12v5M12.5 17v-3.2c0-1.2 1-2 2.2-1.8 1 .2 1.3.9 1.3 1.8V17"/></svg>',
  spotify:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M7.5 10c3-1 6.7-.7 9 .7M7.8 13c2.4-.7 5.3-.5 7.2.6M8.2 16c1.8-.5 4-.4 5.5.4"/></svg>',
  github:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5 0 3.8 2.4 7 5.8 8.1.4.1.6-.2.6-.4v-1.6c-2.4.5-2.9-1.1-2.9-1.1-.4-1-1-1.3-1-1.3-.8-.5.1-.5.1-.5.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.6.7.1-.6.3-1 .6-1.2-1.9-.2-4-1-4-4.2 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.4.9a8 8 0 0 1 4.4 0c1.7-1.1 2.4-.9 2.4-.9.5 1.2.2 2.1.1 2.3.6.6.9 1.4.9 2.3 0 3.2-2 4-3.9 4.2.3.3.6.8.6 1.6v2.4c0 .2.2.5.6.4 3.4-1.1 5.8-4.3 5.8-8.1 0-4.7-3.8-8.5-8.5-8.5z"/></svg>',
  share:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/></svg>',
  chevron:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
  call:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4.5c0-.6.4-1 1-1h3.2c.5 0 .9.3 1 .8l1 3.8c.1.4 0 .9-.3 1.2L8 10.6a13 13 0 0 0 5.4 5.4l1.3-1.9c.3-.3.8-.4 1.2-.3l3.8 1c.5.1.8.5.8 1V19c0 .6-.4 1-1 1h-1.5C9.4 20 4 14.6 4 6.9V4.5z"/></svg>',
  video:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="12" height="12" rx="2.5"/><path d="m15 10 6-3v10l-6-3z"/></svg>',
  close:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  pin:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.2"/></svg>',
  contact:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="3.2"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>'
};

function iconEl(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name] || ICONS.website; // trusted, static markup only
  return span;
}

/* ---------- Encode / decode profile data via URL hash ---------- */
function encodeProfile(profile) {
  const json = JSON.stringify(profile);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeProfile(str) {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function getProfileFromHash() {
  const hash = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const data = params.get('data');
  if (!data) return null;
  return decodeProfile(data);
}

function profileUrl(profile, page) {
  return location.origin + '/' + page + '#data=' + encodeProfile(profile);
}

/* ---------- Helpers ---------- */
function slugify(name) {
  return (name || 'profile').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'profile';
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function linkHref(type, value) {
  const v = (value || '').trim();
  switch (type) {
    case 'email': return 'mailto:' + v;
    case 'phone': return 'tel:' + v.replace(/[^0-9+]/g, '');
    case 'sms': return 'sms:' + v.replace(/[^0-9+]/g, '');
    case 'whatsapp': return 'https://wa.me/' + v.replace(/[^0-9]/g, '');
    default: return /^https?:\/\//i.test(v) ? v : 'https://' + v;
  }
}

/* ---------- Toast ---------- */
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('toast--visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('toast--visible'), 2200);
}

/* ---------- Share ---------- */
async function shareProfile(profile, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title: profile.name, text: profile.title || '', url });
      return;
    } catch (e) { /* user cancelled — fall through silently */ }
  } else {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch (e) {
      showToast('Could not copy link');
    }
  }
}

/* ---------- vCard 3.0 ---------- */
function escapeVCard(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function telType(label) {
  return /mobile|cell/i.test(label) ? 'CELL' : /home/i.test(label) ? 'HOME' : 'WORK';
}

function buildVCard(profile) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push('FN:' + escapeVCard(profile.name));
  lines.push('N:' + escapeVCard(profile.name) + ';;;;');
  if (profile.title) lines.push('TITLE:' + escapeVCard(profile.title));
  (profile.phones || []).forEach(p => {
    if (p.number) lines.push('TEL;TYPE=' + telType(p.label) + ':' + escapeVCard(p.number));
  });
  (profile.emails || []).forEach(e => {
    if (e.address) lines.push('EMAIL;TYPE=INTERNET:' + escapeVCard(e.address));
  });
  if (profile.address && (profile.address.street || profile.address.city || profile.address.country)) {
    const a = profile.address;
    lines.push('ADR;TYPE=WORK:;;' + escapeVCard(a.street) + ';' + escapeVCard(a.city) + ';;;' + escapeVCard(a.country));
  }
  if (profile.website) lines.push('URL:' + escapeVCard(profile.website));
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function downloadVCard(profile) {
  const vcard = buildVCard(profile);
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = slugify(profile.name) + '.vcf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Set document metadata from profile ---------- */
function applyMeta(profile) {
  document.title = profile.name + (profile.title ? ' — ' + profile.title : '');
  const desc = profile.tagline || profile.title || (profile.name + "'s profile");
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.setAttribute('name', 'description');
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute('content', desc);

  let themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement('meta');
    themeColor.setAttribute('name', 'theme-color');
    document.head.appendChild(themeColor);
  }
  themeColor.setAttribute('content', '#FFFFFF');

  if (profile.accent) {
    document.documentElement.style.setProperty('--accent', profile.accent);
  }
}

/* ---------- Render the profile page (used by preview.html & profile.html) ---------- */
function renderProfile(profile, root, opts) {
  opts = opts || {};
  root.innerHTML = ''; // clearing our own static shell, not inserting user data
  applyMeta(profile);

  /* Header */
  const header = document.createElement('header');
  header.className = 'profile-header fade-item';

  const shareBtn = document.createElement('button');
  shareBtn.className = 'icon-btn share-btn';
  shareBtn.type = 'button';
  shareBtn.setAttribute('aria-label', 'Share this profile');
  shareBtn.appendChild(iconEl('share'));
  shareBtn.addEventListener('click', () => shareProfile(profile, opts.shareUrl || location.href));
  header.appendChild(shareBtn);

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'avatar';
  if (profile.avatar) {
    const img = document.createElement('img');
    img.src = profile.avatar;
    img.alt = profile.name;
    img.loading = 'lazy';
    avatarWrap.appendChild(img);
  } else {
    avatarWrap.classList.add('avatar--initials');
    avatarWrap.textContent = initials(profile.name);
  }
  header.appendChild(avatarWrap);

  const nameEl = document.createElement('h1');
  nameEl.className = 'profile-name';
  nameEl.textContent = profile.name || 'Unnamed profile';
  header.appendChild(nameEl);

  if (profile.title) {
    const titleEl = document.createElement('p');
    titleEl.className = 'profile-title';
    titleEl.textContent = profile.title;
    header.appendChild(titleEl);
  }

  if (profile.tagline) {
    const tagEl = document.createElement('p');
    tagEl.className = 'profile-tagline';
    tagEl.textContent = profile.tagline;
    header.appendChild(tagEl);
  }

  root.appendChild(header);

  const main = document.createElement('main');
  main.className = 'link-list';

  /* "Save me in your contacts" — always first, primary */
  const hasContactInfo = (profile.phones && profile.phones.length) || (profile.emails && profile.emails.length);
  if (hasContactInfo) {
    const saveBtn = makeLinkButton({
      icon: 'contact',
      label: 'Save me in your contacts',
      primary: true
    });
    saveBtn.addEventListener('click', () => opts.onOpenContactSheet && opts.onOpenContactSheet(profile));
    wrapFade(saveBtn, main.children.length);
    main.appendChild(saveBtn);
  }

  /* Grouped links */
  (profile.groups || []).forEach(group => {
    if (!group.links || !group.links.length) return;
    const section = document.createElement('section');
    section.className = 'link-group';

    const heading = document.createElement('h2');
    heading.className = 'group-heading';
    heading.textContent = group.title;
    section.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'group-list';

    group.links.forEach(link => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'link-btn';
      a.href = linkHref(link.type, link.value);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.appendChild(iconChip(link.type));
      const labelEl = document.createElement('span');
      labelEl.className = 'link-label';
      labelEl.textContent = link.label;
      a.appendChild(labelEl);
      a.appendChild(iconEl('chevron'));
      li.appendChild(a);
      list.appendChild(li);
    });

    section.appendChild(list);
    wrapFade(section, main.children.length);
    main.appendChild(section);
  });

  root.appendChild(main);
}

function iconChip(type) {
  const chip = document.createElement('span');
  chip.className = 'icon-chip';
  chip.appendChild(iconEl(type));
  return chip;
}

function makeLinkButton({ icon, label, primary }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link-btn' + (primary ? ' link-btn--primary' : '');
  btn.appendChild(iconChip(icon));
  const labelEl = document.createElement('span');
  labelEl.className = 'link-label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);
  btn.appendChild(iconEl('chevron'));
  return btn;
}

function wrapFade(el, index) {
  el.classList.add('fade-item');
  el.style.animationDelay = Math.min(index * 60, 400) + 'ms';
}

/* ---------- Contact bottom sheet ---------- */
function buildContactSheet(profile) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.setAttribute('aria-label', 'Save to contacts');

  const grabber = document.createElement('div');
  grabber.className = 'sheet-grabber';
  dialog.appendChild(grabber);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn sheet-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(iconEl('close'));
  closeBtn.addEventListener('click', () => dialog.close());
  dialog.appendChild(closeBtn);

  const head = document.createElement('div');
  head.className = 'sheet-head';
  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'avatar avatar--small';
  if (profile.avatar) {
    const img = document.createElement('img');
    img.src = profile.avatar;
    img.alt = profile.name;
    avatarWrap.appendChild(img);
  } else {
    avatarWrap.classList.add('avatar--initials');
    avatarWrap.textContent = initials(profile.name);
  }
  head.appendChild(avatarWrap);
  const nameEl = document.createElement('p');
  nameEl.className = 'sheet-name';
  nameEl.textContent = profile.name;
  head.appendChild(nameEl);
  if (profile.title) {
    const titleEl = document.createElement('p');
    titleEl.className = 'sheet-title';
    titleEl.textContent = profile.title;
    head.appendChild(titleEl);
  }
  dialog.appendChild(head);

  /* Quick action tiles */
  const tiles = document.createElement('div');
  tiles.className = 'quick-tiles';
  const firstPhone = (profile.phones || [])[0];
  const firstEmail = (profile.emails || [])[0];
  const actions = [];
  if (firstPhone) actions.push({ icon: 'call', label: 'Call', href: linkHref('phone', firstPhone.number) });
  if (firstPhone) actions.push({ icon: 'sms', label: 'SMS', href: linkHref('sms', firstPhone.number) });
  if (profile.videoUrl) actions.push({ icon: 'video', label: 'Video', href: profile.videoUrl });
  if (firstEmail) actions.push({ icon: 'email', label: 'Email', href: linkHref('email', firstEmail.address) });
  actions.forEach(action => {
    const a = document.createElement('a');
    a.className = 'quick-tile';
    a.href = action.href;
    if (/^https?:\/\//i.test(action.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.appendChild(iconEl(action.icon));
    const span = document.createElement('span');
    span.textContent = action.label;
    a.appendChild(span);
    tiles.appendChild(a);
  });
  if (actions.length) dialog.appendChild(tiles);

  /* Detail rows */
  const rows = document.createElement('ul');
  rows.className = 'sheet-rows';
  (profile.phones || []).forEach(p => rows.appendChild(sheetRow('phone', p.label, p.number, linkHref('phone', p.number))));
  (profile.emails || []).forEach(e => rows.appendChild(sheetRow('email', e.label, e.address, linkHref('email', e.address))));
  if (profile.address && (profile.address.street || profile.address.city)) {
    const a = profile.address;
    const full = [a.street, a.city, a.country].filter(Boolean).join(', ');
    rows.appendChild(sheetRow('pin', a.label || 'Address', full, null));
  }
  if (rows.children.length) dialog.appendChild(rows);

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'link-btn link-btn--primary sheet-primary';
  primary.appendChild(iconChip('contact'));
  const primaryLabel = document.createElement('span');
  primaryLabel.className = 'link-label';
  primaryLabel.textContent = 'Add to contacts';
  primary.appendChild(primaryLabel);
  primary.addEventListener('click', () => downloadVCard(profile));
  dialog.appendChild(primary);

  document.body.appendChild(dialog);
  return dialog;
}

function sheetRow(icon, label, value, href) {
  const li = document.createElement('li');
  li.className = 'sheet-row';
  li.appendChild(iconEl(icon));
  const text = document.createElement('div');
  text.className = 'sheet-row-text';
  const labelEl = document.createElement('span');
  labelEl.className = 'sheet-row-label';
  labelEl.textContent = label;
  const valueEl = href ? document.createElement('a') : document.createElement('span');
  valueEl.className = 'sheet-row-value';
  valueEl.textContent = value;
  if (href) valueEl.href = href;
  text.appendChild(labelEl);
  text.appendChild(valueEl);
  li.appendChild(text);
  return li;
}
