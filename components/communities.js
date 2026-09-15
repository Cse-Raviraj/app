'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Send, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'
import { Avatar, shortTime } from './ui-bits'

export default function Communities() {
  const { user, socketOn, socketEmit, refreshConversations } = useApp()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [joined, setJoined] = useState(false)
  const openIdRef = useRef(null)
  openIdRef.current = open ? open.id : null

  const load = async () => {
    try {
      const r = await api('/api/communities')
      setCommunities(r.communities || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const cleanup = socketOn('community_message', (m) => {
      if (openIdRef.current && m.communityId === openIdRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      }
    })
    return cleanup
  }, [socketOn])

  const toggleJoin = async (c) => {
    try {
      const r = await api(`/api/communities/${c.id}/${c.joined ? 'leave' : 'join'}`, { method: 'POST' })
      setCommunities((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, joined: r.joined, memberCount: r.memberCount } : x))
      )
      if (open && open.id === c.id) setJoined(r.joined)
      toast.success(r.joined ? `Welcome to ${c.name}! 🎉` : `You left ${c.name}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const openCommunity = async (c) => {
    setOpen(c)
    setJoined(c.joined)
    try {
      const r = await api(`/api/communities/${c.id}/messages`)
      setMessages(r.messages || [])
    } catch (e) {
      toast.error(e.message)
    }
    socketEmit('join_community', { communityId: c.id })
  }

  const closeCommunity = () => {
    if (open) socketEmit('leave_community', { communityId: open.id })
    setOpen(null)
    setMessages([])
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !open) return
    socketEmit('community_message', { communityId: open.id, text })
    setDraft('')
  }

  if (open) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-gray-50 md:static md:z-auto md:h-[calc(100dvh-4rem)] md:max-w-3xl md:mx-auto md:rounded-3xl md:border md:border-border md:overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border bg-white/90 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={closeCommunity} aria-label="Back to communities" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-gray-900">{open.emoji} {open.name}</p>
            <p className="text-xs text-gray-500">{open.memberCount} members</p>
          </div>
          {!joined && (
            <Button size="sm" onClick={() => toggleJoin(open)} className="h-9 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white">
              Join
            </Button>
          )}
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4" role="log" aria-label="Community messages">
          {messages.length === 0 && (
            <p className="pt-10 text-center text-sm text-gray-400">
              {joined ? 'Be the first to say something in this community! 👋' : 'Join this community to read and write messages.'}
            </p>
          )}
          {messages.map((m) => {
            const mine = m.user && m.user.id === user.id
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mine ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-br-md' : 'bg-white border border-border rounded-bl-md'}`}>
                  {!mine && m.user && <p className="text-xs font-semibold text-violet-600">{m.user.anonymousName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>{shortTime(m.createdAt)}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-white p-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={joined ? 'Message the community...' : 'Join to send messages'}
            aria-label="Community message"
            maxLength={1000}
            disabled={!joined}
            className="h-11 flex-1 rounded-full"
          />
          <Button size="icon" onClick={send} disabled={!joined || !draft.trim()} aria-label="Send" className="h-11 w-11 rounded-full bg-gradient-to-br from-violet-600 to-pink-500 text-white">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold text-gray-900">Communities</h1>
      <p className="-mt-2 text-sm text-gray-500">Find your people. Join the conversations you care about.</p>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-28 animate-pulse rounded-3xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {communities.map((c) => (
            <Card key={c.id} className="flex flex-col rounded-3xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-2xl">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.memberCount} members</p>
                </div>
              </div>
              <p className="mt-2 flex-1 text-sm text-gray-600">{c.description}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openCommunity(c)} className="flex-1 rounded-full">
                  Open
                </Button>
                <Button
                  size="sm"
                  onClick={() => toggleJoin(c)}
                  className={`flex-1 rounded-full ${c.joined ? '' : 'bg-gradient-to-r from-violet-600 to-pink-500 text-white'}`}
                >
                  {c.joined ? 'Joined ✓' : 'Join'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
