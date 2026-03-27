'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const { initializeDatabase, getDb, logAudit } = require('./src/database');
const { initSocket } = require('./src/socket');

// ─────────────────────────────────────────────
// Initialize Database
// ─────────────────────────────────────────────
initializeDatabase();

// ─────────────────────────────────────────────
// Express App Setup
// ─────────────────────────────────────────────
const app = express();

// CORS configuration - allow frontend origins
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests from localhost in development, or same-origin
    const allowed = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:4173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in internal network; restrict in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for accurate IP logging
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// Static File Serving (uploads)
// ─────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '1d',
  etag: true
}));

// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Genexa CRO Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/email',     require('./src/routes/email'));
app.use('/api/chat',      require('./src/routes/chat'));
app.use('/api/calendar',  require('./src/routes/calendar'));
app.use('/api/notes',     require('./src/routes/notes'));
app.use('/api/admin',     require('./src/routes/admin'));
app.use('/api/files',     require('./src/routes/files'));
app.use('/api/meetings',  require('./src/routes/meetings'));

// ─────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Rota bulunamadı: ${req.method} ${req.path}` });
});

// ─────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Sunucu hatası oluştu.',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// ─────────────────────────────────────────────
// HTTP Server + Socket.io
// ─────────────────────────────────────────────
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

initSocket(io);

// ─────────────────────────────────────────────
// Seed initial data
// ─────────────────────────────────────────────
async function seedInitialData() {
  const db = getDb();

  // ── Admin user ──
  const adminEmail = 'admin@genexa.com.tr';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

  let adminId;
  if (!existingAdmin) {
    adminId = uuidv4();
    const hashedPassword = await bcrypt.hash('Admin123!', 12);
    db.prepare(`
      INSERT INTO users (id, name, email, password, role, department)
      VALUES (?, ?, ?, ?, 'admin', ?)
    `).run(adminId, 'Sistem Yöneticisi', adminEmail, hashedPassword, 'Bilgi Teknolojileri');
    console.log('[Seed] Admin kullanıcı oluşturuldu:', adminEmail);
  } else {
    adminId = existingAdmin.id;
    console.log('[Seed] Admin kullanıcı zaten mevcut:', adminEmail);
  }

  // ── Default demo user ──
  const demoEmail = 'demo@genexa.com.tr';
  const existingDemo = db.prepare('SELECT id FROM users WHERE email = ?').get(demoEmail);
  let demoId;
  if (!existingDemo) {
    demoId = uuidv4();
    const demoPassword = await bcrypt.hash('Demo123!', 12);
    db.prepare(`
      INSERT INTO users (id, name, email, password, role, department)
      VALUES (?, ?, ?, ?, 'user', ?)
    `).run(demoId, 'Demo Kullanıcı', demoEmail, demoPassword, 'Araştırma ve Geliştirme');
    console.log('[Seed] Demo kullanıcı oluşturuldu:', demoEmail);
  } else {
    demoId = existingDemo.id;
  }

  // ── Default channels ──
  const defaultChannels = [
    {
      name: 'genel',
      description: 'Genexa CRO genel iletişim kanalı. Duyurular ve genel konuşmalar için.',
    },
    {
      name: 'lims-entegrasyon',
      description: 'LIMS (Laboratuvar Bilgi Yönetim Sistemi) entegrasyon çalışmaları ve teknik tartışmalar.',
    },
    {
      name: 'arastirma',
      description: 'Klinik araştırma protokolleri, veri analizi ve bilimsel tartışmalar.',
    },
    {
      name: 'laboratuvar',
      description: 'Laboratuvar operasyonları, numune yönetimi ve ekipman güncellemeleri.',
    }
  ];

  for (const ch of defaultChannels) {
    const existing = db.prepare("SELECT id FROM channels WHERE name = ? AND type = 'group'").get(ch.name);
    if (!existing) {
      const channelId = uuidv4();
      db.prepare(`
        INSERT INTO channels (id, name, description, type, created_by)
        VALUES (?, ?, ?, 'group', ?)
      `).run(channelId, ch.name, ch.description, adminId);

      // Add admin as member
      db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, adminId);

      // Add demo user to all channels
      if (demoId) {
        db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channelId, demoId);
      }

      console.log(`[Seed] Kanal oluşturuldu: #${ch.name}`);
    } else {
      console.log(`[Seed] Kanal zaten mevcut: #${ch.name}`);
    }
  }

  // ── Seed welcome message in #genel ──
  const genelChannel = db.prepare("SELECT id FROM channels WHERE name = 'genel' AND type = 'group'").get();
  if (genelChannel) {
    const existingMsg = db.prepare('SELECT id FROM messages WHERE channel_id = ? LIMIT 1').get(genelChannel.id);
    if (!existingMsg) {
      db.prepare(`
        INSERT INTO messages (id, channel_id, sender_id, content, encrypted)
        VALUES (?, ?, ?, ?, 0)
      `).run(
        uuidv4(),
        genelChannel.id,
        adminId,
        'Genexa CRO İç İletişim Platformuna hoş geldiniz! Bu platform; ekip sohbeti, webmail, takvim, notlar ve video toplantı özelliklerini bir arada sunmaktadır.'
      );
      console.log('[Seed] Karşılama mesajı eklendi.');
    }
  }
}

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);

server.listen(PORT, '0.0.0.0', async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        Genexa CRO Backend Server             ║');
  console.log(`║  Listening on port ${PORT}                       ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  try {
    await seedInitialData();
  } catch (err) {
    console.error('[Seed] Seed data error:', err.message);
  }

  console.log('');
  console.log('[Server] API endpoints:');
  console.log(`  POST   http://localhost:${PORT}/api/auth/login`);
  console.log(`  POST   http://localhost:${PORT}/api/auth/register`);
  console.log(`  GET    http://localhost:${PORT}/api/chat/channels`);
  console.log(`  GET    http://localhost:${PORT}/api/email/inbox`);
  console.log(`  GET    http://localhost:${PORT}/api/calendar/events`);
  console.log(`  GET    http://localhost:${PORT}/api/notes`);
  console.log(`  GET    http://localhost:${PORT}/api/admin/stats`);
  console.log(`  GET    http://localhost:${PORT}/health`);
  console.log('');
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    try {
      const db = getDb();
      db.close();
      console.log('[DB] Database connection closed.');
    } catch (_) {}
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

module.exports = { app, server, io };
