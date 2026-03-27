'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/chat/channels
 * List all channels the authenticated user is a member of
 */
router.get('/channels', authenticate, (req, res) => {
  try {
    const db = getDb();
    const channels = db.prepare(`
      SELECT c.id, c.name, c.description, c.type, c.created_by, c.created_at,
             (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) as message_count,
             (SELECT m.content FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
             (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
      FROM channels c
      INNER JOIN channel_members cm ON c.id = cm.channel_id
      WHERE cm.user_id = ?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC
    `).all(req.user.id);

    // For DM channels, get the other user's info
    const enriched = channels.map(ch => {
      if (ch.type === 'dm') {
        const other = db.prepare(`
          SELECT u.id, u.name, u.email, u.avatar, u.department
          FROM users u
          INNER JOIN channel_members cm ON u.id = cm.user_id
          WHERE cm.channel_id = ? AND u.id != ?
          LIMIT 1
        `).get(ch.id, req.user.id);
        return { ...ch, dm_user: other || null };
      }
      return ch;
    });

    res.json({ channels: enriched });
  } catch (err) {
    console.error('[Chat] List channels error:', err);
    res.status(500).json({ error: 'Kanallar alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/chat/channels
 * Create a new group channel
 */
router.post('/channels', authenticate, (req, res) => {
  try {
    const { name, description, memberIds } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Kanal adı zorunludur.' });
    }

    const db = getDb();
    const channelId = uuidv4();

    db.prepare(`
      INSERT INTO channels (id, name, description, type, created_by)
      VALUES (?, ?, ?, 'group', ?)
    `).run(channelId, name.trim(), description || null, req.user.id);

    // Add creator as member
    const addMember = db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
    addMember.run(channelId, req.user.id);

    // Add additional members if provided
    if (Array.isArray(memberIds)) {
      for (const uid of memberIds) {
        if (uid !== req.user.id) {
          addMember.run(channelId, uid);
        }
      }
    }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'CHANNEL_CREATED', `Channel: ${name}`, ip);

    res.status(201).json({ channel });
  } catch (err) {
    console.error('[Chat] Create channel error:', err);
    res.status(500).json({ error: 'Kanal oluşturulurken bir hata oluştu.' });
  }
});

/**
 * GET /api/chat/channels/:id/messages
 * Get last 50 messages for a channel
 */
router.get('/channels/:id/messages', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { before, limit = 50 } = req.query;

    const db = getDb();

    // Verify user is member
    const membership = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(id, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Bu kanala erişim izniniz yok.' });
    }

    let query = `
      SELECT m.id, m.channel_id, m.content, m.file_url, m.encrypted, m.created_at,
             u.id as sender_id, u.name as sender_name, u.avatar as sender_avatar, u.role as sender_role
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = ?
    `;
    const params = [id];

    if (before) {
      query += ' AND m.created_at < ?';
      params.push(before);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const messages = db.prepare(query).all(...params);

    // Return in chronological order
    messages.reverse();

    res.json({ messages });
  } catch (err) {
    console.error('[Chat] Get messages error:', err);
    res.status(500).json({ error: 'Mesajlar alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/chat/dm
 * Create or get existing DM channel between two users
 */
router.post('/dm', authenticate, (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Kullanıcı ID zorunludur.' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Kendinizle mesajlaşamazsınız.' });
    }

    const db = getDb();

    // Check if other user exists
    const otherUser = db.prepare('SELECT id, name, email, avatar FROM users WHERE id = ? AND active = 1').get(userId);
    if (!otherUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Check if DM channel already exists between these two users
    const existing = db.prepare(`
      SELECT c.id FROM channels c
      WHERE c.type = 'dm'
        AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = ?)
        AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = ?)
        AND (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) = 2
      LIMIT 1
    `).get(req.user.id, userId);

    if (existing) {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(existing.id);
      return res.json({ channel, dm_user: otherUser, created: false });
    }

    // Create new DM channel
    const channelId = uuidv4();
    const dmName = `dm-${req.user.id.slice(0, 8)}-${userId.slice(0, 8)}`;

    db.prepare(`
      INSERT INTO channels (id, name, description, type, created_by)
      VALUES (?, ?, NULL, 'dm', ?)
    `).run(channelId, dmName, req.user.id);

    db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, req.user.id);
    db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, userId);

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);

    res.status(201).json({ channel, dm_user: otherUser, created: true });
  } catch (err) {
    console.error('[Chat] DM error:', err);
    res.status(500).json({ error: 'Mesaj kanalı oluşturulurken bir hata oluştu.' });
  }
});

/**
 * GET /api/chat/users
 * List all active users for starting DMs
 */
router.get('/users', authenticate, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, name, email, avatar, department, role
      FROM users
      WHERE active = 1 AND id != ?
      ORDER BY name ASC
    `).all(req.user.id);

    res.json({ users });
  } catch (err) {
    console.error('[Chat] List users error:', err);
    res.status(500).json({ error: 'Kullanıcılar alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/chat/channels/:id/members
 * Add a member to a channel
 */
router.post('/channels/:id/members', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Kullanıcı ID zorunludur.' });
    }

    const db = getDb();
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);

    if (!channel) {
      return res.status(404).json({ error: 'Kanal bulunamadı.' });
    }

    if (channel.type === 'dm') {
      return res.status(400).json({ error: 'DM kanalına üye eklenemez.' });
    }

    // Only channel creator or admin can add members
    if (channel.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Üye ekleme yetkiniz yok.' });
    }

    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(id, userId);

    res.json({ message: 'Üye eklendi.' });
  } catch (err) {
    console.error('[Chat] Add member error:', err);
    res.status(500).json({ error: 'Üye eklenirken bir hata oluştu.' });
  }
});

module.exports = router;
