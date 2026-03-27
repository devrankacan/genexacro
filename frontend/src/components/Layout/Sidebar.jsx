import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Mail,
  MessageSquare,
  Video,
  Calendar,
  FileText,
  Shield,
  LogOut,
  Dna,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'

const NAV_ITEMS = [
  { path: '/webmail', icon: Mail, label: 'E-Posta' },
  { path: '/chat', icon: MessageSquare, label: 'Sohbet' },
  { path: '/meeting', icon: Video, label: 'Toplantı' },
  { path: '/calendar', icon: Calendar, label: 'Takvim' },
  { path: '/notes', icon: FileText, label: 'Notlar' },
]

function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth()
  const { connected } = useSocket()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-surface-sidebar flex flex-col h-full border-r border-surface-border">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Dna size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Genexa CRO</h1>
            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">İletişim Merkezi</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-3">
          Menü
        </p>
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={17} />
            <span>{label}</span>
            {({ isActive }) => isActive && (
              <ChevronRight size={14} className="ml-auto opacity-50" />
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="border-t border-surface-border my-3" />
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-3">
              Yönetim
            </p>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Shield size={17} />
              <span>Yönetim Paneli</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* User section */}
      <div className="px-3 py-3 border-t border-surface-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-card transition-colors group">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xs font-semibold text-brand-300">
              {getInitials(user?.name)}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-sidebar ${
                connected ? 'bg-green-400' : 'bg-gray-500'
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate leading-tight">
              {user?.name || 'Kullanıcı'}
            </p>
            <p className="text-[10px] text-gray-500 truncate">
              {user?.department || user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Çıkış Yap"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
