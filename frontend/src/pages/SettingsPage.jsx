import React, { useState, useRef, useEffect } from 'react'
import { Palette, Upload, Building2, Check, RefreshCw, Image, Trash2, PenLine } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import api from '../api/axios'
import toast from 'react-hot-toast'
import MailEditor from '../components/MailEditor'

const PRESET_COLORS = [
  { label: 'Mavi', value: '#3b82f6' },
  { label: 'İndigo', value: '#6366f1' },
  { label: 'Mor', value: '#8b5cf6' },
  { label: 'Pembe', value: '#ec4899' },
  { label: 'Kırmızı', value: '#ef4444' },
  { label: 'Turuncu', value: '#f97316' },
  { label: 'Sarı', value: '#eab308' },
  { label: 'Yeşil', value: '#22c55e' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Gri', value: '#6b7280' },
  { label: 'Slate', value: '#64748b' },
]

export default function SettingsPage() {
  const { accent, logoUrl, companyName, updateTheme } = useTheme()

  const [color, setColor] = useState(accent)
  const [logo, setLogo] = useState(logoUrl)
  const [company, setCompany] = useState(companyName || 'Genexa CRO')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const [signature, setSignature] = useState('')
  const [savingSignature, setSavingSignature] = useState(false)

  useEffect(() => {
    api.get('/api/auth/signature').then(({ data }) => setSignature(data.signature || '')).catch(() => {})
  }, [])

  const handleSaveSignature = async () => {
    setSavingSignature(true)
    try {
      await api.put('/api/auth/signature', { signature })
      toast.success('İmza kaydedildi.')
    } catch {
      toast.error('İmza kaydedilemedi.')
    } finally {
      setSavingSignature(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateTheme(color, logo, company)
      toast.success('Tema ayarları kaydedildi.')
    } catch {
      toast.error('Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen bir resim dosyası seçin.')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('files', file)
      const { data } = await api.post('/api/files/upload', form, {
        headers: { 'Content-Type': undefined },
      })
      const url = data.files?.[0]?.url || ''
      setLogo(url)
      toast.success('Logo yüklendi.')
    } catch {
      toast.error('Logo yüklenemedi.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeLogo = () => setLogo('')

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Sistem Ayarları</h1>
          <p className="text-sm text-gray-400 mt-1">Logo, şirket adı ve tema rengini özelleştirin.</p>
        </div>

        {/* Company Info */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Şirket Bilgileri</h2>
          </div>

          {/* Logo upload */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Şirket Logosu</label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-xl border border-surface-border bg-surface-elevated flex items-center justify-center overflow-hidden flex-shrink-0">
                {logo ? (
                  <img src={logo} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Image size={24} className="text-gray-600" />
                )}
              </div>
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary text-sm py-1.5 px-3 min-h-[44px] w-full sm:w-auto"
                >
                  {uploading ? (
                    <><RefreshCw size={14} className="animate-spin" /> Yükleniyor...</>
                  ) : (
                    <><Upload size={14} /> Logo Yükle</>
                  )}
                </button>
                {logo && (
                  <button onClick={removeLogo} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 min-h-[44px]">
                    <Trash2 size={12} /> Logoyu kaldır
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <p className="text-[10px] text-gray-600">PNG, SVG, JPG • Maks. 2 MB</p>
              </div>
            </div>
          </div>

          {/* Company name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Şirket / Platform Adı</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="input-field w-full"
              placeholder="Genexa CRO"
            />
          </div>
        </div>

        {/* Theme Color */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Palette size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Tema Rengi</h2>
          </div>

          {/* Preset grid */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Hazır Renkler</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(({ label, value }) => (
                <button
                  key={value}
                  title={label}
                  onClick={() => setColor(value)}
                  className="relative w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: value,
                    borderColor: color === value ? '#ffffff' : 'transparent',
                    boxShadow: color === value ? `0 0 0 2px ${value}` : 'none',
                  }}
                >
                  {color === value && (
                    <Check size={14} className="absolute inset-0 m-auto" style={{ color: '#fff' }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom color */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Özel Renk</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-11 h-11 rounded-lg border border-surface-border cursor-pointer bg-transparent p-0.5 flex-shrink-0"
              />
              <input
                type="text"
                value={color}
                onChange={e => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor(v)
                }}
                className="input-field w-32 font-mono text-sm"
                placeholder="#3b82f6"
              />
              <div
                className="flex-1 min-w-[80px] h-11 rounded-lg border border-surface-border flex items-center justify-center text-sm font-medium transition-all"
                style={{ backgroundColor: color, color: 'var(--accent-text)' }}
              >
                Önizleme
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-surface-border p-4 bg-surface-elevated">
            <p className="text-xs text-gray-500 mb-3">Canlı önizleme</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: color, color: 'var(--accent-text)' }}
              >
                Birincil Buton
              </button>
              <span
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.2)`, color }}
              >
                Rozet
              </span>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},0.2)` }}>
                <Palette size={14} style={{ color }} />
                <span className="text-sm" style={{ color }}>Aktif Menü</span>
              </div>
            </div>
          </div>
        </div>

        {/* Email Signature */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <PenLine size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">E-posta İmzası</h2>
          </div>
          <p className="text-xs text-gray-500">Gönderdiğiniz e-postalara otomatik eklenecek imzanız.</p>
          <MailEditor value={signature} onChange={setSignature} placeholder="İmzanızı buraya yazın..." />
          <button onClick={handleSaveSignature} disabled={savingSignature} className="btn-secondary text-sm">
            {savingSignature ? <><RefreshCw size={13} className="animate-spin" /> Kaydediliyor...</> : <><Check size={13} /> İmzayı Kaydet</>}
          </button>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full sm:w-auto min-h-[44px]">
            {saving ? <><RefreshCw size={15} className="animate-spin" /> Kaydediliyor...</> : <><Check size={15} /> Kaydet</>}
          </button>
        </div>

      </div>
    </div>
  )
}
