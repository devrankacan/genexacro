import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Hash,
  MessageSquare,
  Plus,
  Send,
  Paperclip,
  Smile,
  Lock,
  Search,
  ChevronDown,
  Users,
  X,
  AtSign,
  MoreHorizontal,
  Check,
  Circle,
} from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import api from '../api/axios'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function formatMsgTime(date) {
  try {
    const d = typeof date === 'string' ? parseISO(date) : new Date(date)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return `Dün ${format(d, 'HH:mm')}`
    return format(d, 'd MMM HH:mm', { locale: tr })
  } catch {
    return ''
  }
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name) {
  const colors = [
    'bg-brand-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-yellow-600',
  ]
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash += name.charCodeAt(i)
  return colors[hash % colors.length]
}

function CreateChannelModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Kanal adı gerekli'); return }
    setLoading(true)
    try {
      const res = await api.post('/api/chat/channels', {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        description: desc.trim(),
      })
      onCreate(res.data)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Kanal oluşturulamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="font-semibold text-white">Yeni Kanal Oluştur</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Kanal Adı</label>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="kanal-adı" className="input-field pl-8" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Açıklama (isteğe bağlı)</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Kanal açıklaması" className="input-field" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary text-xs py-1.5">İptal</button>
          <button onClick={handleCreate} disabled={loading} className="btn-primary text-xs py-1.5">
            {loading ? 'Oluşturuluyor...' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewDMModal({ onClose, onSelect, currentUserId }) {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/users').then(res => {
      setUsers((res.data.users || res.data || []).filter(u => u._id !== currentUserId))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [currentUserId])

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="font-semibold text-white">Yeni Mesaj</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Kullanıcı ara..." className="input-field pl-8 text-sm" />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-500">Yükleniyor...</div>
            ) : filtered.map(u => (
              <button
                key={u._id}
                onClick={() => { onSelect(u); onClose() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated transition-all text-left"
              >
                <div className={`w-8 h-8 rounded-full ${avatarColor(u.name)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                  {getInitials(u.name)}
                </div>
                <div>
                  <p className="text-sm text-gray-200 font-medium">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.department || u.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { user } = useAuth()
  const { socket } = useSocket()

  const [channels, setChannels] = useState([])
  const [dms, setDms] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [activeDM, setActiveDM] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)
  const [unread, setUnread] = useState({})
  const [onlineUsers, setOnlineUsers] = useState([])

  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const fileInputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  // Load channels
  useEffect(() => {
    api.get('/api/chat/channels').then(res => {
      const ch = res.data.channels || res.data || []
      setChannels(ch)
      if (ch.length > 0 && !activeChannel && !activeDM) {
        setActiveChannel(ch[0])
      }
    }).catch(() => {})
  }, [])

  // Load DMs
  useEffect(() => {
    api.get('/api/chat/dms').then(res => {
      setDms(res.data.conversations || res.data || [])
    }).catch(() => {})
  }, [])

  // Load messages for active channel/dm
  useEffect(() => {
    const load = async () => {
      setLoadingMsgs(true)
      setMessages([])
      try {
        let url
        if (activeChannel) {
          url = `/api/chat/channels/${activeChannel._id}/messages`
        } else if (activeDM) {
          url = `/api/chat/dms/${activeDM.userId}/messages`
        }
        if (!url) return
        const res = await api.get(url)
        setMessages(res.data.messages || res.data || [])
      } catch {}
      finally { setLoadingMsgs(false) }
    }
    if (activeChannel || activeDM) load()
  }, [activeChannel, activeDM])

  // Socket listeners
  useEffect(() => {
    if (!socket) return

    const roomId = activeChannel ? `channel:${activeChannel._id}` : activeDM ? `dm:${activeDM.userId}` : null

    if (roomId) {
      socket.emit('join', { room: roomId })
    }

    socket.on('new_message', (msg) => {
      const msgRoom = msg.channelId ? `channel:${msg.channelId}` : `dm:${msg.dmUserId}`
      if (msgRoom === roomId) {
        setMessages(prev => {
          if (prev.find(m => m._id === msg._id)) return prev
          return [...prev, msg]
        })
      } else {
        setUnread(prev => ({ ...prev, [msgRoom]: (prev[msgRoom] || 0) + 1 }))
      }
    })

    socket.on('typing', ({ userId, userName, room }) => {
      if (room === roomId && userId !== user?._id) {
        setTypingUsers(prev => {
          if (prev.find(u => u.userId === userId)) return prev
          return [...prev, { userId, userName }]
        })
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== userId))
        }, 3000)
      }
    })

    socket.on('online_users', (users) => {
      setOnlineUsers(users || [])
    })

    return () => {
      if (roomId) socket.emit('leave', { room: roomId })
      socket.off('new_message')
      socket.off('typing')
      socket.off('online_users')
    }
  }, [socket, activeChannel, activeDM, user])

  const handleSend = async () => {
    if (!input.trim() && !sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    try {
      let res
      if (activeChannel) {
        res = await api.post(`/api/chat/channels/${activeChannel._id}/messages`, { content: text })
      } else if (activeDM) {
        res = await api.post(`/api/chat/dms/${activeDM.userId}/messages`, { content: text })
      }
      if (res?.data) {
        const msg = res.data.message || res.data
        setMessages(prev => {
          if (prev.find(m => m._id === msg._id)) return prev
          return [...prev, msg]
        })
      }
    } catch (err) {
      toast.error('Mesaj gönderilemedi')
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Emit typing
    if (socket && (activeChannel || activeDM)) {
      const room = activeChannel ? `channel:${activeChannel._id}` : `dm:${activeDM.userId}`
      socket.emit('typing', { room, userId: user?._id, userName: user?.name })
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const fileUrl = res.data.url || res.data.path
      const fileName = file.name
      let msgRes
      const content = `[${fileName}](${fileUrl})`
      if (activeChannel) {
        msgRes = await api.post(`/api/chat/channels/${activeChannel._id}/messages`, { content, fileUrl, fileName })
      } else if (activeDM) {
        msgRes = await api.post(`/api/chat/dms/${activeDM.userId}/messages`, { content, fileUrl, fileName })
      }
      if (msgRes?.data) {
        const msg = msgRes.data.message || msgRes.data
        setMessages(prev => {
          if (prev.find(m => m._id === msg._id)) return prev
          return [...prev, msg]
        })
      }
    } catch {
      toast.error('Dosya yüklenemedi')
    }
    e.target.value = ''
  }

  const selectChannel = (ch) => {
    setActiveChannel(ch)
    setActiveDM(null)
    setTypingUsers([])
  }

  const selectDM = (dm) => {
    setActiveDM(dm)
    setActiveChannel(null)
    setTypingUsers([])
  }

  const activeTitle = activeChannel
    ? `#${activeChannel.name}`
    : activeDM
    ? activeDM.userName
    : 'Sohbet'

  const activeDesc = activeChannel?.description || (activeDM ? activeDM.department : '')

  return (
    <div className="flex h-full">
      {/* Channels sidebar */}
      <div className="w-56 flex-shrink-0 bg-surface-sidebar border-r border-surface-border flex flex-col py-3">
        {/* Channels section */}
        <div className="px-3 mb-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Kanallar</span>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-surface-card transition-all"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="space-y-0.5 mt-1">
            {channels.map(ch => (
              <button
                key={ch._id}
                onClick={() => selectChannel(ch)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all ${
                  activeChannel?._id === ch._id
                    ? 'bg-brand-500/15 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-card'
                }`}
              >
                <Hash size={14} className="flex-shrink-0" />
                <span className="truncate flex-1 text-left">{ch.name}</span>
                {unread[`channel:${ch._id}`] > 0 && (
                  <span className="badge-blue text-[10px]">{unread[`channel:${ch._id}`]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-surface-border mx-3 my-2" />

        {/* DMs section */}
        <div className="px-3 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Mesajlar</span>
            <button
              onClick={() => setShowNewDM(true)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-surface-card transition-all"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="space-y-0.5">
            {dms.map(dm => {
              const isOnline = onlineUsers.includes(dm.userId)
              return (
                <button
                  key={dm.userId}
                  onClick={() => selectDM(dm)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all ${
                    activeDM?.userId === dm.userId
                      ? 'bg-brand-500/15 text-white font-medium'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-surface-card'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className={`w-5 h-5 rounded-full ${avatarColor(dm.userName)} flex items-center justify-center text-[9px] font-bold text-white`}>
                      {getInitials(dm.userName)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-sidebar ${isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                  </div>
                  <span className="truncate flex-1 text-left">{dm.userName}</span>
                  {unread[`dm:${dm.userId}`] > 0 && (
                    <span className="badge-blue text-[10px]">{unread[`dm:${dm.userId}`]}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        {(activeChannel || activeDM) && (
          <div className="h-14 flex-shrink-0 flex items-center justify-between px-5 border-b border-surface-border bg-[#0f1117]">
            <div className="flex items-center gap-2.5">
              {activeChannel ? (
                <Hash size={18} className="text-gray-400" />
              ) : (
                <div className={`w-7 h-7 rounded-full ${avatarColor(activeDM?.userName)} flex items-center justify-center text-xs font-bold text-white`}>
                  {getInitials(activeDM?.userName)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white leading-tight">{activeTitle}</p>
                {activeDesc && <p className="text-[11px] text-gray-500">{activeDesc}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeChannel && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users size={13} />
                  <span>{activeChannel.memberCount || channels.find(c => c._id === activeChannel._id)?.memberCount || '—'} üye</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {loadingMsgs ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !activeChannel && !activeDM ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <MessageSquare size={48} className="text-gray-700" />
              <p className="text-gray-500">Bir kanal veya sohbet seçin</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <MessageSquare size={36} className="text-gray-700" />
              <p className="text-sm text-gray-500">Henüz mesaj yok. İlk mesajı gönder!</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const prevMsg = i > 0 ? messages[i - 1] : null
                const isSameSender = prevMsg?.sender?._id === msg.sender?._id &&
                  new Date(msg.createdAt) - new Date(prevMsg.createdAt) < 5 * 60 * 1000
                const isOwn = msg.sender?._id === user?._id

                return (
                  <div
                    key={msg._id || i}
                    className={`flex gap-3 group hover:bg-surface-card/30 px-2 py-1 rounded-lg transition-all -mx-2 ${
                      isSameSender ? 'mt-0.5' : 'mt-3'
                    }`}
                  >
                    {!isSameSender ? (
                      <div className={`w-8 h-8 rounded-full ${avatarColor(msg.sender?.name)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5`}>
                        {getInitials(msg.sender?.name)}
                      </div>
                    ) : (
                      <div className="w-8 flex-shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-gray-600">{formatMsgTime(msg.createdAt).split(' ').pop()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {!isSameSender && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className={`text-sm font-semibold ${isOwn ? 'text-brand-300' : 'text-gray-200'}`}>
                            {msg.sender?.name || 'Bilinmiyor'}
                          </span>
                          <span className="text-[11px] text-gray-600">{formatMsgTime(msg.createdAt)}</span>
                          {msg.encrypted && (
                            <span className="flex items-center gap-0.5 text-[10px] text-green-500">
                              <Lock size={10} />
                              Şifreli
                            </span>
                          )}
                        </div>
                      )}
                      {msg.fileUrl ? (
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-brand-300 hover:text-brand-200 hover:border-brand-500/40 transition-all"
                        >
                          <Paperclip size={13} />
                          {msg.fileName || 'Dosya'}
                        </a>
                      ) : (
                        <p className="text-sm text-gray-300 leading-relaxed break-words">
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1">
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-500">
                    {typingUsers.map(u => u.userName).join(', ')} yazıyor...
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Message input */}
        {(activeChannel || activeDM) && (
          <div className="px-5 pb-4 pt-2 flex-shrink-0">
            <div className="flex items-end gap-2 bg-surface-card border border-surface-border rounded-xl px-3 py-2 focus-within:border-brand-500/50 transition-all">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-surface-elevated transition-all flex-shrink-0"
              >
                <Paperclip size={17} />
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`${activeTitle} kanalına mesaj gönder`}
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none max-h-32 py-1 leading-relaxed"
                style={{ minHeight: '24px' }}
                onInput={e => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="p-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-all flex-shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-[10px] text-gray-700 mt-1.5 px-1">
              Enter ile gönder &bull; Shift+Enter yeni satır
            </p>
          </div>
        )}
      </div>

      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreate={ch => setChannels(prev => [...prev, ch])}
        />
      )}
      {showNewDM && (
        <NewDMModal
          onClose={() => setShowNewDM(false)}
          currentUserId={user?._id}
          onSelect={selectedUser => {
            const dm = {
              userId: selectedUser._id,
              userName: selectedUser.name,
              department: selectedUser.department,
            }
            setDms(prev => {
              if (prev.find(d => d.userId === selectedUser._id)) return prev
              return [...prev, dm]
            })
            selectDM(dm)
          }}
        />
      )}
    </div>
  )
}
