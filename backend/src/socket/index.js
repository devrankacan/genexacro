'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb, logAudit } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'genexa-secret-key-change-in-production';

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map();

// Track meeting room participants: Map<roomCode, Map<socketId, { userId, name, avatar }>>
const meetingRooms = new Map();

/**
 * Authenticate a socket connection via JWT token
 */
function authenticateSocket(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    (socket.handshake.headers?.authorization || '').replace('Bearer ', '');

  if (!token) {
    return next(new Error('Kimlik doğrulama token\'ı bulunamadı.'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, role, avatar, department FROM users WHERE id = ? AND active = 1').get(decoded.id);

    if (!user) {
      return next(new Error('Kullanıcı bulunamadı veya hesap devre dışı.'));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Geçersiz veya süresi dolmuş token.'));
  }
}

/**
 * Add user to online tracking
 */
function addOnlineUser(userId, socketId) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socketId);
}

/**
 * Remove user socket from online tracking
 */
function removeOnlineUser(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
    }
  }
}

/**
 * Get list of online user IDs
 */
function getOnlineUserIds() {
  return Array.from(onlineUsers.keys());
}

/**
 * Initialize Socket.io and register all event handlers
 */
function initSocket(io) {
  // Apply JWT authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket] User connected: ${user.name} (${user.id}) - socket: ${socket.id}`);

    // Track online status
    addOnlineUser(user.id, socket.id);

    // Join the user to all their channels
    try {
      const db = getDb();
      const channels = db.prepare(`
        SELECT channel_id FROM channel_members WHERE user_id = ?
      `).all(user.id);

      channels.forEach(({ channel_id }) => {
        socket.join(`channel:${channel_id}`);
      });

      console.log(`[Socket] ${user.name} joined ${channels.length} channels`);
    } catch (err) {
      console.error('[Socket] Error joining channels:', err.message);
    }

    // Join personal room for direct notifications
    socket.join(`user:${user.id}`);

    // Broadcast online status to all connected users
    io.emit('users:online', { userIds: getOnlineUserIds() });

    // ─────────────────────────────────────────────
    // CHAT EVENTS
    // ─────────────────────────────────────────────

    /**
     * message:send
     * Payload: { channelId, content, fileUrl? }
     */
    socket.on('message:send', (data) => {
      try {
        const { channelId, content, fileUrl } = data || {};

        if (!channelId || (!content && !fileUrl)) {
          return socket.emit('error', { message: 'Kanal ID ve mesaj içeriği zorunludur.' });
        }

        const db = getDb();

        // Verify membership
        const membership = db.prepare(
          'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?'
        ).get(channelId, user.id);

        if (!membership) {
          return socket.emit('error', { message: 'Bu kanala mesaj gönderme yetkiniz yok.' });
        }

        const messageId = uuidv4();
        const createdAt = new Date().toISOString();

        db.prepare(`
          INSERT INTO messages (id, channel_id, sender_id, content, file_url, encrypted, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?)
        `).run(messageId, channelId, user.id, content || null, fileUrl || null, createdAt);

        const message = {
          id: messageId,
          channel_id: channelId,
          sender_id: user.id,
          sender_name: user.name,
          sender_avatar: user.avatar,
          sender_role: user.role,
          content: content || null,
          file_url: fileUrl || null,
          encrypted: 0,
          created_at: createdAt
        };

        // Emit to all channel members
        io.to(`channel:${channelId}`).emit('message:new', message);

        // Notify members not in the channel room (for unread badge updates)
        try {
          const members = db.prepare(
            'SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id != ?'
          ).all(channelId, user.id);

          members.forEach(({ user_id }) => {
            io.to(`user:${user_id}`).emit('notification:message', {
              channelId,
              message: { ...message }
            });
          });
        } catch (_) {}

      } catch (err) {
        console.error('[Socket] message:send error:', err.message);
        socket.emit('error', { message: 'Mesaj gönderilirken bir hata oluştu.' });
      }
    });

    /**
     * message:typing
     * Payload: { channelId, isTyping }
     */
    socket.on('message:typing', (data) => {
      const { channelId, isTyping } = data || {};
      if (!channelId) return;

      socket.to(`channel:${channelId}`).emit('message:typing', {
        channelId,
        userId: user.id,
        userName: user.name,
        isTyping: !!isTyping
      });
    });

    /**
     * channel:join
     * Payload: { channelId }
     * Join a new channel room (after being added as a member)
     */
    socket.on('channel:join', (data) => {
      const { channelId } = data || {};
      if (!channelId) return;

      const db = getDb();
      const membership = db.prepare(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?'
      ).get(channelId, user.id);

      if (membership) {
        socket.join(`channel:${channelId}`);
        socket.emit('channel:joined', { channelId });
      }
    });

    // ─────────────────────────────────────────────
    // WEBRTC / VIDEO MEETING EVENTS
    // ─────────────────────────────────────────────

    /**
     * webrtc:join-room
     * Payload: { roomCode }
     */
    socket.on('webrtc:join-room', (data) => {
      try {
        const { roomCode } = data || {};
        if (!roomCode) return;

        const code = roomCode.toUpperCase();

        if (!meetingRooms.has(code)) {
          meetingRooms.set(code, new Map());
        }

        const room = meetingRooms.get(code);
        const participantInfo = {
          userId: user.id,
          name: user.name,
          avatar: user.avatar,
          socketId: socket.id
        };

        room.set(socket.id, participantInfo);
        socket.join(`meeting:${code}`);

        // Send current participants to the new joiner
        const participants = Array.from(room.values()).filter(p => p.socketId !== socket.id);
        socket.emit('webrtc:room-info', { roomCode: code, participants });

        // Notify existing participants about the new joiner
        socket.to(`meeting:${code}`).emit('webrtc:user-joined', {
          roomCode: code,
          participant: participantInfo
        });

        logAudit(user.id, 'MEETING_JOINED', `Room: ${code}`, null);
        console.log(`[Socket] ${user.name} joined meeting room: ${code}`);
      } catch (err) {
        console.error('[Socket] webrtc:join-room error:', err.message);
      }
    });

    /**
     * webrtc:offer
     * Relay SDP offer to a specific peer
     * Payload: { targetSocketId, offer, roomCode }
     */
    socket.on('webrtc:offer', (data) => {
      const { targetSocketId, offer, roomCode } = data || {};
      if (!targetSocketId || !offer) return;

      io.to(targetSocketId).emit('webrtc:offer', {
        offer,
        fromSocketId: socket.id,
        fromUserId: user.id,
        fromName: user.name,
        roomCode
      });
    });

    /**
     * webrtc:answer
     * Relay SDP answer to a specific peer
     * Payload: { targetSocketId, answer, roomCode }
     */
    socket.on('webrtc:answer', (data) => {
      const { targetSocketId, answer, roomCode } = data || {};
      if (!targetSocketId || !answer) return;

      io.to(targetSocketId).emit('webrtc:answer', {
        answer,
        fromSocketId: socket.id,
        fromUserId: user.id,
        roomCode
      });
    });

    /**
     * webrtc:ice-candidate
     * Relay ICE candidate to a specific peer
     * Payload: { targetSocketId, candidate, roomCode }
     */
    socket.on('webrtc:ice-candidate', (data) => {
      const { targetSocketId, candidate, roomCode } = data || {};
      if (!targetSocketId || !candidate) return;

      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        candidate,
        fromSocketId: socket.id,
        roomCode
      });
    });

    /**
     * webrtc:leave-room
     * Payload: { roomCode }
     */
    socket.on('webrtc:leave-room', (data) => {
      try {
        const { roomCode } = data || {};
        if (!roomCode) return;

        const code = roomCode.toUpperCase();
        handleLeaveMeeting(socket, code, io);
      } catch (err) {
        console.error('[Socket] webrtc:leave-room error:', err.message);
      }
    });

    /**
     * webrtc:toggle-media
     * Broadcast media state changes (mute/unmute, camera on/off) to room
     * Payload: { roomCode, audio, video }
     */
    socket.on('webrtc:toggle-media', (data) => {
      const { roomCode, audio, video } = data || {};
      if (!roomCode) return;

      socket.to(`meeting:${roomCode.toUpperCase()}`).emit('webrtc:media-state', {
        fromSocketId: socket.id,
        userId: user.id,
        audio,
        video
      });
    });

    // ─────────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] User disconnected: ${user.name} (${user.id}) - reason: ${reason}`);

      removeOnlineUser(user.id, socket.id);

      // Remove from all meeting rooms
      meetingRooms.forEach((room, code) => {
        if (room.has(socket.id)) {
          handleLeaveMeeting(socket, code, io);
        }
      });

      // Broadcast updated online list
      io.emit('users:online', { userIds: getOnlineUserIds() });
    });
  });

  console.log('[Socket] Socket.io initialized');
}

/**
 * Helper: remove participant from meeting room and notify others
 */
function handleLeaveMeeting(socket, roomCode, io) {
  const room = meetingRooms.get(roomCode);
  if (!room) return;

  const participant = room.get(socket.id);
  room.delete(socket.id);
  socket.leave(`meeting:${roomCode}`);

  if (room.size === 0) {
    meetingRooms.delete(roomCode);
  }

  if (participant) {
    io.to(`meeting:${roomCode}`).emit('webrtc:user-left', {
      roomCode,
      socketId: socket.id,
      userId: participant.userId,
      name: participant.name
    });
    console.log(`[Socket] ${participant.name} left meeting room: ${roomCode}`);
  }
}

module.exports = { initSocket, getOnlineUserIds };
