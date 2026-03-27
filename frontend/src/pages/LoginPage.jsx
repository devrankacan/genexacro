import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Eye, EyeOff, Dna, Lock, Mail, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const { accent, logoUrl, companyName, mode, toggleMode } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('E-posta ve şifre alanları boş bırakılamaz.')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
      toast.success('Giriş başarılı! Hoş geldiniz.')
      navigate('/chat', { replace: true })
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Giriş başarısız. E-posta veya şifrenizi kontrol edin.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Background glow decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: accent }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: accent }}
        />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(to right, ${accent} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Dark/light toggle — top right */}
      <button
        onClick={toggleMode}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg border border-surface-border bg-surface-card text-gray-400 hover:text-gray-200 transition-all z-10"
        title={mode === 'dark' ? 'Gündüz moduna geç' : 'Gece moduna geç'}
      >
        {mode === 'dark' ? '☀️' : '🌙'}
      </button>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Card */}
        <div
          className="border border-surface-border rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          {/* Top accent line */}
          <div className="h-0.5" style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }} />

          <div className="px-8 py-8">
            {/* Logo & Header */}
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 border overflow-hidden"
                style={{
                  backgroundColor: `rgba(${parseInt(accent.slice(1,3),16)},${parseInt(accent.slice(3,5),16)},${parseInt(accent.slice(5,7),16)},0.12)`,
                  borderColor: `rgba(${parseInt(accent.slice(1,3),16)},${parseInt(accent.slice(3,5),16)},${parseInt(accent.slice(5,7),16)},0.25)`,
                }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Dna size={32} style={{ color: accent }} />
                )}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{companyName || 'Genexa CRO'}</h1>
              <p className="text-sm text-gray-400 mt-1">Kurumsal İletişim Merkezi</p>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg animate-fade-in">
                <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  E-posta Adresi
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ad.soyad@genexacro.com"
                    className="input-field pl-9"
                    autoComplete="email"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Şifre
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-9 pr-10"
                    autoComplete="current-password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full disabled:opacity-60 disabled:cursor-not-allowed font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mt-2"
                style={{ backgroundColor: accent, color: 'var(--accent-text)' }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Giriş yapılıyor...</span>
                  </>
                ) : (
                  <span>Giriş Yap</span>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-surface-elevated border-t border-surface-border">
            <p className="text-center text-xs text-gray-500">
              Hesabınız yoksa sistem yöneticinize başvurun.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          &copy; {new Date().getFullYear()} {companyName || 'Genexa CRO'} &mdash; Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  )
}
