import React, { useState } from 'react'
import Sidebar from './Sidebar'
import { Bell, Search, Settings } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES = {
  '/webmail': 'E-Posta',
  '/chat': 'Sohbet',
  '/meeting': 'Toplantı',
  '/calendar': 'Takvim',
  '/notes': 'Notlar',
  '/admin': 'Yönetim Paneli',
}

export default function Layout({ children }) {
  const { user } = useAuth()
  const { connected } = useSocket()
  const location = useLocation()
  const [notifOpen, setNotifOpen] = useState(false)

  const pageTitle = PAGE_TITLES[location.pathname] || 'Genexa CRO'

  return (
    <div className="flex h-full w-full bg-[#0f1117] overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-[#0f1117] border-b border-surface-border">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">{pageTitle}</h2>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-card border border-surface-border">
              <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
              />
              <span className="text-[10px] text-gray-500">
                {connected ? 'Bağlı' : 'Bağlantı kesildi'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden md:flex items-center">
              <Search size={14} className="absolute left-3 text-gray-500" />
              <input
                type="text"
                placeholder="Ara..."
                className="bg-surface-card border border-surface-border text-gray-300 text-sm rounded-lg pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:w-64 transition-all placeholder-gray-600"
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-surface-card border border-surface-border text-gray-400 hover:text-gray-200 hover:bg-surface-elevated transition-all"
              >
                <Bell size={16} />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-500" />
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-72 bg-surface-card border border-surface-border rounded-xl shadow-2xl z-50 animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                    <p className="text-sm font-semibold text-white">Bildirimler</p>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      Tümünü oku
                    </button>
                  </div>
                  <div className="py-8 text-center">
                    <Bell size={28} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-sm text-gray-500">Yeni bildirim yok</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-1 pl-3 border-l border-surface-border">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-gray-300 leading-tight">
                  {user?.name?.split(' ')[0] || 'Kullanıcı'}
                </p>
                <p className="text-[10px] text-gray-600">
                  {user?.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
