import React, { useState, useEffect, useCallback } from 'react'
import {
  Inbox,
  Send,
  Trash2,
  Mail,
  MailOpen,
  Compose,
  RefreshCw,
  X,
  ChevronLeft,
  Star,
  Reply,
  Forward,
  Paperclip,
  Search,
  Plus,
  AlertCircle,
  Check,
  Clock,
} from 'lucide-react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { tr } from 'date-fns/locale'
import api from '../api/axios'
import toast from 'react-hot-toast'
import MailEditor from '../components/MailEditor'

const FOLDERS = [
  { key: 'inbox', label: 'Gelen Kutusu', icon: Inbox, color: 'text-brand-400' },
  { key: 'sent', label: 'Gönderilmiş', icon: Send, color: 'text-green-400' },
  { key: 'trash', label: 'Çöp Kutusu', icon: Trash2, color: 'text-red-400' },
]

function formatEmailDate(dateStr) {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr)
    if (isToday(date)) return format(date, 'HH:mm')
    if (isYesterday(date)) return 'Dün'
    return format(date, 'd MMM', { locale: tr })
  } catch {
    return ''
  }
}

function ComposeModal({ onClose, onSent }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api.get('/api/auth/signature').then(({ data }) => {
      const sig = data.signature || ''
      setBody(`<p><br></p><p>--</p>${sig}`)
    }).catch(() => {})
  }, [])

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) {
      toast.error('Alıcı ve konu alanları zorunludur.')
      return
    }
    setSending(true)
    try {
      await api.post('/api/mail/send', { to: to.trim(), subject: subject.trim(), body })
      toast.success('E-posta başarıyla gönderildi.')
      onSent?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gönderim başarısız.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-2xl w-full animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h3 className="text-base font-semibold text-white">Yeni E-posta</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Alıcı</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="alici@ornek.com"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Konu</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E-posta konusu"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Mesaj</label>
            <MailEditor value={body} onChange={setBody} />
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border bg-surface-sidebar/30">
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs py-1.5 px-3">
              <Paperclip size={14} />
              Dosya Ekle
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-xs py-1.5">
              İptal
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="btn-primary text-xs py-1.5"
            >
              {sending ? (
                <>
                  <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  Gönderiliyor...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Gönder
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WebmailPage() {
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [showCompose, setShowCompose] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  // Mobile: 'folders' | 'list' | 'detail'
  const [mobileView, setMobileView] = useState('folders')
  const PER_PAGE = 20

  const fetchEmails = useCallback(async () => {
    setLoading(true)
    setSelectedEmail(null)
    setMobileView('list')
    try {
      const res = await api.get('/api/mail/emails', {
        params: { folder: activeFolder, page, limit: PER_PAGE, search: searchQuery || undefined },
      })
      setEmails(res.data.emails || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      toast.error('E-postalar yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [activeFolder, page, searchQuery])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.post('/api/mail/fetch')
      toast.success('E-postalar senkronize edildi.')
      await fetchEmails()
    } catch (err) {
      toast.error('Senkronizasyon başarısız.')
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenEmail = async (email) => {
    setSelectedEmail(email)
    setMobileView('detail')
    if (!email.read) {
      try {
        await api.patch(`/api/mail/emails/${email._id}/read`)
        setEmails((prev) =>
          prev.map((e) => (e._id === email._id ? { ...e, read: true } : e))
        )
      } catch {}
    }
  }

  const handleDelete = async (emailId, e) => {
    e?.stopPropagation()
    try {
      await api.delete(`/api/mail/emails/${emailId}`)
      toast.success('E-posta silindi.')
      if (selectedEmail?._id === emailId) setSelectedEmail(null)
      await fetchEmails()
    } catch {
      toast.error('Silme işlemi başarısız.')
    }
  }

  const unreadCounts = {}
  // aggregate from emails only (inbox unread)
  emails.forEach((e) => {
    if (!e.read && e.folder === 'inbox') {
      unreadCounts.inbox = (unreadCounts.inbox || 0) + 1
    }
  })

  const filtered = emails.filter((e) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      e.subject?.toLowerCase().includes(q) ||
      e.from?.toLowerCase().includes(q) ||
      e.to?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Folder sidebar - shown on mobile only when mobileView === 'folders', always on md+ */}
      <div className={`
        flex-shrink-0 bg-surface-sidebar border-r border-surface-border flex-col py-4 px-3 gap-1
        ${mobileView === 'folders' ? 'flex w-full' : 'hidden'}
        md:flex md:w-48
      `}>
        <button
          onClick={() => setShowCompose(true)}
          className="btn-primary text-xs mb-3 justify-center min-h-[44px]"
        >
          <Plus size={14} />
          Yeni E-posta
        </button>

        {FOLDERS.map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => {
              setActiveFolder(key)
              setPage(1)
            }}
            className={`flex items-center gap-2.5 px-3 py-3 rounded-lg text-sm transition-all min-h-[44px] ${
              activeFolder === key
                ? 'bg-brand-500/15 text-brand-300 font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-surface-card'
            }`}
          >
            <Icon size={15} className={activeFolder === key ? 'text-brand-400' : color} />
            <span className="flex-1 text-left">{label}</span>
            {key === 'inbox' && unreadCounts.inbox > 0 && (
              <span className="badge-blue text-[10px] px-1.5 py-0.5">
                {unreadCounts.inbox}
              </span>
            )}
          </button>
        ))}

        <div className="mt-auto">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-surface-card transition-all w-full"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Senkronize...' : 'Senkronize Et'}
          </button>
        </div>
      </div>

      {/* Email list - shown on mobile only when mobileView === 'list', always on md+ */}
      <div
        className={`
          flex-col border-r border-surface-border
          ${mobileView === 'list' ? 'flex flex-1' : 'hidden'}
          md:flex
          ${selectedEmail ? 'md:w-72 md:flex-shrink-0' : 'md:flex-1'}
        `}
      >
        {/* Search + toolbar */}
        <div className="px-4 py-3 border-b border-surface-border bg-[#0f1117]">
          <div className="flex items-center gap-2">
            {/* Back to folders button - mobile only */}
            <button
              onClick={() => setMobileView('folders')}
              className="md:hidden p-2 text-gray-500 hover:text-gray-300 hover:bg-surface-card rounded-lg transition-all flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="E-postalarda ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field text-xs py-1.5 pl-8"
              />
            </div>
            <button
              onClick={fetchEmails}
              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-surface-card rounded transition-all"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-gray-600">
              {total} e-posta
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 px-1"
              >
                ‹
              </button>
              <span className="text-[11px] text-gray-600">
                {page} / {Math.max(1, Math.ceil(total / PER_PAGE))}
              </span>
              <button
                disabled={page >= Math.ceil(total / PER_PAGE)}
                onClick={() => setPage(p => p + 1)}
                className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 px-1"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* Email list items */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Mail size={32} className="text-gray-700" />
              <p className="text-sm text-gray-500">E-posta bulunamadı</p>
            </div>
          ) : (
            filtered.map((email) => (
              <div
                key={email._id}
                onClick={() => handleOpenEmail(email)}
                className={`px-4 py-3 border-b border-surface-border/50 cursor-pointer transition-all group ${
                  selectedEmail?._id === email._id
                    ? 'bg-brand-500/10 border-l-2 border-l-brand-500'
                    : 'hover:bg-surface-card'
                } ${!email.read ? 'bg-surface-sidebar/30' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {!email.read && (
                      <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1" />
                    )}
                    <p
                      className={`text-sm truncate ${
                        !email.read ? 'text-white font-semibold' : 'text-gray-300'
                      }`}
                    >
                      {activeFolder === 'sent' ? email.to : (email.fromName || email.from)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-gray-600">
                      {formatEmailDate(email.date || email.createdAt)}
                    </span>
                    <button
                      onClick={(e) => handleDelete(email._id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p
                  className={`text-xs mt-0.5 truncate ${
                    !email.read ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  {email.subject || '(Konu yok)'}
                </p>
                <p className="text-[11px] text-gray-600 truncate mt-0.5">
                  {email.textBody?.slice(0, 80) || email.bodyText?.slice(0, 80) || ''}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Email viewer - shown on mobile only when mobileView === 'detail', always on md+ */}
      {selectedEmail ? (
        <div className={`
          flex-1 flex-col min-w-0 overflow-hidden
          ${mobileView === 'detail' ? 'flex' : 'hidden'}
          md:flex
        `}>
          <div className="px-4 md:px-6 py-4 border-b border-surface-border flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => setMobileView('list')}
                className="p-2 text-gray-500 hover:text-gray-300 hover:bg-surface-card rounded-lg transition-all md:hidden flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setSelectedEmail(null)}
                className="hidden md:flex p-1.5 text-gray-500 hover:text-gray-300 hover:bg-surface-card rounded-lg transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <h3 className="text-base font-semibold text-white truncate">
                {selectedEmail.subject || '(Konu yok)'}
              </h3>
            </div>
            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              <button className="btn-secondary text-xs py-1.5 px-2 md:px-3">
                <Reply size={13} />
                <span className="hidden sm:inline">Yanıtla</span>
              </button>
              <button className="btn-secondary text-xs py-1.5 px-2 md:px-3">
                <Forward size={13} />
                <span className="hidden sm:inline">İlet</span>
              </button>
              <button
                onClick={() => {
                  handleDelete(selectedEmail._id)
                }}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
            {/* Email meta */}
            <div className="bg-surface-card rounded-xl border border-surface-border p-4 md:p-5 mb-5">
              <div className="grid grid-cols-[70px_1fr] md:grid-cols-[80px_1fr] gap-y-2 text-sm">
                <span className="text-gray-500 font-medium">Gönderen:</span>
                <span className="text-gray-200 break-all">{selectedEmail.fromName || selectedEmail.from}</span>
                <span className="text-gray-500 font-medium">Alıcı:</span>
                <span className="text-gray-200 break-all">{selectedEmail.to}</span>
                <span className="text-gray-500 font-medium">Tarih:</span>
                <span className="text-gray-400 flex items-center gap-1.5">
                  <Clock size={12} />
                  {selectedEmail.date
                    ? format(
                        typeof selectedEmail.date === 'string'
                          ? parseISO(selectedEmail.date)
                          : new Date(selectedEmail.date),
                        "d MMMM yyyy, HH:mm",
                        { locale: tr }
                      )
                    : ''}
                </span>
              </div>
            </div>

            {/* Email body */}
            <div className="bg-surface-card rounded-xl border border-surface-border p-4 md:p-5">
              {selectedEmail.htmlBody ? (
                <div
                  className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.htmlBody }}
                />
              ) : (
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {selectedEmail.textBody || selectedEmail.bodyText || selectedEmail.body || '(Boş içerik)'}
                </pre>
              )}
            </div>

            {/* Attachments */}
            {selectedEmail.attachments?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2 font-medium">Ekler ({selectedEmail.attachments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url || '#'}
                      className="flex items-center gap-2 px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-xs text-gray-300 hover:text-white hover:border-brand-500/50 transition-all"
                    >
                      <Paperclip size={12} className="text-gray-500" />
                      {att.filename || 'ek'}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <MailOpen size={48} className="mx-auto text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">Okumak için bir e-posta seçin</p>
          </div>
        </div>
      )}

      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onSent={fetchEmails} />
      )}
    </div>
  )
}
