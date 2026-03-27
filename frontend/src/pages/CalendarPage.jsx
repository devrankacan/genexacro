import React, { useState, useEffect, useRef, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { X, Calendar, Clock, Users, Trash2, Edit2, Plus, AlertCircle, MapPin } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import api from '../api/axios'
import toast from 'react-hot-toast'

const EVENT_COLORS = [
  { label: 'Mavi', value: '#3b82f6' },
  { label: 'Yeşil', value: '#22c55e' },
  { label: 'Mor', value: '#a855f7' },
  { label: 'Turuncu', value: '#f97316' },
  { label: 'Kırmızı', value: '#ef4444' },
  { label: 'Sarı', value: '#eab308' },
  { label: 'Pembe', value: '#ec4899' },
  { label: 'Turkuaz', value: '#14b8a6' },
]

const DEFAULT_EVENT = {
  title: '',
  description: '',
  start: '',
  end: '',
  color: '#3b82f6',
  attendees: '',
  location: '',
  allDay: false,
}

function EventModal({ event, onClose, onSave, onDelete, isNew }) {
  const [form, setForm] = useState(event || DEFAULT_EVENT)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Etkinlik başlığı gerekli'); return }
    if (!form.start) { toast.error('Başlangıç tarihi gerekli'); return }
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Kaydetme başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Etkinliği silmek istediğinizden emin misiniz?')) return
    setDeleting(true)
    try {
      await onDelete(form._id)
      onClose()
    } catch {
      toast.error('Silme başarısız')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content w-full max-w-lg mx-3 md:mx-auto animate-fade-in md:max-h-[90vh] max-h-screen md:rounded-xl rounded-t-xl mt-auto md:mt-0 md:my-auto">
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: form.color }} />
            <h3 className="font-semibold text-white">{isNew ? 'Yeni Etkinlik' : 'Etkinlik Düzenle'}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={18} /></button>
        </div>

        <div className="p-4 md:p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Başlık *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Etkinlik başlığı"
              className="input-field"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Başlangıç *</label>
              <input
                type="datetime-local"
                value={form.start}
                onChange={e => set('start', e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Bitiş</label>
              <input
                type="datetime-local"
                value={form.end}
                onChange={e => set('end', e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={form.allDay}
              onChange={e => set('allDay', e.target.checked)}
              className="w-4 h-4 rounded border-surface-border accent-brand-500"
            />
            <label htmlFor="allDay" className="text-sm text-gray-400 cursor-pointer">
              Tüm gün
            </label>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Açıklama</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Etkinlik açıklaması..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              <MapPin size={12} className="inline mr-1" />
              Konum
            </label>
            <input
              type="text"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="Toplantı odası, online link..."
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              <Users size={12} className="inline mr-1" />
              Katılımcılar (virgülle ayırın)
            </label>
            <input
              type="text"
              value={form.attendees}
              onChange={e => set('attendees', e.target.value)}
              placeholder="ali@ornek.com, ayse@ornek.com"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium">Renk</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => set('color', value)}
                  title={label}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === value ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-card scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: value }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-t border-surface-border">
          <div>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger text-xs py-1.5 min-h-[44px]"
              >
                <Trash2 size={13} />
                {deleting ? 'Siliniyor...' : 'Sil'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-xs py-1.5 min-h-[44px]">İptal</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5 min-h-[44px]">
              {saving ? 'Kaydediliyor...' : isNew ? 'Oluştur' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const calendarRef = useRef(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalEvent, setModalEvent] = useState(null)
  const [modalIsNew, setModalIsNew] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/calendar/events')
      const evts = (res.data.events || res.data || []).map(e => ({
        id: e._id,
        title: e.title,
        start: e.start,
        end: e.end || undefined,
        allDay: e.allDay,
        backgroundColor: e.color || '#3b82f6',
        borderColor: e.color || '#3b82f6',
        extendedProps: {
          description: e.description,
          location: e.location,
          attendees: e.attendees,
          color: e.color,
          _id: e._id,
        },
      }))
      setEvents(evts)
    } catch {
      toast.error('Etkinlikler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleDateClick = (info) => {
    const dateStr = info.dateStr.length === 10
      ? `${info.dateStr}T09:00`
      : info.dateStr

    setModalEvent({
      ...DEFAULT_EVENT,
      start: dateStr,
      end: `${info.dateStr.slice(0, 10)}T10:00`,
    })
    setModalIsNew(true)
    setShowModal(true)
  }

  const handleEventClick = (info) => {
    const e = info.event
    const ep = e.extendedProps

    // Format datetime for input
    const formatForInput = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      return format(dt, "yyyy-MM-dd'T'HH:mm")
    }

    setModalEvent({
      _id: ep._id || e.id,
      title: e.title,
      start: formatForInput(e.start),
      end: formatForInput(e.end),
      allDay: e.allDay,
      description: ep.description || '',
      location: ep.location || '',
      attendees: Array.isArray(ep.attendees) ? ep.attendees.join(', ') : (ep.attendees || ''),
      color: ep.color || '#3b82f6',
    })
    setModalIsNew(false)
    setShowModal(true)
  }

  const handleSave = async (form) => {
    const payload = {
      ...form,
      attendees: form.attendees
        ? form.attendees.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    }
    if (modalIsNew) {
      const res = await api.post('/api/calendar/events', payload)
      toast.success('Etkinlik oluşturuldu')
    } else {
      await api.put(`/api/calendar/events/${form._id}`, payload)
      toast.success('Etkinlik güncellendi')
    }
    await fetchEvents()
  }

  const handleDelete = async (id) => {
    await api.delete(`/api/calendar/events/${id}`)
    toast.success('Etkinlik silindi')
    await fetchEvents()
  }

  return (
    <div className="flex flex-col h-full p-3 md:p-5">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Takvim</h2>
          <p className="hidden sm:block text-xs text-gray-500 mt-0.5">Ekip toplantılarını ve etkinliklerini yönetin</p>
        </div>
        <button
          onClick={() => {
            const now = new Date()
            const pad = n => String(n).padStart(2, '0')
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
            setModalEvent({
              ...DEFAULT_EVENT,
              start: `${dateStr}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
              end: `${dateStr}T${pad((now.getHours() + 1) % 24)}:${pad(now.getMinutes())}`,
            })
            setModalIsNew(true)
            setShowModal(true)
          }}
          className="btn-primary min-h-[44px]"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Etkinlik Ekle</span>
          <span className="sm:hidden">Ekle</span>
        </button>
      </div>

      <div className="flex-1 overflow-hidden card p-2 md:p-4 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card/50 rounded-xl z-10">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'timeGridWeek' : 'dayGridMonth'}
          locale="tr"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: isMobile ? 'timeGridWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{
            today: 'Bugün',
            month: 'Ay',
            week: 'Hafta',
            day: 'Gün',
          }}
          events={events}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          height="100%"
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={isMobile ? 2 : 3}
          weekends={true}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          eventDrop={async (info) => {
            const ep = info.event.extendedProps
            const id = ep._id || info.event.id
            try {
              await api.put(`/api/calendar/events/${id}`, {
                start: info.event.startStr,
                end: info.event.endStr || undefined,
              })
              toast.success('Etkinlik taşındı')
            } catch {
              info.revert()
              toast.error('Güncelleme başarısız')
            }
          }}
          eventResize={async (info) => {
            const ep = info.event.extendedProps
            const id = ep._id || info.event.id
            try {
              await api.put(`/api/calendar/events/${id}`, {
                start: info.event.startStr,
                end: info.event.endStr,
              })
              toast.success('Etkinlik güncellendi')
            } catch {
              info.revert()
              toast.error('Güncelleme başarısız')
            }
          }}
        />
      </div>

      {showModal && (
        <EventModal
          event={modalEvent}
          isNew={modalIsNew}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
