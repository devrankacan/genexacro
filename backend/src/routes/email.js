'use strict';

const express = require('express');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getDb, logAudit } = require('../database');
const { authenticate } = require('../middleware/auth');
const { getSetting } = require('./settings');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));

const router = express.Router();

/**
 * Create nodemailer transporter from DB settings (fallback to .env)
 */
function createTransporter() {
  const db = getDb();
  const host = getSetting(db, 'smtp_host') || process.env.SMTP_HOST || '';
  const port = parseInt(getSetting(db, 'smtp_port') || process.env.SMTP_PORT || '587', 10);
  const user = getSetting(db, 'smtp_user') || process.env.SMTP_USER || '';
  const pass = getSetting(db, 'smtp_pass') || process.env.SMTP_PASS || '';
  const secure = (getSetting(db, 'smtp_secure') || 'false') === 'true' || port === 465;

  return nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

/**
 * Get IMAP config from DB settings (fallback to .env)
 */
function getImapConfig() {
  const db = getDb();
  return {
    host: getSetting(db, 'imap_host') || process.env.IMAP_HOST || '',
    port: parseInt(getSetting(db, 'imap_port') || process.env.IMAP_PORT || '993', 10),
    user: getSetting(db, 'imap_user') || process.env.IMAP_USER || '',
    pass: getSetting(db, 'imap_pass') || process.env.IMAP_PASS || '',
  };
}

/**
 * GET /api/email/inbox
 * List inbox emails for authenticated user
 */
router.get('/inbox', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const emails = db.prepare(`
      SELECT id, message_id, from_addr, to_addr, subject, direction, read, folder, created_at, attachments
      FROM emails
      WHERE user_id = ? AND folder = 'inbox' AND direction = 'in'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM emails
      WHERE user_id = ? AND folder = 'inbox' AND direction = 'in'
    `).get(req.user.id);

    const unread = db.prepare(`
      SELECT COUNT(*) as count FROM emails
      WHERE user_id = ? AND folder = 'inbox' AND direction = 'in' AND read = 0
    `).get(req.user.id);

    res.json({
      emails,
      total: total.count,
      unread: unread.count,
      page: parseInt(page),
      pages: Math.ceil(total.count / parseInt(limit))
    });
  } catch (err) {
    console.error('[Email] Inbox error:', err);
    res.status(500).json({ error: 'Gelen kutusu alınırken bir hata oluştu.' });
  }
});

/**
 * GET /api/email/sent
 * List sent emails for authenticated user
 */
router.get('/sent', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const emails = db.prepare(`
      SELECT id, message_id, from_addr, to_addr, subject, direction, read, folder, created_at, attachments
      FROM emails
      WHERE user_id = ? AND direction = 'out'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM emails WHERE user_id = ? AND direction = 'out'
    `).get(req.user.id);

    res.json({
      emails,
      total: total.count,
      page: parseInt(page),
      pages: Math.ceil(total.count / parseInt(limit))
    });
  } catch (err) {
    console.error('[Email] Sent error:', err);
    res.status(500).json({ error: 'Gönderilen e-postalar alınırken bir hata oluştu.' });
  }
});

/**
 * GET /api/email/trash
 * List trashed emails for authenticated user
 */
router.get('/trash', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const emails = db.prepare(`
      SELECT id, message_id, from_addr, to_addr, subject, direction, read, folder, created_at, attachments
      FROM emails
      WHERE user_id = ? AND folder = 'trash'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), offset);

    const total = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE user_id = ? AND folder = 'trash'`).get(req.user.id);

    res.json({ emails, total: total.count, page: parseInt(page), pages: Math.ceil(total.count / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'Çöp kutusu alınırken bir hata oluştu.' });
  }
});

/**
 * GET /api/email/:id
 * Get a single email by ID and mark as read
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    const email = db.prepare('SELECT * FROM emails WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!email) {
      return res.status(404).json({ error: 'E-posta bulunamadı.' });
    }

    // Mark as read
    if (!email.read) {
      db.prepare('UPDATE emails SET read = 1 WHERE id = ?').run(email.id);
      email.read = 1;
    }

    // Parse attachments JSON
    if (email.attachments) {
      try {
        email.attachments = JSON.parse(email.attachments);
      } catch (_) {
        email.attachments = [];
      }
    }

    res.json({ email });
  } catch (err) {
    console.error('[Email] Get email error:', err);
    res.status(500).json({ error: 'E-posta alınırken bir hata oluştu.' });
  }
});

/**
 * POST /api/email/send
 * Send an email via SMTP and save to DB
 */
router.post('/send', authenticate, async (req, res) => {
  try {
    const { to, subject, body, cc, bcc, attachmentUrls = [] } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Alıcı, konu ve içerik zorunludur.' });
    }

    const transporter = createTransporter();
    const db = getDb();
    const smtpUser = getSetting(db, 'smtp_user') || process.env.SMTP_USER || req.user.email;
    const fromName = getSetting(db, 'smtp_from_name') || req.user.name;

    // Build nodemailer attachments from uploaded file URLs
    const attachments = (Array.isArray(attachmentUrls) ? attachmentUrls : []).map(item => {
      const filename = path.basename(item.url || item);
      return { filename: item.originalname || filename, path: path.join(UPLOAD_DIR, filename) };
    });

    const mailOptions = {
      from: `"${fromName}" <${smtpUser}>`,
      to,
      subject,
      html: body,
      cc: cc || undefined,
      bcc: bcc || undefined,
      attachments,
    };

    let sendResult = null;
    let sendError = null;

    try {
      sendResult = await transporter.sendMail(mailOptions);
    } catch (smtpErr) {
      console.error('[Email] SMTP send error:', smtpErr.message);
      sendError = smtpErr.message;
    }

    // Save to DB regardless of SMTP result (store locally)
    const emailId = uuidv4();
    const messageId = sendResult ? sendResult.messageId : `local-${emailId}`;
    const attachmentsMeta = (Array.isArray(attachmentUrls) ? attachmentUrls : []).map(a => ({
      filename: a.originalname || path.basename(a.url || a),
      url: a.url || a,
    }));

    db.prepare(`
      INSERT INTO emails (id, message_id, from_addr, to_addr, subject, body, direction, read, folder, user_id, attachments)
      VALUES (?, ?, ?, ?, ?, ?, 'out', 1, 'sent', ?, ?)
    `).run(
      emailId,
      messageId,
      smtpUser,
      to,
      subject,
      body,
      req.user.id,
      JSON.stringify(attachmentsMeta)
    );

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'EMAIL_SENT', `To: ${to}, Subject: ${subject}`, ip);

    if (sendError) {
      return res.status(207).json({
        message: 'E-posta kaydedildi ancak SMTP üzerinden gönderilemedi.',
        emailId,
        smtpError: sendError
      });
    }

    res.status(201).json({ message: 'E-posta başarıyla gönderildi.', emailId, messageId });
  } catch (err) {
    console.error('[Email] Send error:', err);
    res.status(500).json({ error: 'E-posta gönderilirken bir hata oluştu.' });
  }
});

/**
 * DELETE /api/email/:id
 * Move to trash (soft delete). If already in trash, permanently delete.
 */
router.delete('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    const email = db.prepare('SELECT id, folder FROM emails WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!email) {
      return res.status(404).json({ error: 'E-posta bulunamadı.' });
    }

    if (email.folder === 'trash') {
      db.prepare('DELETE FROM emails WHERE id = ?').run(req.params.id);
      return res.json({ message: 'E-posta kalıcı olarak silindi.' });
    }

    db.prepare("UPDATE emails SET folder = 'trash' WHERE id = ?").run(req.params.id);
    res.json({ message: 'E-posta çöp kutusuna taşındı.' });
  } catch (err) {
    console.error('[Email] Delete error:', err);
    res.status(500).json({ error: 'E-posta silinirken bir hata oluştu.' });
  }
});

/**
 * POST /api/email/fetch
 * Fetch emails from IMAP server and store locally
 */
router.post('/fetch', authenticate, (req, res) => {
  const cfg = getImapConfig();
  const imapConfig = {
    user: cfg.user,
    password: cfg.pass,
    host: cfg.host,
    port: cfg.port,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
    connTimeout: 15000
  };

  const imap = new Imap(imapConfig);
  const savedEmails = [];
  const errors = [];

  function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
  }

  imap.once('ready', () => {
    openInbox((err, box) => {
      if (err) {
        imap.end();
        return res.status(500).json({ error: 'IMAP kutusu açılamadı: ' + err.message });
      }

      // Fetch last 20 emails
      const total = box.messages.total;
      if (total === 0) {
        imap.end();
        return res.json({ message: 'Gelen kutusunda e-posta bulunamadı.', saved: 0 });
      }

      const start = Math.max(1, total - 19);
      const fetch = imap.seq.fetch(`${start}:${total}`, {
        bodies: '',
        struct: true
      });

      const parsePromises = [];

      fetch.on('message', (msg) => {
        const parsePromise = new Promise((resolve) => {
          let rawEmail = '';
          msg.on('body', (stream) => {
            stream.on('data', (chunk) => { rawEmail += chunk.toString('utf8'); });
            stream.once('end', () => {
              simpleParser(rawEmail)
                .then(parsed => {
                  resolve({
                    messageId: parsed.messageId || uuidv4(),
                    from: parsed.from ? parsed.from.text : 'unknown',
                    to: parsed.to ? parsed.to.text : '',
                    subject: parsed.subject || '(Konu yok)',
                    body: parsed.html || parsed.text || '',
                    date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                    attachments: parsed.attachments ? parsed.attachments.map(a => ({
                      filename: a.filename,
                      contentType: a.contentType,
                      size: a.size
                    })) : []
                  });
                })
                .catch(parseErr => {
                  errors.push(parseErr.message);
                  resolve(null);
                });
            });
          });
        });
        parsePromises.push(parsePromise);
      });

      fetch.once('error', (fetchErr) => {
        errors.push(fetchErr.message);
      });

      fetch.once('end', async () => {
        imap.end();

        const parsedEmails = await Promise.all(parsePromises);
        const db = getDb();

        for (const parsed of parsedEmails) {
          if (!parsed) continue;

          // Check if already exists
          const existing = db.prepare('SELECT id FROM emails WHERE message_id = ? AND user_id = ?')
            .get(parsed.messageId, req.user.id);

          if (!existing) {
            const emailId = uuidv4();
            try {
              db.prepare(`
                INSERT INTO emails (id, message_id, from_addr, to_addr, subject, body, direction, read, folder, user_id, created_at, attachments)
                VALUES (?, ?, ?, ?, ?, ?, 'in', 0, 'inbox', ?, ?, ?)
              `).run(
                emailId,
                parsed.messageId,
                parsed.from,
                parsed.to,
                parsed.subject,
                parsed.body,
                req.user.id,
                parsed.date,
                JSON.stringify(parsed.attachments)
              );
              savedEmails.push(emailId);
            } catch (dbErr) {
              errors.push(dbErr.message);
            }
          }
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        logAudit(req.user.id, 'EMAIL_FETCH', `Fetched ${savedEmails.length} new emails from IMAP`, ip);

        res.json({
          message: `${savedEmails.length} yeni e-posta alındı.`,
          saved: savedEmails.length,
          errors: errors.length > 0 ? errors : undefined
        });
      });
    });
  });

  imap.once('error', (imapErr) => {
    console.error('[Email] IMAP error:', imapErr);
    if (!res.headersSent) {
      res.status(500).json({ error: 'IMAP sunucusuna bağlanılamadı: ' + imapErr.message });
    }
  });

  imap.once('end', () => {
    console.log('[Email] IMAP connection ended');
  });

  try {
    imap.connect();
  } catch (connErr) {
    res.status(500).json({ error: 'IMAP bağlantısı başlatılamadı: ' + connErr.message });
  }
});

module.exports = router;
