'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

// File type whitelist
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed'
]);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Desteklenmeyen dosya türü: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
    files: 5                     // max 5 files per request
  }
});

/**
 * POST /api/files/upload
 * Upload one or multiple files
 */
router.post('/upload', authenticate, (req, res) => {
  const uploader = upload.array('files', 5);

  uploader(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Dosya boyutu 25 MB sınırını aşıyor.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Tek seferde en fazla 5 dosya yükleyebilirsiniz.' });
        }
        return res.status(400).json({ error: 'Dosya yükleme hatası: ' + err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Yüklenecek dosya bulunamadı.' });
    }

    const uploaded = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/api/files/${file.filename}`
    }));

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'FILE_UPLOADED', `Files: ${uploaded.map(f => f.originalname).join(', ')}`, ip);

    res.status(201).json({
      message: `${uploaded.length} dosya başarıyla yüklendi.`,
      files: uploaded
    });
  });
});

/**
 * GET /api/files/:filename
 * Serve a file by filename
 */
router.get('/:filename', authenticate, (req, res) => {
  try {
    const { filename } = req.params;

    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    if (!filePath.startsWith(UPLOAD_DIR)) {
      return res.status(400).json({ error: 'Geçersiz dosya yolu.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya bulunamadı.' });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('[Files] Serve file error:', err);
    res.status(500).json({ error: 'Dosya sunulurken bir hata oluştu.' });
  }
});

/**
 * DELETE /api/files/:filename
 * Delete a file (admin only or uploader)
 */
router.delete('/:filename', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Dosya silmek için yönetici yetkisi gereklidir.' });
    }

    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    if (!filePath.startsWith(UPLOAD_DIR)) {
      return res.status(400).json({ error: 'Geçersiz dosya yolu.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya bulunamadı.' });
    }

    fs.unlinkSync(filePath);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    logAudit(req.user.id, 'FILE_DELETED', `File: ${safeFilename}`, ip);

    res.json({ message: 'Dosya silindi.' });
  } catch (err) {
    console.error('[Files] Delete file error:', err);
    res.status(500).json({ error: 'Dosya silinirken bir hata oluştu.' });
  }
});

module.exports = router;
