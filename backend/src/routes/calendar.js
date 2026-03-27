'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/calendar/events
 * List events for the authenticated user (own + events they're attendees of)
 * Supports optional date range filtering: ?start=ISO&end=ISO
 */
router.get('/events', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { start, end } = req.query;

    let query = `
      SELECT e.id, e.title, e.description, e.start_time, e.end_time, e.color,
             e.created_by, e.attendees_json, e.type, e.created_at,
             u.name as creator_name, u.avatar as creator_avatar
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE (
        e.created_by = ?
        OR e.attendees_json LIKE ?
      )
    `;

    const params = [req.user.id, `%${req.user.id}%`];

    if (start) {
      query += ' AND e.end_time >= ?';
      params.push(start);
    }

    if (end) {
      query += ' AND e.start_time <= ?';
      params.push(end);
    }

    query += ' ORDER BY e.start_time ASC';

    const events = db.prepare(query).all(...params);

    // Parse attendees_json
    const parsed = events.map(ev => ({
      ...ev,
      attendees: (() => {
        try { return JSON.parse(ev.attendees_json || '[]'); } catch { return []; }
      })()
    }));

    res.json({ events: parsed });
  } catch (err) {
    console.error('[Calendar] List events error:', err);
    res.status(500).json({ error: 'Etkinlikler alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/calendar/events
 * Create a new calendar event
 */
router.post('/events', authenticate, (req, res) => {
  try {
    const { title, description, start_time, end_time, color, attendees, type } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Başlık, başlangıç ve bitiş zamanı zorunludur.' });
    }

    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ error: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır.' });
    }

    const db = getDb();
    const eventId = uuidv4();
    const attendeesJson = JSON.stringify(Array.isArray(attendees) ? attendees : []);

    db.prepare(`
      INSERT INTO events (id, title, description, start_time, end_time, color, created_by, attendees_json, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      title.trim(),
      description || null,
      start_time,
      end_time,
      color || '#4F46E5',
      req.user.id,
      attendeesJson,
      type || 'meeting'
    );

    const event = db.prepare(`
      SELECT e.*, u.name as creator_name, u.avatar as creator_avatar
      FROM events e LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(eventId);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'EVENT_CREATED', `Event: ${title} at ${start_time}`, ip);

    res.status(201).json({
      event: {
        ...event,
        attendees: (() => { try { return JSON.parse(event.attendees_json || '[]'); } catch { return []; } })()
      }
    });
  } catch (err) {
    console.error('[Calendar] Create event error:', err);
    res.status(500).json({ error: 'Etkinlik oluşturulurken bir hata oluştu.' });
  }
});

/**
 * PUT /api/calendar/events/:id
 * Update a calendar event
 */
router.put('/events/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }

    // Only creator or admin can update
    if (event.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu etkinliği düzenleme yetkiniz yok.' });
    }

    const { title, description, start_time, end_time, color, attendees, type } = req.body;

    const updates = {};
    if (title && title.trim()) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (start_time) updates.start_time = start_time;
    if (end_time) updates.end_time = end_time;
    if (color) updates.color = color;
    if (type) updates.type = type;
    if (attendees !== undefined) updates.attendees_json = JSON.stringify(Array.isArray(attendees) ? attendees : []);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Güncellenecek alan bulunamadı.' });
    }

    // Validate times if both provided
    const newStart = updates.start_time || event.start_time;
    const newEnd = updates.end_time || event.end_time;
    if (new Date(newEnd) <= new Date(newStart)) {
      return res.status(400).json({ error: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır.' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE events SET ${setClauses} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT e.*, u.name as creator_name, u.avatar as creator_avatar
      FROM events e LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'EVENT_UPDATED', `Event ID: ${id}`, ip);

    res.json({
      event: {
        ...updated,
        attendees: (() => { try { return JSON.parse(updated.attendees_json || '[]'); } catch { return []; } })()
      }
    });
  } catch (err) {
    console.error('[Calendar] Update event error:', err);
    res.status(500).json({ error: 'Etkinlik güncellenirken bir hata oluştu.' });
  }
});

/**
 * DELETE /api/calendar/events/:id
 * Delete a calendar event
 */
router.delete('/events/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }

    if (event.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu etkinliği silme yetkiniz yok.' });
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'EVENT_DELETED', `Event ID: ${id}, Title: ${event.title}`, ip);

    res.json({ message: 'Etkinlik silindi.' });
  } catch (err) {
    console.error('[Calendar] Delete event error:', err);
    res.status(500).json({ error: 'Etkinlik silinirken bir hata oluştu.' });
  }
});

module.exports = router;
