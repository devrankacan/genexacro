'use strict';

const express = require('express');
const { getDb, logAudit } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper: get a single setting value
function getSetting(db, key, defaultVal = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

// Helper: upsert a setting
function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value != null ? String(value) : '');
}

// ─────────────────────────────────────────────
// GET /api/settings — public (theme/logo only)
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const keys = ['accent_color', 'logo_url', 'company_name'];
  const settings = {};
  keys.forEach(k => { settings[k] = getSetting(db, k); });
  res.json(settings);
});

// ─────────────────────────────────────────────
// PUT /api/settings/theme — admin only
// ─────────────────────────────────────────────
router.put('/theme', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const { accent_color, logo_url, company_name } = req.body;

  const update = db.transaction(() => {
    if (accent_color !== undefined) setSetting(db, 'accent_color', accent_color);
    if (logo_url !== undefined) setSetting(db, 'logo_url', logo_url);
    if (company_name !== undefined) setSetting(db, 'company_name', company_name);
  });
  update();

  logAudit(req.user.id, 'SETTINGS_THEME_UPDATE', JSON.stringify({ accent_color, company_name }), req.ip);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// GET /api/settings/mail — admin only
// ─────────────────────────────────────────────
router.get('/mail', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'imap_host', 'imap_port', 'imap_user', 'imap_pass'];
  const settings = {};
  keys.forEach(k => { settings[k] = getSetting(db, k); });
  // Mask password for display
  if (settings.smtp_pass) settings.smtp_pass_set = true;
  if (settings.imap_pass) settings.imap_pass_set = true;
  res.json(settings);
});

// ─────────────────────────────────────────────
// PUT /api/settings/mail — admin only
// ─────────────────────────────────────────────
router.put('/mail', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, imap_host, imap_port, imap_user, imap_pass } = req.body;

  const update = db.transaction(() => {
    if (smtp_host !== undefined) setSetting(db, 'smtp_host', smtp_host);
    if (smtp_port !== undefined) setSetting(db, 'smtp_port', smtp_port);
    if (smtp_user !== undefined) setSetting(db, 'smtp_user', smtp_user);
    if (smtp_pass !== undefined && smtp_pass !== '') setSetting(db, 'smtp_pass', smtp_pass);
    if (smtp_secure !== undefined) setSetting(db, 'smtp_secure', smtp_secure);
    if (imap_host !== undefined) setSetting(db, 'imap_host', imap_host);
    if (imap_port !== undefined) setSetting(db, 'imap_port', imap_port);
    if (imap_user !== undefined) setSetting(db, 'imap_user', imap_user);
    if (imap_pass !== undefined && imap_pass !== '') setSetting(db, 'imap_pass', imap_pass);
  });
  update();

  logAudit(req.user.id, 'SETTINGS_MAIL_UPDATE', JSON.stringify({ smtp_host, smtp_user, imap_host }), req.ip);
  res.json({ success: true });
});

module.exports = router;
module.exports.getSetting = getSetting;
