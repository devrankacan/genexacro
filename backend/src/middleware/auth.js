'use strict';

const jwt = require('jsonwebtoken');
const { getDb, logAudit } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'genexa-secret-key-change-in-production';

/**
 * Authenticate middleware - verifies Bearer JWT token and attaches user to req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token bulunamadı. Lütfen giriş yapın.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const db = getDb();
    const user = db.prepare('SELECT id, name, email, role, avatar, department, active FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Hesabınız devre dışı bırakılmıştır.' });
    }

    req.user = user;

    // Log the request to audit_logs (skip high-frequency read endpoints to reduce noise)
    const skipLog = ['GET'].includes(req.method) && (
      req.path.includes('/messages') ||
      req.path.includes('/audit-logs') ||
      req.path.includes('/files/')
    );

    if (!skipLog) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      logAudit(
        user.id,
        `${req.method} ${req.path}`,
        JSON.stringify({ query: req.query, body: sanitizeBody(req.body) }),
        ip
      );
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Oturum süreniz dolmuştur. Lütfen tekrar giriş yapın.' });
    }
    return res.status(401).json({ error: 'Geçersiz token.' });
  }
}

/**
 * RequireAdmin middleware - must be used after authenticate
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Kimlik doğrulama gerekli.' });
  }

  if (req.user.role !== 'admin') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(
      req.user.id,
      'UNAUTHORIZED_ADMIN_ACCESS',
      `Attempted to access: ${req.method} ${req.path}`,
      ip
    );
    return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gereklidir.' });
  }

  next();
}

/**
 * Generate JWT token for user
 */
function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Remove sensitive fields from request body before logging
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'pass'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  });
  return sanitized;
}

module.exports = { authenticate, requireAdmin, generateToken };
