'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

/**
 * GET /api/admin/users
 * List all users with stats
 */
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT
        u.id, u.name, u.email, u.role, u.avatar, u.department, u.active, u.created_at,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) as message_count,
        (SELECT COUNT(*) FROM emails e WHERE e.user_id = u.id) as email_count,
        (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id = u.id) as last_activity
      FROM users u
      ORDER BY u.created_at DESC
    `).all();

    res.json({ users });
  } catch (err) {
    console.error('[Admin] List users error:', err);
    res.status(500).json({ error: 'Kullanıcılar alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 */
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
    }

    const validRoles = ['user', 'admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Geçersiz rol. user veya admin olmalıdır.' });
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
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), email.toLowerCase().trim(), hashedPassword, role || 'user', department || null);

    const user = db.prepare('SELECT id, name, email, role, avatar, department, active, created_at FROM users WHERE id = ?').get(userId);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'ADMIN_USER_CREATED', `Created user: ${email} with role: ${role || 'user'}`, ip);

    res.status(201).json({ user });
  } catch (err) {
    console.error('[Admin] Create user error:', err);
    res.status(500).json({ error: 'Kullanıcı oluşturulurken bir hata oluştu.' });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user (role, active status, etc.)
 */
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const { name, email, role, department, active, password } = req.body;

    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (email && email.trim()) {
      // Check email uniqueness
      const emailConflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), id);
      if (emailConflict) {
        return res.status(409).json({ error: 'Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor.' });
      }
      updates.email = email.toLowerCase().trim();
    }
    if (role !== undefined) {
      const validRoles = ['user', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Geçersiz rol.' });
      }
      updates.role = role;
    }
    if (department !== undefined) updates.department = department;
    if (active !== undefined) updates.active = active ? 1 : 0;
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

    const updated = db.prepare('SELECT id, name, email, role, avatar, department, active, created_at FROM users WHERE id = ?').get(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'ADMIN_USER_UPDATED', `Updated user ID: ${id}`, ip);

    res.json({ user: updated });
  } catch (err) {
    console.error('[Admin] Update user error:', err);
    res.status(500).json({ error: 'Kullanıcı güncellenirken bir hata oluştu.' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user (cannot delete self)
 */
router.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'ADMIN_USER_DELETED', `Deleted user: ${user.email} (${id})`, ip);

    res.json({ message: 'Kullanıcı silindi.' });
  } catch (err) {
    console.error('[Admin] Delete user error:', err);
    res.status(500).json({ error: 'Kullanıcı silinirken bir hata oluştu.' });
  }
});

/**
 * GET /api/admin/audit-logs
 * Get all audit logs with optional filters
 */
router.get('/audit-logs', (req, res) => {
  try {
    const db = getDb();
    const { user_id, action, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT a.id, a.user_id, a.action, a.details, a.ip_address, a.created_at,
             u.name as user_name, u.email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      query += ' AND a.user_id = ?';
      params.push(user_id);
    }

    if (action) {
      query += ' AND a.action LIKE ?';
      params.push(`%${action}%`);
    }

    if (from) {
      query += ' AND a.created_at >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND a.created_at <= ?';
      params.push(to);
    }

    const countQuery = query.replace(
      'SELECT a.id, a.user_id, a.action, a.details, a.ip_address, a.created_at,\n             u.name as user_name, u.email as user_email',
      'SELECT COUNT(*) as count'
    );
    const total = db.prepare(countQuery).get(...params);

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const logs = db.prepare(query).all(...params);

    res.json({
      logs,
      total: total.count,
      page: parseInt(page),
      pages: Math.ceil(total.count / parseInt(limit))
    });
  } catch (err) {
    console.error('[Admin] Audit logs error:', err);
    res.status(500).json({ error: 'Denetim günlükleri alınırken bir hata oluştu.' });
  }
});

/**
 * GET /api/admin/email-traffic
 * Monitor all email traffic (in/out)
 */
router.get('/email-traffic', (req, res) => {
  try {
    const db = getDb();
    const { direction, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT e.id, e.message_id, e.from_addr, e.to_addr, e.subject, e.direction,
             e.read, e.folder, e.user_id, e.created_at, e.attachments,
             u.name as user_name, u.email as user_email
      FROM emails e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (direction) {
      query += ' AND e.direction = ?';
      params.push(direction);
    }

    if (from) {
      query += ' AND e.created_at >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND e.created_at <= ?';
      params.push(to);
    }

    const countQuery = query.replace(
      `SELECT e.id, e.message_id, e.from_addr, e.to_addr, e.subject, e.direction,\n             e.read, e.folder, e.user_id, e.created_at, e.attachments,\n             u.name as user_name, u.email as user_email`,
      'SELECT COUNT(*) as count'
    );
    const total = db.prepare(countQuery).get(...params);

    query += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const emails = db.prepare(query).all(...params);

    // Daily stats summary
    const dailyStats = db.prepare(`
      SELECT
        date(created_at) as date,
        direction,
        COUNT(*) as count
      FROM emails
      GROUP BY date(created_at), direction
      ORDER BY date DESC
      LIMIT 30
    `).all();

    res.json({
      emails,
      total: total.count,
      page: parseInt(page),
      pages: Math.ceil(total.count / parseInt(limit)),
      daily_stats: dailyStats
    });
  } catch (err) {
    console.error('[Admin] Email traffic error:', err);
    res.status(500).json({ error: 'E-posta trafiği alınırken bir hata oluştu.' });
  }
});

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get();
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const emailCount = db.prepare('SELECT COUNT(*) as count FROM emails').get();
    const emailIn = db.prepare("SELECT COUNT(*) as count FROM emails WHERE direction = 'in'").get();
    const emailOut = db.prepare("SELECT COUNT(*) as count FROM emails WHERE direction = 'out'").get();
    const channelCount = db.prepare('SELECT COUNT(*) as count FROM channels').get();
    const noteCount = db.prepare('SELECT COUNT(*) as count FROM notes').get();
    const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
    const auditCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();

    // Messages in last 7 days
    const recentMessages = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE created_at >= datetime('now', '-7 days')
    `).get();

    // New users in last 30 days
    const newUsers = db.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE created_at >= datetime('now', '-30 days')
    `).get();

    // Top active users (by message count)
    const topUsers = db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar, COUNT(m.id) as message_count
      FROM users u
      LEFT JOIN messages m ON m.sender_id = u.id
      GROUP BY u.id
      ORDER BY message_count DESC
      LIMIT 5
    `).all();

    // Recent audit log actions
    const recentActivity = db.prepare(`
      SELECT a.action, a.created_at, u.name as user_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `).all();

    res.json({
      stats: {
        users: {
          active: userCount.count,
          total: totalUsers.count,
          new_last_30_days: newUsers.count
        },
        messages: {
          total: messageCount.count,
          last_7_days: recentMessages.count
        },
        emails: {
          total: emailCount.count,
          incoming: emailIn.count,
          outgoing: emailOut.count
        },
        channels: channelCount.count,
        notes: noteCount.count,
        events: eventCount.count,
        audit_logs: auditCount.count
      },
      top_users: topUsers,
      recent_activity: recentActivity
    });
  } catch (err) {
    console.error('[Admin] Stats error:', err);
    res.status(500).json({ error: 'İstatistikler alınırken bir hata oluştu.' });
  }
});

module.exports = router;
