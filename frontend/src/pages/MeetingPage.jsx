import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Plus,
  Copy,
  Check,
  X,
  ExternalLink,
  Wifi,
  WifiOff,
  Clock,
  Hash,
} from 'lucide-react'
import SimplePeer from 'simple-peer'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import toast from 'react-hot-toast'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name) {
  const colors = ['bg-brand-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash += name.charCodeAt(i)
  return colors[hash % colors.length]
}

function RoomCard({ room, onJoin }) {
  const [copied, setCopied] = useState(false)

  const copyCode = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="card p-5 hover:border-brand-500/40 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white text-sm">{room.name}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Hash size={11} className="text-gray-500" />
            <span className="text-[11px] text-gray-500 font-mono">{room.code}</span>
            <button onClick={copyCode} className="text-gray-600 hover:text-gray-400 transition-colors ml-0.5">
              {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Users size={13} />
          <span>{room.participantCount || 0}</span>
        </div>
      </div>
      {room.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{room.description}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <Clock size={11} />
          <span>{room.createdBy?.name || 'Bilinmiyor'}</span>
        </div>
        <button
          onClick={() => onJoin(room)}
          className="btn-primary text-xs py-1.5 px-3"
        >
          <Video size={13} />
          Katıl
        </button>
      </div>
    </div>
  )
}

function CreateRoomModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Toplantı adı gerekli'); return }
    setLoading(true)
    try {
      const res = await api.post('/api/meeting/rooms', { name: name.trim(), description: desc.trim() })
      onCreate(res.data)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Oda oluşturulamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="font-semibold text-white">Yeni Toplantı Odası</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Toplantı Adı</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Haftalık Durum Toplantısı" className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Açıklama (isteğe bağlı)</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Toplantı açıklaması" className="input-field" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary text-xs py-1.5">İptal</button>
          <button onClick={handleCreate} disabled={loading} className="btn-primary text-xs py-1.5">
            {loading ? 'Oluşturuluyor...' : 'Oluştur ve Katıl'}
          </button>
        </div>
      </div>
    </div>
  )
}

function VideoGrid({ peers, localStream, localUser }) {
  const localVideoRef = useRef(null)

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  const totalPeers = peers.length + 1
  // Responsive: 1 col on mobile, calculated on desktop
  const mdCols = totalPeers <= 1 ? 1 : totalPeers <= 4 ? 2 : 3
  const gridClass = mdCols === 1
    ? 'grid-cols-1'
    : mdCols === 2
    ? 'grid-cols-1 md:grid-cols-2'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={`grid gap-3 h-full ${gridClass}`}>
      {/* Local video */}
      <div className="relative bg-surface-card rounded-xl overflow-hidden border border-surface-border group">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {!localStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-16 h-16 rounded-full ${avatarColor(localUser?.name)} flex items-center justify-center text-xl font-bold text-white`}>
              {getInitials(localUser?.name)}
            </div>
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
          <span className="text-xs font-medium text-white bg-black/60 rounded-md px-2 py-0.5">
            {localUser?.name || 'Siz'} (Sen)
          </span>
        </div>
      </div>

      {/* Remote peers */}
      {peers.map((peer) => (
        <RemoteVideo key={peer.peerId} peer={peer} />
      ))}
    </div>
  )
}

function RemoteVideo({ peer }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!peer.instance) return
    peer.instance.on('stream', (stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    })
    // If stream already received
    if (peer.stream && videoRef.current) {
      videoRef.current.srcObject = peer.stream
    }
  }, [peer])

  return (
    <div className="relative bg-surface-card rounded-xl overflow-hidden border border-surface-border">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      {!peer.stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-16 h-16 rounded-full ${avatarColor(peer.userName)} flex items-center justify-center text-xl font-bold text-white`}>
            {getInitials(peer.userName)}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3">
        <span className="text-xs font-medium text-white bg-black/60 rounded-md px-2 py-0.5">
          {peer.userName || 'Katılımcı'}
        </span>
      </div>
      {peer.muted && (
        <div className="absolute top-3 right-3">
          <span className="p-1 bg-black/60 rounded-full">
            <MicOff size={12} className="text-red-400" />
          </span>
        </div>
      )}
    </div>
  )
}

export default function MeetingPage() {
  const { user } = useAuth()
  const { socket } = useSocket()

  const [rooms, setRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [activeRoom, setActiveRoom] = useState(null)
  const [peers, setPeers] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)
  const peersRef = useRef([])
  const localStreamRef = useRef(null)

  // Load rooms
  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true)
    try {
      const res = await api.get('/api/meeting/rooms')
      setRooms(res.data.rooms || res.data || [])
    } catch {}
    finally { setLoadingRooms(false) }
  }, [])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  const getLocalStream = async (video = true, audio = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio })
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      toast.error('Kamera/mikrofon erişimi reddedildi.')
      return null
    }
  }

  const createPeer = (peerId, stream, initiator) => {
    const peer = new SimplePeer({
      initiator,
      trickle: false,
      stream,
    })

    peer.on('signal', (signal) => {
      socket?.emit('meeting:signal', { to: peerId, signal, roomId: activeRoom?._id })
    })

    peer.on('stream', (remoteStream) => {
      setPeers(prev => prev.map(p =>
        p.peerId === peerId ? { ...p, stream: remoteStream } : p
      ))
    })

    peer.on('error', (err) => console.error('Peer error:', err))

    return peer
  }

  const joinRoom = async (room) => {
    const stream = await getLocalStream()
    setActiveRoom(room)
    socket?.emit('meeting:join', { roomId: room._id, userId: user?._id, userName: user?.name })
  }

  useEffect(() => {
    if (!socket || !activeRoom) return

    socket.on('meeting:existing_participants', ({ participants }) => {
      participants.forEach(({ socketId, userId, userName }) => {
        if (userId === user?._id) return
        const instance = createPeer(socketId, localStreamRef.current, true)
        const peerObj = { peerId: socketId, userId, userName, instance, stream: null }
        peersRef.current.push(peerObj)
        setPeers(prev => [...prev, peerObj])
      })
    })

    socket.on('meeting:user_joined', ({ socketId, userId, userName }) => {
      if (userId === user?._id) return
      const instance = createPeer(socketId, localStreamRef.current, false)
      const peerObj = { peerId: socketId, userId, userName, instance, stream: null }
      peersRef.current.push(peerObj)
      setPeers(prev => [...prev, peerObj])
      toast.success(`${userName} toplantıya katıldı`)
    })

    socket.on('meeting:signal', ({ from, signal }) => {
      const peerObj = peersRef.current.find(p => p.peerId === from)
      if (peerObj) {
        peerObj.instance.signal(signal)
      }
    })

    socket.on('meeting:user_left', ({ socketId, userName }) => {
      const peer = peersRef.current.find(p => p.peerId === socketId)
      if (peer) {
        peer.instance.destroy()
        peersRef.current = peersRef.current.filter(p => p.peerId !== socketId)
        setPeers(prev => prev.filter(p => p.peerId !== socketId))
        toast(`${userName || 'Bir katılımcı'} toplantıdan ayrıldı`, { icon: '👋' })
      }
    })

    return () => {
      socket.off('meeting:existing_participants')
      socket.off('meeting:user_joined')
      socket.off('meeting:signal')
      socket.off('meeting:user_left')
    }
  }, [socket, activeRoom, user])

  const leaveRoom = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setLocalStream(null)
    peersRef.current.forEach(p => p.instance?.destroy())
    peersRef.current = []
    setPeers([])
    socket?.emit('meeting:leave', { roomId: activeRoom?._id })
    setActiveRoom(null)
    setScreenSharing(false)
  }

  const toggleMic = () => {
    const stream = localStreamRef.current
    if (stream) {
      stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
      setMicOn(prev => !prev)
    }
  }

  const toggleCam = () => {
    const stream = localStreamRef.current
    if (stream) {
      stream.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
      setCamOn(prev => !prev)
    }
  }

  const toggleScreenShare = async () => {
    if (screenSharing) {
      const stream = await getLocalStream(true, true)
      peersRef.current.forEach(p => {
        const videoTrack = stream?.getVideoTracks()[0]
        if (videoTrack) {
          const sender = p.instance?._pc?.getSenders().find(s => s.track?.kind === 'video')
          sender?.replaceTrack(videoTrack)
        }
      })
      setScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        const screenTrack = screenStream.getVideoTracks()[0]
        peersRef.current.forEach(p => {
          const sender = p.instance?._pc?.getSenders().find(s => s.track?.kind === 'video')
          sender?.replaceTrack(screenTrack)
        })
        // Update local stream for preview
        const combined = new MediaStream([screenTrack, ...localStreamRef.current?.getAudioTracks() || []])
        localStreamRef.current = combined
        setLocalStream(combined)
        setScreenSharing(true)
        screenTrack.onended = () => toggleScreenShare()
      } catch {
        toast.error('Ekran paylaşımı başlatılamadı.')
      }
    }
  }

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return
    try {
      const res = await api.get(`/api/meeting/rooms/by-code/${joinCode.trim().toUpperCase()}`)
      const room = res.data
      await joinRoom(room)
    } catch {
      toast.error('Oda bulunamadı. Kodu kontrol edin.')
    }
  }

  const copyRoomCode = () => {
    if (!activeRoom?.code) return
    navigator.clipboard.writeText(activeRoom.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Oda kodu kopyalandı')
  }

  // Meeting room active view
  if (activeRoom) {
    return (
      <div className="flex flex-col h-full bg-[#0a0b10]">
        {/* Meeting header */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 md:px-5 py-3 bg-surface-sidebar border-b border-surface-border">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Video size={16} className="text-brand-400 flex-shrink-0" />
            <span className="font-semibold text-white text-sm truncate">{activeRoom.name}</span>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-surface-card border border-surface-border rounded-full flex-shrink-0">
              <Users size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">{peers.length + 1} katılımcı</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={copyRoomCode}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg text-xs text-gray-400 hover:text-white hover:border-brand-500/40 transition-all min-h-[44px]"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              <span className="font-mono">{activeRoom.code}</span>
            </button>
          </div>
        </div>

        {/* Video grid */}
        <div className="flex-1 p-4 overflow-hidden">
          <VideoGrid peers={peers} localStream={localStream} localUser={user} />
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 flex items-center justify-center gap-2 md:gap-3 py-3 md:py-4 px-3 bg-surface-sidebar border-t border-surface-border flex-wrap">
          <button
            onClick={toggleMic}
            className={`flex flex-col items-center gap-1 px-3 md:px-5 py-2.5 rounded-xl transition-all min-h-[56px] min-w-[64px] ${
              micOn
                ? 'bg-surface-card border border-surface-border text-gray-200 hover:bg-surface-elevated'
                : 'bg-red-500/20 border border-red-500/30 text-red-300'
            }`}
          >
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
            <span className="text-[10px]">{micOn ? 'Sessiz' : 'Sesli'}</span>
          </button>

          <button
            onClick={toggleCam}
            className={`flex flex-col items-center gap-1 px-3 md:px-5 py-2.5 rounded-xl transition-all min-h-[56px] min-w-[64px] ${
              camOn
                ? 'bg-surface-card border border-surface-border text-gray-200 hover:bg-surface-elevated'
                : 'bg-red-500/20 border border-red-500/30 text-red-300'
            }`}
          >
            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
            <span className="text-[10px]">{camOn ? 'Kamerayı Kapat' : 'Kamerayı Aç'}</span>
          </button>

          <button
            onClick={toggleScreenShare}
            className={`hidden sm:flex flex-col items-center gap-1 px-3 md:px-5 py-2.5 rounded-xl transition-all min-h-[56px] min-w-[64px] ${
              screenSharing
                ? 'bg-brand-500/20 border border-brand-500/40 text-brand-300'
                : 'bg-surface-card border border-surface-border text-gray-200 hover:bg-surface-elevated'
            }`}
          >
            <MonitorUp size={20} />
            <span className="text-[10px]">{screenSharing ? 'Paylaşımı Durdur' : 'Ekran Paylaş'}</span>
          </button>

          <div className="w-px h-10 bg-surface-border mx-1 hidden sm:block" />

          <button
            onClick={leaveRoom}
            className="flex flex-col items-center gap-1 px-4 md:px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all min-h-[56px] min-w-[64px]"
          >
            <PhoneOff size={20} />
            <span className="text-[10px]">Ayrıl</span>
          </button>
        </div>
      </div>
    )
  }

  // Lobby view
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 md:mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Video Toplantılar</h2>
            <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Toplantı oluşturun veya mevcut bir odaya katılın</p>
          </div>
          <button
            onClick={() => setShowCreateRoom(true)}
            className="btn-primary min-h-[44px]"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Yeni Toplantı</span>
            <span className="sm:hidden">Yeni</span>
          </button>
        </div>

        {/* Join by code */}
        <div className="card p-4 md:p-5 mb-5 md:mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Kod ile Katıl</h3>
          <div className="flex gap-2 md:gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Oda kodunu girin (örn: ABC123)"
              className="input-field font-mono tracking-wider flex-1 min-h-[44px]"
              maxLength={8}
              onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
            />
            <button onClick={handleJoinByCode} className="btn-primary flex-shrink-0 min-h-[44px]">
              <ExternalLink size={15} />
              Katıl
            </button>
          </div>
        </div>

        {/* Rooms grid */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            Aktif Toplantı Odaları
            <span className="ml-2 text-xs text-gray-500 font-normal">({rooms.length})</span>
          </h3>
          {loadingRooms ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="card p-12 text-center">
              <Video size={40} className="mx-auto text-gray-700 mb-3" />
              <p className="text-sm text-gray-500 mb-1">Aktif toplantı odası yok</p>
              <p className="text-xs text-gray-600">Yeni bir toplantı oluşturun ve ekibinizi davet edin</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map(room => (
                <RoomCard key={room._id} room={room} onJoin={joinRoom} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreateRoom && (
        <CreateRoomModal
          onClose={() => setShowCreateRoom(false)}
          onCreate={room => {
            setRooms(prev => [room, ...prev])
            joinRoom(room)
          }}
        />
      )}
    </div>
  )
}
