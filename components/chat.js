'use client'

import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { toast } from 'sonner'
import { ArrowLeft, Send, ShieldAlert, MoreVertical, UserX, Flag, LogOut, Check, CheckCheck, UserPlus, Search, X, Info, Phone, ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'
import { Avatar, TypingDots, clockTime, formatId } from './ui-bits'

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'threats', label: 'Threats' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'scam', label: 'Scam' },
  { value: 'fake_account', label: 'Fake account' },
  { value: 'other', label: 'Other' },
]

function Bubble({ m, mine }) {
  const read = (m.readBy || []).length > 1
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
          mine
            ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-br-md'
            : 'bg-white border border-border text-gray-900 rounded-bl-md'
        } ${m.pending ? 'opacity-60' : ''} ${m.image ? 'p-1.5' : ''}`}
      >
        {m.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <a href={m.image} target="_blank" rel="noreferrer">
            <img src={m.image} alt="Shared photo" loading="lazy" className="max-h-64 w-full rounded-xl object-cover" />
          </a>
        ) : (
          <p className="whitespace-pre-wrap break-words">{m.text}</p>
        )}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? (m.image ? 'text-white/90 px-1 pb-0.5' : 'text-white/75') : 'text-gray-400'}`}>
          {m.pending ? 'sending…' : clockTime(m.createdAt)}
          {mine && !m.pending && (read ? <CheckCheck className="h-3.5 w-3.5" aria-label="Read" /> : <Check className="h-3.5 w-3.5" aria-label="Sent" />)}
        </div>
      </div>
    </div>
  )
}

function SystemPill({ children }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-violet-100 px-4 py-1 text-xs font-medium text-violet-700">{children}</span>
    </div>
  )
}

export default function Chat() {
  const {
    activeConv, chatMessages, setChatMessages, peerTyping, peerOnline,
    sendMessage, sendTyping, markRead, endChat, blockUser, goHome, startFinding, user, startCall,
  } = useApp()
  const [draft, setDraft] = useState('')
  const [showPrivacy, setShowPrivacy] = useState(true)
  const [blockOpen, setBlockOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState('spam')
  const [reportNote, setReportNote] = useState('')
  const [friendDone, setFriendDone] = useState(false)
  const [uploading, setUploading] = useState(false)
  const typingTimer = useRef(null)
  const bottomRef = useRef(null)
  const photoRef = useRef(null)
  const conv = activeConv?.conversation
  const peer = activeConv?.peer
  const isRandom = conv?.type === 'random'
  const isFriendChat = conv?.type === 'friend'
  const ended = isRandom && conv?.status !== 'active'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length, peerTyping])

  useEffect(() => {
    if (conv?.id) markRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv && conv.id])

  if (!conv || !peer) return null

  const onChange = (e) => {
    setDraft(e.target.value)
    sendTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => sendTyping(false), 1200)
  }

  const send = () => {
    const text = draft.trim()
    if (!text || ended) return
    const clientId = uuid()
    setChatMessages((prev) => [
      ...prev,
      { id: clientId, conversationId: conv.id, senderId: user.id, text, createdAt: new Date(), readBy: [user.id], pending: true },
    ])
    sendMessage(text, clientId)
    setDraft('')
    sendTyping(false)
  }

  const sendPhoto = async (e) => {
    const f = e.target.files && e.target.files[0]
    if (photoRef.current) photoRef.current.value = ''
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB.'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', f)
      await api(`/api/conversations/${conv.id}/image`, { method: 'POST', formData: fd })
      // the photo message arrives in real time via the socket new_message event
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const addFriend = async () => {
    try {
      await api('/api/friends/request', { method: 'POST', body: { toUserId: peer.id } })
      toast.success('Friend request sent 🤝')
      setFriendDone(true)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const submitReport = async () => {
    try {
      await api('/api/report', {
        method: 'POST',
        body: { reportedUserId: peer.id, category: reportCategory, description: reportNote, conversationId: conv.id },
      })
      setReportOpen(false)
      setReportNote('')
      toast.success('Report received. Thank you for keeping Talk to Strangers friendly.')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const confirmBlock = async () => {
    try {
      await blockUser(peer.id)
      setBlockOpen(false)
      goHome()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const headerTitle = isFriendChat ? peer.anonymousName : 'Anonymous Friend'

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-gray-50 md:static md:z-auto md:h-[calc(100dvh-4rem)] md:rounded-3xl md:border md:border-border md:shadow-sm md:overflow-hidden md:mx-auto md:max-w-3xl">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border bg-white/90 px-3 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={goHome} aria-label="Go back" className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar user={peer} online={isRandom && !isFriendChat ? true : peerOnline} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">
            {headerTitle}
            {isFriendChat && peer.userNumber && (
              <span className="ml-2 font-mono text-xs font-normal text-gray-400">{formatId(peer.userNumber)}</span>
            )}
          </p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            {isFriendChat ? (
              <span className={peerOnline ? 'text-emerald-600' : 'text-gray-400'}>
                {peerOnline ? '● Online' : '○ Offline'}
              </span>
            ) : (
              <>
                <span className="truncate">Random chat</span> · <span className="text-emerald-600">● Online</span>
              </>
            )}
          </p>
        </div>
        {isFriendChat && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => startCall(conv.id, peer)}
            aria-label="Start voice call"
            className="rounded-full text-violet-600 hover:bg-violet-50"
          >
            <Phone className="h-5 w-5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Chat options" className="rounded-full">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            {isRandom && !ended && (
              <DropdownMenuItem onClick={endChat} className="gap-2">
                <LogOut className="h-4 w-4" /> End Chat
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setBlockOpen(true)} className="gap-2 text-red-600 focus:text-red-600">
              <UserX className="h-4 w-4" /> Block
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setReportOpen(true)} className="gap-2">
              <Flag className="h-4 w-4" /> Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* privacy reminder */}
      {showPrivacy && (
        <div className="px-3 pt-3">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1">Stay safe. Don't share passwords, OTPs, banking information, or private personal details.</p>
            <button onClick={() => setShowPrivacy(false)} aria-label="Dismiss privacy reminder" className="rounded p-0.5 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4" role="log" aria-label="Chat messages">
        {isRandom && <SystemPill>You are connected — say hi 👋</SystemPill>}
        {chatMessages.map((m) => (
          <Bubble key={m.id} m={m} mine={m.senderId === user.id} />
        ))}
        {peerTyping && !ended && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-border bg-white px-3 py-2 shadow-sm">
              <TypingDots />
            </div>
          </div>
        )}
        {ended && <SystemPill>Chat ended</SystemPill>}
        <div ref={bottomRef} />
      </div>

      {/* bottom */}
      {ended ? (
        <div className="border-t border-border bg-white p-4">
          <p className="text-center text-sm text-gray-500">This chat has ended. Your conversation is saved in Chats.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {!friendDone && (
              <Button onClick={addFriend} className="h-11 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white">
                <UserPlus className="mr-2 h-4 w-4" /> Add as Friend
              </Button>
            )}
            <Button onClick={() => { goHome(); startFinding() }} variant="outline" className="h-11 rounded-full">
              <Search className="mr-2 h-4 w-4" /> Find another friend
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-border bg-white p-3">
          <input
            ref={photoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={sendPhoto}
            aria-hidden="true"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => photoRef.current && photoRef.current.click()}
            disabled={uploading}
            aria-label="Send a photo"
            className="h-11 w-11 shrink-0 rounded-full text-violet-600 hover:bg-violet-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </Button>
          <Input
            value={draft}
            onChange={onChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Type a message..."
            aria-label="Type a message"
            maxLength={2000}
            className="h-11 flex-1 rounded-full"
          />
          <Button
            size="icon"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send message"
            className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-violet-600 to-pink-500 text-white shadow-md disabled:opacity-40"
          >
            <Send className="h-4.5 w-4.5" />
          </Button>
        </div>
      )}

      {/* block confirm */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-left">Block {peer.anonymousName}?</DialogTitle>
            <DialogDescription className="text-left">
              The chat will end and you two will never be matched again. You can unblock later from Me → Blocked users.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-11 rounded-full" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="h-11 rounded-full" onClick={confirmBlock}>Block</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* report */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-left">Report {peer.anonymousName}</DialogTitle>
            <DialogDescription className="text-left">Tell us what happened. Our team reviews every report.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={reportCategory} onValueChange={setReportCategory} className="mt-1 grid grid-cols-2 gap-2">
            {REPORT_REASONS.map((r) => (
              <Label
                key={r.value}
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-medium ${
                  reportCategory === r.value ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-border'
                }`}
              >
                <RadioGroupItem value={r.value} className="h-4 w-4" />
                {r.label}
              </Label>
            ))}
          </RadioGroup>
          <Textarea
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            placeholder="Anything else we should know? (optional)"
            className="mt-2 rounded-2xl"
            maxLength={1000}
          />
          <Button onClick={submitReport} className="mt-2 h-11 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold">
            Submit report
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
