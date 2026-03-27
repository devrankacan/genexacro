'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    db.prepare(`
      INSERT INTO users (id, name, email, password, role, department)
      VALUES (?, ?, ?, ?, 'user', ?)
    `).run(userId, name.trim(), email.toLowerCase().trim(), hashedPassword, department || null);

    const token = generateToken(userId);
    const user = db.prepare('SELECT id, name, email, role, avatar, department, created_at FROM users WHERE id = ?').get(userId);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(userId, 'USER_REGISTERED', `New user registered: ${email}`, ip);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Hesabınız devre dışı bırakılmıştır. Yönetici ile iletişime geçin.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      logAudit(user.id, 'LOGIN_FAILED', `Failed login attempt for: ${email}`, ip);
      return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }

    const token = generateToken(user.id);
    const { password: _, ...safeUser } = user;

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(user.id, 'USER_LOGIN', `User logged in: ${email}`, ip);

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

/**
 * GET /api/auth/users
 * List all active users (for DM / mentions)
 */
router.get('/users', authenticate, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, name, email, role, avatar, department, created_at
      FROM users
      WHERE active = 1
      ORDER BY name ASC
    `).all();

    res.json({ users });
  } catch (err) {
    console.error('[Auth] List users error:', err);
    res.status(500).json({ error: 'Kullanıcılar alınırken bir hata oluştu.' });
  }
});

/**
 * PATCH /api/auth/users/:id
 * Update user profile (own profile or admin)
 */
router.patch('/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only update their own profile, admins can update any
    if (req.user.id !== id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Başka bir kullanıcının profilini düzenleyemezsiniz.' });
    }

    const { name, department, avatar, password } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (department !== undefined) updates.department = department;
    if (avatar !== undefined) updates.avatar = avatar;

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
      }
      updates.password = await bcrypt.hash(password, 12);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Güncellenecek alan bulunamadı.' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);

    const updatedUser = db.prepare('SELECT id, name, email, role, avatar, department, created_at FROM users WHERE id = ?').get(id);

    res.json({ user: updatedUser });
  } catch (err) {
    console.error('[Auth] Update user error:', err);
    res.status(500).json({ error: 'Profil güncellenirken bir hata oluştu.' });
  }
});

// GET /api/auth/signature - get own signature
router.get('/signature', authenticate, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT signature FROM users WHERE id = ?').get(req.user.id);
  res.json({ signature: row?.signature || '' });
});

// PUT /api/auth/signature - update own signature
router.put('/signature', authenticate, (req, res) => {
  const { signature } = req.body;
  const db = getDb();
  db.prepare('UPDATE users SET signature = ? WHERE id = ?').run(signature || '', req.user.id);
  res.json({ success: true });
});

module.exports = router;
