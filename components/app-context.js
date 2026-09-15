'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState({ online: 0, available: 0 })
  const [screen, setScreen] = useState('home') // home | chats | feed | communities | me | chat
  const [finding, setFinding] = useState(null) // null | searching | nobody | waiting | someone
  const [activeConv, setActiveConv] = useState(null) // { conversation, peer }
  const [chatMessages, setChatMessages] = useState([])
  const [peerTyping, setPeerTyping] = useState(false)
  const [peerOnline, setPeerOnline] = useState(true)
  const [incomingRequest, setIncomingRequest] = useState(null) // { requestId, from, expiresIn }
  const [conversations, setConversations] = useState([])
  const [friendIncoming, setFriendIncoming] = useState([])
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState('signup')
  const [call, setCall] = useState(null) // { state:'outgoing'|'incoming'|'active', peer, conversationId, muted }

  const pendingFindRef = useRef(false)
  const socketRef = useRef(null)
  const findingRef = useRef(null)
  const activeConvIdRef = useRef(null)
  const userRef = useRef(null)
  const screenRef = useRef(null)
  // ---- voice call refs ----
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const pendingIceRef = useRef([])
  const incomingOfferRef = useRef(null)
  const callConvRef = useRef(null)
  const outgoingTimeoutRef = useRef(null)
  findingRef.current = finding
  activeConvIdRef.current = (activeConv && activeConv.conversation && activeConv.conversation.id) || null
  userRef.current = user
  screenRef.current = screen

  const refreshConversations = useCallback(async () => {
    if (!userRef.current) return
    try {
      const r = await api('/api/conversations')
      setConversations(r.conversations || [])
    } catch {}
  }, [])

  const refreshFriendRequests = useCallback(async () => {
    if (!userRef.current) return
    try {
      const r = await api('/api/friends')
      setFriendIncoming(r.incoming || [])
    } catch {}
  }, [])

  // ---------- voice call helpers ----------
  const cleanupCall = useCallback(() => {
    if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null }
    if (pcRef.current) { try { pcRef.current.close() } catch {} pcRef.current = null }
    if (localStreamRef.current) { try { localStreamRef.current.getTracks().forEach((t) => t.stop()) } catch {} localStreamRef.current = null }
    if (remoteAudioRef.current) { try { remoteAudioRef.current.srcObject = null } catch {} }
    pendingIceRef.current = []
    incomingOfferRef.current = null
    callConvRef.current = null
    setCall(null)
  }, [])

  const buildPeerConnection = useCallback((conversationId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG)
    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) socketRef.current.emit('call_ice', { conversationId, candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = typeof Audio !== 'undefined' ? new Audio() : null
        if (remoteAudioRef.current) remoteAudioRef.current.autoplay = true
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0]
        remoteAudioRef.current.play().catch(() => {})
      }
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        toast('Call disconnected')
        cleanupCall()
      }
    }
    pcRef.current = pc
    return pc
  }, [cleanupCall])

  // Initial session check
  useEffect(() => {
    let mounted = true
    api('/api/auth/me')
      .then((r) => {
        if (mounted && r.user) setUser(r.user)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true)
      })
    return () => {
      mounted = false
    }
  }, [])

  // Socket lifecycle — only for logged-in users
  useEffect(() => {
    if (!user) return
    const socket = io({ path: '/api/socketio', withCredentials: true })
    socketRef.current = socket

    socket.on('presence_stats', (s) => setStats(s))

    socket.on('match_found', (d) => {
      setFinding(null)
      setPeerTyping(false)
      setPeerOnline(true)
      setActiveConv({ conversation: d.conversation, peer: d.peer })
      setChatMessages([])
      setScreen('chat')
      refreshConversations()
    })

    socket.on('chat_request', (d) => setIncomingRequest(d))

    socket.on('request_expired', () => setIncomingRequest(null))

    socket.on('nobody_available', () => {
      if (findingRef.current === 'searching') setFinding('nobody')
    })

    socket.on('we_have_someone', () => {
      if (findingRef.current === 'nobody' || findingRef.current === 'waiting') {
        setFinding('someone')
      } else {
        toast('Someone just came online — tap Find Your Random Friend!')
      }
    })

    socket.on('new_message', (msg) => {
      if (msg.conversationId === activeConvIdRef.current) {
        setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        if (msg.senderId !== user.id) {
          socket.emit('read_messages', { conversationId: msg.conversationId })
        }
      } else if (msg.senderId !== user.id) {
        toast('💬 New message just arrived')
      }
      refreshConversations()
    })

    socket.on('messages_read', ({ conversationId, readerId }) => {
      if (conversationId !== activeConvIdRef.current) return
      setChatMessages((prev) =>
        prev.map((m) =>
          m.senderId === user.id && !((m.readBy || []).includes(readerId))
            ? { ...m, readBy: [...(m.readBy || []), readerId] }
            : m
        )
      )
    })

    socket.on('typing', ({ conversationId, userId, isTyping }) => {
      if (conversationId === activeConvIdRef.current && userId !== user.id) setPeerTyping(isTyping)
    })

    socket.on('chat_ended', ({ conversationId, endedBy }) => {
      if (conversationId === activeConvIdRef.current) {
        setActiveConv((prev) =>
          prev ? { ...prev, conversation: { ...prev.conversation, status: 'ended', endedBy } } : prev
        )
        toast(endedBy === user.id ? 'You ended the chat' : 'Anonymous Friend left the chat')
      }
      refreshConversations()
    })

    socket.on('peer_presence', ({ online }) => setPeerOnline(online))

    socket.on('notification', (n) => {
      if (n && n.type === 'friend_request' && n.from) {
        toast(`🤝 Friend request from ${n.from.anonymousName}`, {
          description: 'Open the Chats tab to accept or decline.',
          action: {
            label: 'View',
            onClick: () => {
              if (screenRef.current !== 'chat') setScreen('chats')
            },
          },
          duration: 8000,
        })
        refreshFriendRequests()
      }
      refreshConversations()
    })

    socket.on('friend_accepted', (d) => {
      if (d && d.peer) toast(`🎉 You and ${d.peer.anonymousName} are now friends`)
      refreshFriendRequests()
      refreshConversations()
    })

    socket.on('peer_updated', ({ user: pu }) => {
      if (!pu) return
      setActiveConv((prev) =>
        prev && prev.peer && prev.peer.id === pu.id ? { ...prev, peer: { ...prev.peer, ...pu } } : prev
      )
      refreshConversations()
      refreshFriendRequests()
    })

    // ---- voice call signaling ----
    socket.on('call_incoming', ({ conversationId, sdp, fromUser }) => {
      if (callConvRef.current) { socket.emit('call_end', { conversationId }); return } // already busy
      incomingOfferRef.current = sdp
      callConvRef.current = conversationId
      setCall({ state: 'incoming', peer: fromUser, conversationId, muted: false })
    })
    socket.on('call_answered', async ({ sdp }) => {
      const pc = pcRef.current
      if (!pc) return
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {} }
        pendingIceRef.current = []
        if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null }
        setCall((prev) => (prev ? { ...prev, state: 'active' } : prev))
      } catch {}
    })
    socket.on('call_ice', async ({ candidate }) => {
      const pc = pcRef.current
      if (!candidate) return
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
      } else {
        pendingIceRef.current.push(candidate)
      }
    })
    socket.on('call_ended', () => { if (callConvRef.current) toast('Call ended'); cleanupCall() })
    socket.on('call_rejected', () => { toast('Call declined'); cleanupCall() })

    socket.on('app_error', (e) => toast.error((e && e.message) || 'Something went wrong. Please try again.'))

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id])

  useEffect(() => {
    refreshConversations()
    refreshFriendRequests()
  }, [user && user.id, refreshConversations, refreshFriendRequests])

  // ---------- actions ----------
  const openAuth = (tab = 'signup') => {
    setAuthTab(tab)
    setAuthOpen(true)
  }

  const auth = async (mode, email, password) => {
    const r = await api(`/api/auth/${mode}`, { method: 'POST', body: { email, password } })
    setUser(r.user)
    setAuthOpen(false)
    if (pendingFindRef.current) {
      pendingFindRef.current = false
      setTimeout(() => startFinding(), 400)
    }
    return r
  }

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {}
    cleanupCall()
    setUser(null)
    setScreen('home')
    setActiveConv(null)
    setChatMessages([])
    setFinding(null)
    setConversations([])
    setFriendIncoming([])
  }

  const startFinding = () => {
    if (!userRef.current) {
      pendingFindRef.current = true
      openAuth('signup')
      return
    }
    setFinding('searching')
    if (socketRef.current) socketRef.current.emit('find_friend')
  }

  const cancelFinding = () => {
    if (socketRef.current) socketRef.current.emit('cancel_search')
    setFinding(null)
  }

  const notifyMe = () => {
    if (socketRef.current) socketRef.current.emit('notify_me')
    setFinding('waiting')
  }

  const connectNow = () => {
    setFinding('searching')
    if (socketRef.current) socketRef.current.emit('find_friend')
  }

  const acceptRequest = (requestId) => {
    if (socketRef.current) socketRef.current.emit('accept_request', { requestId })
    setIncomingRequest(null)
  }

  const declineRequest = (requestId) => {
    if (socketRef.current) socketRef.current.emit('decline_request', { requestId })
    setIncomingRequest(null)
  }

  const sendMessage = (text, clientId) => {
    if (socketRef.current) socketRef.current.emit('send_message', { conversationId: activeConvIdRef.current, text, clientId })
  }

  const sendTyping = (isTyping) => {
    if (socketRef.current) socketRef.current.emit('typing', { conversationId: activeConvIdRef.current, isTyping })
  }

  const markRead = () => {
    if (socketRef.current && activeConvIdRef.current) {
      socketRef.current.emit('read_messages', { conversationId: activeConvIdRef.current })
    }
  }

  const endChat = () => {
    if (socketRef.current) socketRef.current.emit('end_chat', { conversationId: activeConvIdRef.current })
  }

  // ---------- voice call actions ----------
  const startCall = async (conversationId, peer) => {
    if (call || callConvRef.current) return
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Voice calls are not supported on this device/browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      callConvRef.current = conversationId
      const pc = buildPeerConnection(conversationId)
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      if (socketRef.current) socketRef.current.emit('call_offer', { conversationId, sdp: offer })
      setCall({ state: 'outgoing', peer, conversationId, muted: false })
      outgoingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current) socketRef.current.emit('call_end', { conversationId })
        toast('No answer')
        cleanupCall()
      }, 35000)
    } catch (e) {
      toast.error('Microphone permission is needed for voice calls.')
      cleanupCall()
    }
  }

  const acceptCall = async () => {
    const offer = incomingOfferRef.current
    const conversationId = callConvRef.current
    if (!offer || !conversationId) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = buildPeerConnection(conversationId)
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {} }
      pendingIceRef.current = []
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (socketRef.current) socketRef.current.emit('call_answer', { conversationId, sdp: answer })
      setCall((prev) => (prev ? { ...prev, state: 'active' } : { state: 'active', conversationId, muted: false }))
    } catch (e) {
      toast.error('Microphone permission is needed for voice calls.')
      if (socketRef.current) socketRef.current.emit('call_reject', { conversationId })
      cleanupCall()
    }
  }

  const rejectCall = () => {
    if (callConvRef.current && socketRef.current) socketRef.current.emit('call_reject', { conversationId: callConvRef.current })
    cleanupCall()
  }

  const hangup = () => {
    if (callConvRef.current && socketRef.current) socketRef.current.emit('call_end', { conversationId: callConvRef.current })
    cleanupCall()
  }

  const toggleMute = () => {
    const s = localStreamRef.current
    if (!s) return
    const isEnabled = s.getAudioTracks().some((t) => t.enabled)
    s.getAudioTracks().forEach((t) => { t.enabled = !isEnabled })
    setCall((prev) => (prev ? { ...prev, muted: isEnabled } : prev))
  }

  const setAvailable = (available) => {
    if (socketRef.current) socketRef.current.emit('set_available', { available })
    setUser((u) => (u ? { ...u, availableToChat: available } : u))
  }

  const blockUser = async (userId) => {
    await api('/api/block', { method: 'POST', body: { userId } })
    toast.success('User blocked. You will not be matched again.')
  }

  const openChat = async (conv) => {
    try {
      const r = await api(`/api/conversations/${conv.id}/messages`)
      setActiveConv({ conversation: r.conversation, peer: r.peer })
      setChatMessages(r.messages || [])
      setPeerOnline(!!conv.peerOnline)
      setScreen('chat')
      if (socketRef.current) socketRef.current.emit('join_conversation', { conversationId: conv.id })
      setTimeout(() => {
        if (socketRef.current) socketRef.current.emit('read_messages', { conversationId: conv.id })
      }, 400)
      refreshConversations()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const goHome = () => {
    setScreen('home')
    setActiveConv(null)
    setChatMessages([])
  }

  const socketOn = (event, handler) => {
    const s = socketRef.current
    if (!s) return () => {}
    s.on(event, handler)
    return () => s.off(event, handler)
  }

  const socketEmit = (event, payload) => {
    if (socketRef.current) socketRef.current.emit(event, payload)
  }

  const unreadTotal = useMemo(
    () => (conversations || []).reduce((a, c) => a + (c.unread || 0), 0),
    [conversations]
  )

  const value = {
    ready, user, setUser, stats, screen, setScreen, finding,
    activeConv, chatMessages, setChatMessages, peerTyping, peerOnline,
    incomingRequest, conversations, unreadTotal, friendIncoming,
    authOpen, setAuthOpen, authTab, setAuthTab,
    call, startCall, acceptCall, rejectCall, hangup, toggleMute,
    openAuth, auth, logout,
    startFinding, cancelFinding, notifyMe, connectNow,
    acceptRequest, declineRequest,
    sendMessage, sendTyping, markRead, endChat, setAvailable,
    blockUser, openChat, goHome,
    refreshConversations, refreshFriendRequests, socketOn, socketEmit,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
