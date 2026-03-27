import React, { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Activity,
  Mail,
  MessageSquare,
  Shield,
  Trash2,
  Edit2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Clock,
  Globe,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertTriangle,
  BarChart2,
  Eye,
  Server,
  Lock,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import api from '../api/axios'
import toast from 'react-hot-toast'

const TABS = [
  { key: 'stats', label: 'Genel Bakış', icon: BarChart2 },
  { key: 'users', label: 'Kullanıcılar', icon: Users },
  { key: 'logs', label: 'Denetim Günlüğü', icon: Activity },
  { key: 'emails', label: 'E-posta Trafiği', icon: Mail },
  { key: 'mailsettings', label: 'Mail Ayarları', icon: Server },
]

const ROLES = ['user', 'admin', 'moderator']

const ROLE_LABELS = { user: 'Kullanıcı', admin: 'Yönetici', moderator: 'Moderatör' }

function formatDate(dateStr) {
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr)
    return format(d, 'd MMM yyyy HH:mm', { locale: tr })
  } catch { return dateStr || '' }
}

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white mb-0.5">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

function EditUserModal({ user, onClose, onSave }) {
  const [role, setRole] = useState(user.role || 'user')
  const [department, setDepartment] = useState(user.department || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(user._id, { role, department })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="font-semibold text-white">Kullanıcı Düzenle</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Kullanıcı</p>
            <p className="text-sm font-medium text-white">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Rol</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="input-field"
            >
              {ROLES.map(r => (
                <option key={r} value={r} className="bg-surface-card">{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Departman</label>
            <input
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="Departman adı"
              className="input-field"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary text-xs py-1.5">İptal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5">
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Pagination({ page, total, perPage, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
      <span className="text-xs text-gray-500">
        {Math.min((page - 1) * perPage + 1, total)} - {Math.min(page * perPage, total)} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-surface-card disabled:opacity-30 transition-all"
        >
          <ChevronLeft size={15} />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let p
          if (totalPages <= 5) p = i + 1
          else if (page <= 3) p = i + 1
          else if (page >= totalPages - 2) p = totalPages - 4 + i
          else p = page - 2 + i
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-7 h-7 rounded text-xs transition-all ${
                p === page
                  ? 'bg-brand-500 text-white font-semibold'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-surface-card'
              }`}
            >
              {p}
            </button>
          )
        })}
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-surface-card disabled:opacity-30 transition-all"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

// Stats tab
function StatsTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/stats').then(res => {
      setStats(res.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-3 md:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard icon={Users} label="Toplam Kullanıcı" value={stats?.totalUsers ?? '—'} color="bg-brand-500" sub="Kayıtlı kullanıcılar" />
        <StatCard icon={MessageSquare} label="Bugünkü Mesajlar" value={stats?.messagesToday ?? '—'} color="bg-purple-500" sub="Tüm kanallarda" />
        <StatCard icon={Mail} label="Bugünkü E-postalar" value={stats?.emailsToday ?? '—'} color="bg-green-500" sub="Gelen + giden" />
        <StatCard icon={Activity} label="Aktif Oturumlar" value={stats?.activeSessions ?? '—'} color="bg-orange-500" sub="Şu an çevrimiçi" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Sistem Durumu</h3>
          <div className="space-y-3">
            {[
              { label: 'API Sunucusu', status: 'Çalışıyor', ok: true },
              { label: 'Veritabanı', status: 'Bağlı', ok: true },
              { label: 'WebSocket', status: 'Aktif', ok: true },
              { label: 'IMAP/SMTP', status: stats?.mailConnected ? 'Bağlı' : 'Bağlı değil', ok: stats?.mailConnected },
            ].map(({ label, status, ok }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-surface-border/50 last:border-0">
                <span className="text-sm text-gray-400">{label}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className={`text-xs ${ok ? 'text-green-400' : 'text-red-400'}`}>{status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Son Aktiviteler</h3>
          <div className="space-y-2">
            {(stats?.recentActivity || []).length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Aktivite bulunamadı</p>
            ) : (
              (stats?.recentActivity || []).slice(0, 6).map((act, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-surface-border/50 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0">
                    <Activity size={13} className="text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">{act.action || act.description}</p>
                    <p className="text-[10px] text-gray-600">{act.user?.name || act.userName}</p>
                  </div>
                  <span className="text-[10px] text-gray-600 flex-shrink-0">{formatDate(act.timestamp || act.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Users tab
function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editUser, setEditUser] = useState(null)
  const PER_PAGE = 20

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/admin/users', {
        params: { page, limit: PER_PAGE, search: search || undefined },
      })
      setUsers(res.data.users || res.data || [])
      setTotal(res.data.total || (res.data.users || res.data || []).length)
    } catch {
      toast.error('Kullanıcılar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleEditSave = async (userId, data) => {
    try {
      await api.put(`/api/admin/users/${userId}`, data)
      toast.success('Kullanıcı güncellendi')
      await fetchUsers()
    } catch {
      toast.error('Güncelleme başarısız')
      throw new Error()
    }
  }

  const handleDelete = async (userId, name) => {
    if (!window.confirm(`${name} kullanıcısını silmek istediğinizden emin misiniz?`)) return
    try {
      await api.delete(`/api/admin/users/${userId}`)
      toast.success('Kullanıcı silindi')
      await fetchUsers()
    } catch {
      toast.error('Silme başarısız')
    }
  }

  const roleColor = (role) => {
    if (role === 'admin') return 'badge-red'
    if (role === 'moderator') return 'badge-yellow'
    return 'badge-blue'
  }

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 md:flex-initial">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Kullanıcı ara..."
            className="input-field pl-8 w-full md:w-64"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">{total} kullanıcı</span>
          <button onClick={fetchUsers} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-surface-card rounded transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-sidebar/50">
                <th className="table-header">Ad Soyad</th>
                <th className="table-header">E-posta</th>
                <th className="table-header">Departman</th>
                <th className="table-header">Rol</th>
                <th className="table-header">Kayıt Tarihi</th>
                <th className="table-header text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center py-12">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center py-12 text-gray-500">
                    Kullanıcı bulunamadı
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u._id} className="hover:bg-surface-card/30 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xs font-semibold text-brand-300 flex-shrink-0">
                          {(u.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="font-medium text-gray-200">{u.name}</span>
                      </div>
                    </td>
                    <td className="table-cell text-gray-400">{u.email}</td>
                    <td className="table-cell text-gray-400">{u.department || '—'}</td>
                    <td className="table-cell">
                      <span className={`badge ${roleColor(u.role)}`}>
                        {ROLE_LABELS[u.role] || u.role || 'Kullanıcı'}
                      </span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 rounded transition-all"
                          title="Düzenle"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(u._id, u.name)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                          title="Sil"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} perPage={PER_PAGE} onPage={setPage} />
      </div>

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}

// Audit logs tab
function LogsTab() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 20

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/admin/audit-logs', {
        params: {
          page,
          limit: PER_PAGE,
          search: search || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      })
      setLogs(res.data.logs || res.data || [])
      setTotal(res.data.total || (res.data.logs || res.data || []).length)
    } catch {
      toast.error('Günlükler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [page, search, dateFrom, dateTo])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const actionColor = (action) => {
    if (!action) return 'text-gray-400'
    const a = action.toLowerCase()
    if (a.includes('login')) return 'text-green-400'
    if (a.includes('logout')) return 'text-yellow-400'
    if (a.includes('delete') || a.includes('sil')) return 'text-red-400'
    if (a.includes('create') || a.includes('oluştur')) return 'text-brand-400'
    return 'text-gray-300'
  }

  return (
    <div className="p-3 md:p-6">
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4">
        <div className="relative w-full sm:w-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Kullanıcı veya işlem ara..."
            className="input-field pl-8 w-full sm:w-56"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="input-field text-xs py-2 flex-1 sm:w-36"
          />
          <span className="text-gray-500 text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="input-field text-xs py-2 flex-1 sm:w-36"
          />
        </div>
        <button
          onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setPage(1) }}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          <X size={13} />
          Temizle
        </button>
        <span className="text-xs text-gray-500 sm:ml-auto">{total} kayıt</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-sidebar/50">
                <th className="table-header">Tarih/Saat</th>
                <th className="table-header">Kullanıcı</th>
                <th className="table-header">İşlem</th>
                <th className="table-header">Detay</th>
                <th className="table-header">IP Adresi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center py-12">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center py-12 text-gray-500">
                    Kayıt bulunamadı
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={log._id || i} className="hover:bg-surface-card/30 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                        <Clock size={11} />
                        {formatDate(log.timestamp || log.createdAt)}
                      </div>
                    </td>
                    <td className="table-cell">
                      <p className="text-sm text-gray-200 font-medium">
                        {log.user?.name || log.userName || '—'}
                      </p>
                      <p className="text-xs text-gray-600">{log.user?.email || ''}</p>
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium ${actionColor(log.action)}`}>
                        {log.action || '—'}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">
                      {log.details || log.description || '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Globe size={11} />
                        {log.ip || log.ipAddress || '—'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} perPage={PER_PAGE} onPage={setPage} />
      </div>
    </div>
  )
}

// Email traffic tab
function EmailTrafficTab() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState('') // '', 'IN', 'OUT'
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 20

  const fetchEmails = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/admin/email-traffic', {
        params: {
          page,
          limit: PER_PAGE,
          search: search || undefined,
          direction: direction || undefined,
        },
      })
      setEmails(res.data.emails || res.data || [])
      setTotal(res.data.total || (res.data.emails || res.data || []).length)
    } catch {
      toast.error('E-posta trafiği yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [page, search, direction])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  return (
    <div className="p-3 md:p-6">
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4">
        <div className="relative w-full sm:w-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Gönderen, alıcı veya konu ara..."
            className="input-field pl-8 w-full sm:w-64"
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: '', label: 'Tümü' },
            { key: 'IN', label: 'Gelen' },
            { key: 'OUT', label: 'Giden' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setDirection(key); setPage(1) }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                direction === key
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-gray-400 hover:text-gray-200 bg-surface-card border border-surface-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">{total} e-posta</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-sidebar/50">
                <th className="table-header">Yön</th>
                <th className="table-header">Gönderen</th>
                <th className="table-header">Alıcı</th>
                <th className="table-header">Konu</th>
                <th className="table-header">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center py-12">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : emails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center py-12 text-gray-500">
                    E-posta bulunamadı
                  </td>
                </tr>
              ) : (
                emails.map((email, i) => (
                  <tr key={email._id || i} className="hover:bg-surface-card/30 transition-colors">
                    <td className="table-cell">
                      {email.direction === 'IN' || email.folder === 'inbox' ? (
                        <div className="flex items-center gap-1 text-green-400">
                          <ArrowDown size={13} />
                          <span className="text-xs font-medium">Gelen</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-brand-400">
                          <ArrowUp size={13} />
                          <span className="text-xs font-medium">Giden</span>
                        </div>
                      )}
                    </td>
                    <td className="table-cell text-xs">
                      <p className="text-gray-200">{email.fromName || email.from || '—'}</p>
                      {email.fromName && <p className="text-gray-600 text-[10px]">{email.from}</p>}
                    </td>
                    <td className="table-cell text-xs text-gray-400">{email.to || '—'}</td>
                    <td className="table-cell text-xs text-gray-300 max-w-[200px] truncate">
                      {email.subject || '(Konu yok)'}
                    </td>
                    <td className="table-cell text-xs text-gray-500">
                      {formatDate(email.date || email.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} perPage={PER_PAGE} onPage={setPage} />
      </div>
    </div>
  )
}

// ─── Mail Settings Tab ──────────────────────────────────────────────────────
function MailSettingsTab() {
  const [form, setForm] = useState({
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_secure: 'false',
    imap_host: '', imap_port: '993', imap_user: '', imap_pass: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [showImapPass, setShowImapPass] = useState(false)

  useEffect(() => {
    api.get('/api/settings/mail')
      .then(({ data }) => setForm(prev => ({ ...prev, ...data, smtp_pass: '', imap_pass: '' })))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/api/settings/mail', form)
      toast.success('Mail ayarları kaydedildi.')
    } catch {
      toast.error('Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="p-3 md:p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white mb-0.5">Mail Sunucu Ayarları</h2>
        <p className="text-xs text-gray-400">Gönderme (SMTP) ve alma (IMAP) sunucu bilgilerini girin.</p>
      </div>

      {/* SMTP */}
      <div className="card p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-surface-border">
          <ArrowUp size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-white">SMTP — Giden Posta</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Sunucu Adresi</label>
            <input name="smtp_host" value={form.smtp_host} onChange={handleChange} className="input-field" placeholder="mail.genexa.com.tr" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Port</label>
            <input name="smtp_port" value={form.smtp_port} onChange={handleChange} className="input-field" placeholder="587" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Kullanıcı Adı / E-posta</label>
            <input name="smtp_user" value={form.smtp_user} onChange={handleChange} className="input-field" placeholder="info@genexa.com.tr" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Şifre</label>
            <div className="relative">
              <input name="smtp_pass" type={showSmtpPass ? 'text' : 'password'} value={form.smtp_pass} onChange={handleChange} className="input-field pr-10" placeholder={form.smtp_pass_set ? '••••••••' : 'Şifre girin'} />
              <button type="button" onClick={() => setShowSmtpPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <Eye size={14} />
              </button>
            </div>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">Güvenlik</label>
            <select name="smtp_secure" value={form.smtp_secure} onChange={handleChange} className="input-field w-full sm:max-w-xs">
              <option value="false" className="bg-surface-card">STARTTLS (Port 587)</option>
              <option value="true" className="bg-surface-card">SSL/TLS (Port 465)</option>
            </select>
          </div>
        </div>
      </div>

      {/* IMAP */}
      <div className="card p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-surface-border">
          <ArrowDown size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-white">IMAP — Gelen Posta</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Sunucu Adresi</label>
            <input name="imap_host" value={form.imap_host} onChange={handleChange} className="input-field" placeholder="mail.genexa.com.tr" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Port</label>
            <input name="imap_port" value={form.imap_port} onChange={handleChange} className="input-field" placeholder="993" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Kullanıcı Adı / E-posta</label>
            <input name="imap_user" value={form.imap_user} onChange={handleChange} className="input-field" placeholder="info@genexa.com.tr" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Şifre</label>
            <div className="relative">
              <input name="imap_pass" type={showImapPass ? 'text' : 'password'} value={form.imap_pass} onChange={handleChange} className="input-field pr-10" placeholder={form.imap_pass_set ? '••••••••' : 'Şifre girin'} />
              <button type="button" onClick={() => setShowImapPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <Eye size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Kaydediliyor...</> : <><Check size={14} /> Kaydet</>}
        </button>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Lock size={12} />
          Şifreler şifreli şekilde saklanır
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('stats')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab navigation - scrollable on mobile */}
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-sidebar/30">
        <div className="flex items-center px-3 md:px-6 gap-1 pt-3 overflow-x-auto scrollbar-hide">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium rounded-t-lg transition-all border-b-2 -mb-px whitespace-nowrap flex-shrink-0 min-h-[44px] ${
                activeTab === key
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-surface-card'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'emails' && <EmailTrafficTab />}
        {activeTab === 'mailsettings' && <MailSettingsTab />}
      </div>
    </div>
  )
}
