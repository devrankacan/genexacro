import React, { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link as LinkIcon,
  Baseline, ImageIcon,
} from 'lucide-react'
import { uploadFiles } from '../api/upload'

// Custom FontSize extension
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: attrs => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
      },
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize: size => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
    }
  },
})

// Resizable Image Node View
function ResizableImageView({ node, updateAttributes, selected }) {
  const { src, alt, width } = node.attrs
  const sizes = [
    { label: 'XS', value: '100px' },
    { label: 'S', value: '200px' },
    { label: 'M', value: '350px' },
    { label: 'L', value: '500px' },
    { label: 'Tam', value: '100%' },
  ]
  return (
    <NodeViewWrapper className="inline-block relative" style={{ maxWidth: '100%' }}>
      <img
        src={src}
        alt={alt || ''}
        style={{ width: width || 'auto', maxWidth: '100%', display: 'block' }}
        className={selected ? 'ring-2 ring-offset-1' : ''}
        style2={{ ringColor: 'var(--accent)' }}
      />
      {selected && (
        <div className="absolute -bottom-8 left-0 flex items-center gap-1 bg-surface-card border border-surface-border rounded-lg px-2 py-1 shadow-xl z-30">
          <span className="text-[10px] text-gray-500 mr-1">Boyut:</span>
          {sizes.map(s => (
            <button
              key={s.value}
              type="button"
              onMouseDown={e => { e.preventDefault(); updateAttributes({ width: s.value }) }}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${width === s.value ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-surface-elevated'}`}
              style={width === s.value ? { backgroundColor: 'var(--accent)' } : {}}
            >
              {s.label}
              <span className="text-gray-600 ml-0.5">({s.value})</span>
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  )
}

// Custom ResizableImage extension
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => el.style.width || el.getAttribute('width') || null,
        renderHTML: attrs => attrs.width ? { style: `width:${attrs.width};max-width:100%` } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

const FONT_SIZES = ['12px','13px','14px','15px','16px','18px','20px','24px','28px','32px','36px','48px']

const TEXT_COLORS = [
  '#e2e8f0','#f87171','#fb923c','#facc15','#4ade80',
  '#34d399','#38bdf8','#818cf8','#e879f9','#f472b6',
  '#ffffff','#1e293b',
]

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors
        ${active ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-elevated'}`}
      style={active ? { backgroundColor: 'var(--accent)' } : {}}
    >
      {children}
    </button>
  )
}

export default function MailEditor({ value, onChange, placeholder = 'Mesajınızı yazın...' }) {
  const imgInputRef = useRef(null)
  const isExternalUpdate = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      FontSize,
      Color,
      Link.configure({ openOnClick: false }),
      ResizableImage.configure({ inline: true, allowBase64: true }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      if (!isExternalUpdate.current) {
        onChange?.(editor.getHTML())
      }
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[200px] text-gray-200',
        'data-placeholder': placeholder,
      },
    },
  })

  useEffect(() => {
    if (!editor || value === undefined) return
    if (editor.getHTML() === value) return
    isExternalUpdate.current = true
    editor.commands.setContent(value || '', false)
    // Notify parent of canonical HTML after external set
    setTimeout(() => {
      onChange?.(editor.getHTML())
      isExternalUpdate.current = false
    }, 0)
  }, [value]) // eslint-disable-line

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL girin:', prev)
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const handleImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    try {
      const uploaded = await uploadFiles([file])
      const url = uploaded[0]?.url
      if (url) editor.chain().focus().setImage({ src: url }).run()
    } catch {
      // silently fail
    } finally {
      e.target.value = ''
    }
  }, [editor])

  if (!editor) return null

  const currentFontSize = editor.getAttributes('textStyle').fontSize || '14px'
  const currentColor = editor.getAttributes('textStyle').color || '#e2e8f0'

  return (
    <div className="border border-surface-border rounded-lg overflow-hidden bg-surface-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-surface-border bg-surface-elevated">
        <select
          value={currentFontSize}
          onChange={e => editor.chain().focus().setFontSize(e.target.value).run()}
          className="h-7 text-xs bg-surface-card border border-surface-border text-gray-300 rounded px-1 mr-1"
        >
          {FONT_SIZES.map(s => <option key={s} value={s} className="bg-surface-card">{s.replace('px', '')}pt</option>)}
        </select>

        <div className="w-px h-5 bg-surface-border mx-0.5" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Kalın">
          <Bold size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="İtalik">
          <Italic size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Altı çizili">
          <UnderlineIcon size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Üstü çizili">
          <Strikethrough size={13} />
        </ToolbarButton>

        <div className="w-px h-5 bg-surface-border mx-0.5" />

        {/* Text color */}
        <div className="relative group">
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-surface-elevated transition-colors relative"
            title="Yazı rengi"
          >
            <Baseline size={13} />
            <div className="absolute bottom-0.5 left-1 right-1 h-1 rounded-full" style={{ backgroundColor: currentColor }} />
          </button>
          <div className="absolute top-8 left-0 hidden group-hover:flex flex-wrap gap-1 p-2 bg-surface-card border border-surface-border rounded-lg shadow-xl z-20 w-36">
            {TEXT_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(c).run() }}
                className="w-5 h-5 rounded border border-surface-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <input
              type="color"
              defaultValue={currentColor}
              onInput={e => editor.chain().focus().setColor(e.target.value).run()}
              className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
              title="Özel renk"
            />
          </div>
        </div>

        <div className="w-px h-5 bg-surface-border mx-0.5" />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Sola hizala">
          <AlignLeft size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Ortala">
          <AlignCenter size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Sağa hizala">
          <AlignRight size={13} />
        </ToolbarButton>

        <div className="w-px h-5 bg-surface-border mx-0.5" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Madde listesi">
          <List size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numaralı liste">
          <ListOrdered size={13} />
        </ToolbarButton>

        <div className="w-px h-5 bg-surface-border mx-0.5" />

        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Bağlantı ekle">
          <LinkIcon size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => imgInputRef.current?.click()} active={false} title="Resim ekle">
          <ImageIcon size={13} />
        </ToolbarButton>
        <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </div>

      {/* Image size reference */}
      <div className="px-3 pt-1.5 pb-0 text-[10px] text-gray-600 border-b border-surface-border bg-surface-elevated flex items-center gap-2 flex-wrap">
        <span>Görsel boyut referansı:</span>
        <span className="text-gray-500">XS = 100px</span>
        <span className="text-gray-500">S = 200px</span>
        <span className="text-gray-500">M = 350px</span>
        <span className="text-gray-500">L = 500px</span>
        <span className="text-gray-500">Tam = %100 genişlik</span>
        <span className="text-gray-600 italic">(Görsele tıklayarak boyutu değiştirin)</span>
      </div>

      {/* Editor area */}
      <div className="px-3 py-2 min-h-[200px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
