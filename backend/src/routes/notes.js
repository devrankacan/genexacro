'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notes
 * List notes: own notes + notes shared by others
 */
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { search, tag } = req.query;

    let query = `
      SELECT n.id, n.title, n.content, n.user_id, n.shared, n.tags, n.created_at, n.updated_at,
             u.name as author_name, u.avatar as author_avatar
      FROM notes n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE (n.user_id = ? OR n.shared = 1)
    `;

    const params = [req.user.id];

    if (search) {
      query += ' AND (n.title LIKE ? OR n.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (tag) {
      query += ' AND n.tags LIKE ?';
      params.push(`%${tag}%`);
    }

    query += ' ORDER BY n.updated_at DESC';

    const notes = db.prepare(query).all(...params);

    const parsed = notes.map(note => ({
      ...note,
      tags: (() => { try { return JSON.parse(note.tags || '[]'); } catch { return []; } })(),
      is_owner: note.user_id === req.user.id
    }));

    res.json({ notes: parsed });
  } catch (err) {
    console.error('[Notes] List error:', err);
    res.status(500).json({ error: 'Notlar alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/notes
 * Create a new note
 */
router.post('/', authenticate, (req, res) => {
  try {
    const { title, content, shared, tags } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Not başlığı zorunludur.' });
    }

    const db = getDb();
    const noteId = uuidv4();
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);

    db.prepare(`
      INSERT INTO notes (id, title, content, user_id, shared, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      noteId,
      title.trim(),
      content || '',
      req.user.id,
      shared ? 1 : 0,
      tagsJson
    );

    const note = db.prepare(`
      SELECT n.*, u.name as author_name, u.avatar as author_avatar
      FROM notes n LEFT JOIN users u ON n.user_id = u.id
      WHERE n.id = ?
    `).get(noteId);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'NOTE_CREATED', `Note: ${title}`, ip);

    res.status(201).json({
      note: {
        ...note,
        tags: (() => { try { return JSON.parse(note.tags || '[]'); } catch { return []; } })(),
        is_owner: true
      }
    });
  } catch (err) {
    console.error('[Notes] Create error:', err);
    res.status(500).json({ error: 'Not oluşturulurken bir hata oluştu.' });
  }
});

/**
 * GET /api/notes/:id
 * Get a single note by ID
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const note = db.prepare(`
      SELECT n.*, u.name as author_name, u.avatar as author_avatar
      FROM notes n LEFT JOIN users u ON n.user_id = u.id
      WHERE n.id = ?
    `).get(id);

    if (!note) {
      return res.status(404).json({ error: 'Not bulunamadı.' });
    }

    // Access check: owner or shared
    if (note.user_id !== req.user.id && !note.shared && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu nota erişim izniniz yok.' });
    }

    res.json({
      note: {
        ...note,
        tags: (() => { try { return JSON.parse(note.tags || '[]'); } catch { return []; } })(),
        is_owner: note.user_id === req.user.id
      }
    });
  } catch (err) {
    console.error('[Notes] Get error:', err);
    res.status(500).json({ error: 'Not alınırken bir hata oluştu.' });
  }
});

/**
 * PUT /api/notes/:id
 * Update a note
 */
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!note) {
      return res.status(404).json({ error: 'Not bulunamadı.' });
    }

    if (note.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu notu düzenleme yetkiniz yok.' });
    }

    const { title, content, shared, tags } = req.body;
    const updates = {};

    if (title && title.trim()) updates.title = title.trim();
    if (content !== undefined) updates.content = content;
    if (shared !== undefined) updates.shared = shared ? 1 : 0;
    if (tags !== undefined) updates.tags = JSON.stringify(Array.isArray(tags) ? tags : []);
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE notes SET ${setClauses} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT n.*, u.name as author_name, u.avatar as author_avatar
      FROM notes n LEFT JOIN users u ON n.user_id = u.id
      WHERE n.id = ?
    `).get(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'NOTE_UPDATED', `Note ID: ${id}`, ip);

    res.json({
      note: {
        ...updated,
        tags: (() => { try { return JSON.parse(updated.tags || '[]'); } catch { return []; } })(),
        is_owner: updated.user_id === req.user.id
      }
    });
  } catch (err) {
    console.error('[Notes] Update error:', err);
    res.status(500).json({ error: 'Not güncellenirken bir hata oluştu.' });
  }
});

/**
 * DELETE /api/notes/:id
 * Delete a note
 */
router.delete('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!note) {
      return res.status(404).json({ error: 'Not bulunamadı.' });
    }

    if (note.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu notu silme yetkiniz yok.' });
    }

    db.prepare('DELETE FROM notes WHERE id = ?').run(id);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'NOTE_DELETED', `Note ID: ${id}, Title: ${note.title}`, ip);

    res.json({ message: 'Not silindi.' });
  } catch (err) {
    console.error('[Notes] Delete error:', err);
    res.status(500).json({ error: 'Not silinirken bir hata oluştu.' });
  }
});

module.exports = router;
