'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/meetings/rooms
 * List active meeting rooms
 */
router.get('/rooms', authenticate, (req, res) => {
  try {
    const db = getDb();
    const rooms = db.prepare(`
      SELECT mr.id, mr.room_code, mr.name, mr.created_by, mr.active, mr.created_at,
             u.name as creator_name, u.avatar as creator_avatar
      FROM meeting_rooms mr
      LEFT JOIN users u ON mr.created_by = u.id
      WHERE mr.active = 1
      ORDER BY mr.created_at DESC
    `).all();

    res.json({ rooms });
  } catch (err) {
    console.error('[Meetings] List rooms error:', err);
    res.status(500).json({ error: 'Toplantı odaları alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/meetings/rooms
 * Create a new meeting room
 */
router.post('/rooms', authenticate, (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Toplantı odası adı zorunludur.' });
    }

    const db = getDb();
    const roomId = uuidv4();
    const roomCode = generateRoomCode();

    db.prepare(`
      INSERT INTO meeting_rooms (id, room_code, name, created_by, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(roomId, roomCode, name.trim(), req.user.id);

    const room = db.prepare(`
      SELECT mr.*, u.name as creator_name, u.avatar as creator_avatar
      FROM meeting_rooms mr LEFT JOIN users u ON mr.created_by = u.id
      WHERE mr.id = ?
    `).get(roomId);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'MEETING_ROOM_CREATED', `Room: ${name}, Code: ${roomCode}`, ip);

    res.status(201).json({ room });
  } catch (err) {
    console.error('[Meetings] Create room error:', err);
    res.status(500).json({ error: 'Toplantı odası oluşturulurken bir hata oluştu.' });
  }
});

/**
 * DELETE /api/meetings/rooms/:id
 * End/close a meeting room
 */
router.delete('/rooms/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const room = db.prepare('SELECT * FROM meeting_rooms WHERE id = ?').get(id);
    if (!room) {
      return res.status(404).json({ error: 'Toplantı odası bulunamadı.' });
    }

    if (room.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu odayı kapatma yetkiniz yok.' });
    }

    db.prepare('UPDATE meeting_rooms SET active = 0 WHERE id = ?').run(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'MEETING_ROOM_CLOSED', `Room ID: ${id}, Code: ${room.room_code}`, ip);

    res.json({ message: 'Toplantı odası kapatıldı.' });
  } catch (err) {
    console.error('[Meetings] Close room error:', err);
    res.status(500).json({ error: 'Toplantı odası kapatılırken bir hata oluştu.' });
  }
});

/**
 * GET /api/meetings/rooms/:code
 * Get room info by room code
 */
router.get('/rooms/:code', authenticate, (req, res) => {
  try {
    const { code } = req.params;
    const db = getDb();

    const room = db.prepare(`
      SELECT mr.*, u.name as creator_name, u.avatar as creator_avatar
      FROM meeting_rooms mr LEFT JOIN users u ON mr.created_by = u.id
      WHERE mr.room_code = ? AND mr.active = 1
    `).get(code.toUpperCase());

    if (!room) {
      return res.status(404).json({ error: 'Aktif toplantı odası bulunamadı.' });
    }

    res.json({ room });
  } catch (err) {
    console.error('[Meetings] Get room error:', err);
    res.status(500).json({ error: 'Toplantı odası bilgisi alınırken bir hata oluştu.' });
  }
});

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = router;
