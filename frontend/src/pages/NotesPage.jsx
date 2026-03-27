import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Plus,
  Trash2,
  Share2,
  Lock,
  Search,
  FileText,
  Clock,
  X,
  Save,
  ChevronRight,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import api from '../api/axios'
import toast from 'react-hot-toast'

function formatNoteDate(dateStr) {
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr)
    return format(d, 'd MMM yyyy', { locale: tr })
  } catch { return '' }
}

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-all ${
        active
          ? 'bg-brand-500/20 text-brand-300'
          : 'text-gray-500 hover:text-gray-200 hover:bg-surface-elevated'
      }`}
    >
      {children}
    </button>
  )
}

function EditorToolbar({ editor }) {
  if (!editor) return null

  const groups = [
    [
      { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), title: 'Kalın' },
      { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), title: 'İtalik' },
      { icon: UnderlineIcon, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), title: 'Altı Çizgili' },
      { icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike'), title: 'Üstü Çizgili' },
    ],
    [
      { icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), title: 'Başlık 1' },
      { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), title: 'Başlık 2' },
      { icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }), title: 'Başlık 3' },
    ],
    [
      { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), title: 'Madde İşaretli Liste' },
      { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), title: 'Numaralı Liste' },
      { icon: Code, action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock'), title: 'Kod Bloğu' },
    ],
    [
      { icon: AlignLeft, action: () => editor.chain().focus().setTextAlign('left').run(), active: editor.isActive({ textAlign: 'left' }), title: 'Sola Hizala' },
      { icon: AlignCenter, action: () => editor.chain().focus().setTextAlign('center').run(), active: editor.isActive({ textAlign: 'center' }), title: 'Ortala' },
      { icon: AlignRight, action: () => editor.chain().focus().setTextAlign('right').run(), active: editor.isActive({ textAlign: 'right' }), title: 'Sağa Hizala' },
    ],
    [
      { icon: Highlighter, action: () => editor.chain().focus().toggleHighlight().run(), active: editor.isActive('highlight'), title: 'Vurgula' },
    ],
  ]

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-surface-border px-3 py-2 bg-surface-sidebar/50">
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="w-px h-5 bg-surface-border mx-1" />}
          {group.map(({ icon: Icon, action, active, title }) => (
            <ToolbarButton key={title} onClick={action} active={active} title={title}>
              <Icon size={15} />
            </ToolbarButton>
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function NotesPage() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeNote, setActiveNote] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all, personal, shared
  const [saving, setSaving] = useState(false)
  const [savedRecently, setSavedRecently] = useState(false)
  const [mobileView, setMobileView] = useState('list') // 'list' | 'editor'
  const saveTimerRef = useRef(null)
  const saveStatusTimerRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!activeNote) return
      const content = editor.getHTML()
      setActiveNote(prev => prev ? { ...prev, content, dirty: true } : null)

      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        autoSave(content)
      }, 1000)
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-full',
      },
    },
  })

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/notes')
      setNotes(res.data.notes || res.data || [])
    } catch {
      toast.error('Notlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  useEffect(() => {
    if (editor && activeNote) {
      const current = editor.getHTML()
      if (current !== activeNote.content) {
        editor.commands.setContent(activeNote.content || '', false)
      }
    }
  }, [activeNote?._id])

  const autoSave = useCallback(async (content) => {
    if (!activeNote?._id) return
    setSaving(true)
    try {
      await api.put(`/api/notes/${activeNote._id}`, { content })
      setNotes(prev => prev.map(n => n._id === activeNote._id ? { ...n, content, updatedAt: new Date().toISOString() } : n))
      setSavedRecently(true)
      clearTimeout(saveStatusTimerRef.current)
      saveStatusTimerRef.current = setTimeout(() => setSavedRecently(false), 3000)
    } catch {}
    finally { setSaving(false) }
  }, [activeNote?._id])

  const createNote = async () => {
    try {
      const res = await api.post('/api/notes', {
        title: 'Yeni Not',
        content: '',
        shared: false,
      })
      const note = res.data.note || res.data
      setNotes(prev => [note, ...prev])
      selectNote(note)
      toast.success('Not oluşturuldu')
    } catch {
      toast.error('Not oluşturulamadı')
    }
  }

  const selectNote = (note) => {
    setActiveNote(note)
    editor?.commands.setContent(note.content || '', false)
    setMobileView('editor')
  }

  const deleteNote = async (noteId, e) => {
    e?.stopPropagation()
    if (!window.confirm('Notu silmek istediğinizden emin misiniz?')) return
    try {
      await api.delete(`/api/notes/${noteId}`)
      setNotes(prev => prev.filter(n => n._id !== noteId))
      if (activeNote?._id === noteId) {
        setActiveNote(null)
        editor?.commands.setContent('', false)
      }
      toast.success('Not silindi')
    } catch {
      toast.error('Not silinemedi')
    }
  }

  const toggleShared = async (noteId, currentShared, e) => {
    e?.stopPropagation()
    try {
      const res = await api.put(`/api/notes/${noteId}`, { shared: !currentShared })
      const updated = res.data.note || res.data
      setNotes(prev => prev.map(n => n._id === noteId ? { ...n, shared: updated.shared } : n))
      if (activeNote?._id === noteId) {
        setActiveNote(prev => prev ? { ...prev, shared: updated.shared } : null)
      }
      toast.success(updated.shared ? 'Not paylaşıma açıldı' : 'Not kişisel yapıldı')
    } catch {
      toast.error('İşlem başarısız')
    }
  }

  const updateTitle = async (title) => {
    if (!activeNote?._id || title === activeNote.title) return
    try {
      await api.put(`/api/notes/${activeNote._id}`, { title })
      setNotes(prev => prev.map(n => n._id === activeNote._id ? { ...n, title } : n))
    } catch {}
  }

  const filtered = notes.filter(note => {
    const matchesSearch = !search ||
      note.title?.toLowerCase().includes(search.toLowerCase()) ||
      (note.content || '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter =
      filter === 'all' ||
      (filter === 'shared' && note.shared) ||
      (filter === 'personal' && !note.shared)
    return matchesSearch && matchesFilter
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Notes list sidebar */}
      <div className={`
        flex-shrink-0 bg-surface-sidebar border-r border-surface-border flex-col
        ${mobileView === 'list' ? 'flex w-full' : 'hidden'}
        md:flex md:w-64
      `}>
        {/* Header */}
        <div className="px-3 py-3 border-b border-surface-border">
          <button onClick={createNote} className="btn-primary text-xs w-full justify-center mb-3 py-2">
            <Plus size={14} />
            Yeni Not
          </button>

          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Notlarda ara..."
              className="input-field text-xs py-1.5 pl-7"
            />
          </div>

          <div className="flex gap-1">
            {[
              { key: 'all', label: 'Tümü' },
              { key: 'personal', label: 'Kişisel' },
              { key: 'shared', label: 'Paylaşılan' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex-1 text-[11px] py-1 rounded-md transition-all ${
                  filter === key
                    ? 'bg-brand-500/20 text-brand-300 font-medium'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-surface-card'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <FileText size={28} className="text-gray-700" />
              <p className="text-xs text-gray-500">Not bulunamadı</p>
            </div>
          ) : (
            filtered.map(note => (
              <div
                key={note._id}
                onClick={() => selectNote(note)}
                className={`px-3 py-3 border-b border-surface-border/50 cursor-pointer group transition-all ${
                  activeNote?._id === note._id
                    ? 'bg-brand-500/10 border-l-2 border-l-brand-500'
                    : 'hover:bg-surface-card'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <p className="text-sm font-medium text-gray-200 truncate flex-1 leading-tight">
                    {note.title || 'İsimsiz Not'}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => toggleShared(note._id, note.shared, e)}
                      className={`p-0.5 rounded transition-colors ${note.shared ? 'text-green-400' : 'text-gray-600 hover:text-gray-400'}`}
                      title={note.shared ? 'Kişisel yap' : 'Paylaş'}
                    >
                      {note.shared ? <Share2 size={11} /> : <Lock size={11} />}
                    </button>
                    <button
                      onClick={e => deleteNote(note._id, e)}
                      className="p-0.5 rounded text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 truncate leading-relaxed">
                  {note.content ? note.content.replace(/<[^>]*>/g, '').slice(0, 60) || 'Boş not' : 'Boş not'}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-gray-600">
                    {formatNoteDate(note.updatedAt || note.createdAt)}
                  </span>
                  {note.shared && (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-500">
                      <Share2 size={9} />
                      Paylaşılan
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor area */}
      {activeNote ? (
        <div className={`
          flex-1 flex-col min-w-0 overflow-hidden
          ${mobileView === 'editor' ? 'flex' : 'hidden'}
          md:flex
        `}>
          {/* Note title + meta */}
          <div className="flex-shrink-0 px-3 md:px-6 py-3 border-b border-surface-border flex items-center justify-between gap-2">
            {/* Back button - mobile only */}
            <button
              onClick={() => setMobileView('list')}
              className="md:hidden p-2 text-gray-500 hover:text-gray-300 hover:bg-surface-card rounded-lg transition-all flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <input
              type="text"
              defaultValue={activeNote.title}
              onBlur={e => updateTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              className="bg-transparent text-base md:text-lg font-bold text-white focus:outline-none border-b border-transparent focus:border-surface-border pb-0.5 transition-all flex-1 min-w-0"
              placeholder="Not başlığı..."
            />
            <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
              {saving ? (
                <span className="hidden sm:flex text-xs text-gray-500 items-center gap-1">
                  <div className="w-3 h-3 border border-gray-500 border-t-gray-300 rounded-full animate-spin" />
                  Kaydediliyor...
                </span>
              ) : savedRecently ? (
                <span className="hidden sm:flex text-xs text-green-500 items-center gap-1">
                  <Save size={12} />
                  Kaydedildi
                </span>
              ) : (
                <span className="hidden sm:flex text-xs text-gray-600 items-center gap-1">
                  <Clock size={11} />
                  {formatNoteDate(activeNote.updatedAt || activeNote.createdAt)}
                </span>
              )}

              <button
                onClick={e => toggleShared(activeNote._id, activeNote.shared, e)}
                className={`flex items-center gap-1.5 text-xs px-2 md:px-3 py-1.5 rounded-lg border transition-all min-h-[44px] ${
                  activeNote.shared
                    ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                    : 'bg-surface-card border-surface-border text-gray-400 hover:text-gray-200'
                }`}
              >
                {activeNote.shared ? <Share2 size={13} /> : <Lock size={13} />}
                <span className="hidden sm:inline">{activeNote.shared ? 'Paylaşılan' : 'Kişisel'}</span>
              </button>

              <button
                onClick={e => deleteNote(activeNote._id, e)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <EditorToolbar editor={editor} />

          {/* Editor */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
            <EditorContent
              editor={editor}
              className="min-h-full text-gray-300 leading-relaxed"
            />
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileText size={52} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 mb-1">Bir not seçin veya oluşturun</p>
            <button onClick={createNote} className="btn-primary text-sm mx-auto mt-3">
              <Plus size={15} />
              Yeni Not Oluştur
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
