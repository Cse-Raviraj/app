'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MessageSquarePlus, MoreVertical, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'
import { Avatar, shortTime, formatId } from './ui-bits'

export default function Chats() {
  const { conversations, openChat, startFinding, refreshConversations, friendIncoming, refreshFriendRequests, user } = useApp()
  const incoming = friendIncoming || []

  // Unique-ID friend search
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setResults(null)
    try {
      const r = await api(`/api/users/search?query=${encodeURIComponent(q)}`)
      setResults(r.users || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSearching(false)
    }
  }

  const addFriend = async (u) => {
    try {
      await api('/api/friends/request', { method: 'POST', body: { toUserId: u.id } })
      toast.success(`Friend request sent to ${u.anonymousName} 🤝`)
      search()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const acceptFromSearch = async (requestId) => {
    try {
      await api('/api/friends/respond', { method: 'POST', body: { requestId, accept: true } })
      toast.success('You are now friends 🎉')
      refreshFriendRequests()
      refreshConversations()
      search()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const respond = async (requestId, accept) => {
    try {
      await api('/api/friends/respond', { method: 'POST', body: { requestId, accept } })
      if (accept) toast.success('You are now friends 🎉')
      refreshFriendRequests()
      refreshConversations()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const removeChat = async (id) => {
    try {
      await api(`/api/conversations/${id}`, { method: 'DELETE' })
      toast.success('Chat deleted')
      refreshConversations()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold text-gray-900">Chats</h1>

      {/* find friends by unique ID */}
      <Card className="rounded-3xl p-4 shadow-sm">
        <p className="font-display font-bold text-gray-900">Add a friend by ID</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Every user has a unique 6-digit ID number (like 482913). Enter it to send a friend request — find your ID in the Me tab.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="e.g. 482913"
            inputMode="numeric"
            maxLength={7}
            aria-label="Search by unique ID number"
            className="h-11 flex-1 rounded-full"
          />
          <Button
            onClick={search}
            disabled={searching || !query.trim()}
            aria-label="Search"
            className="h-11 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 px-5 text-white font-bold"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {results !== null && (
          <div className="mt-3 space-y-2">
            {results.length === 0 && (
              <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">No user found with that ID. Check the spelling and try again.</p>
            )}
            {results.map((r) => (
              <div key={r.user.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <Avatar user={r.user} size="sm" online={null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{r.user.anonymousName}</p>
                  <p className="font-mono text-xs text-gray-400">{r.self ? 'This is you 😊' : formatId(r.user.userNumber)}</p>
                </div>
                {r.self && null}
                {!r.self && r.relationship === 'none' && (
                  <Button size="sm" onClick={() => addFriend(r.user)} className="h-9 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white">
                    Add Friend
                  </Button>
                )}
                {!r.self && r.relationship === 'pending_out' && (
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">Requested</span>
                )}
                {!r.self && r.relationship === 'pending_in' && (
                  <Button size="sm" onClick={() => acceptFromSearch(r.requestId)} className="h-9 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white">
                    Accept
                  </Button>
                )}
                {!r.self && r.relationship === 'friend' && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">Friends ✓</span>
                )}
                {!r.self && r.relationship === 'blocked' && (
                  <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500">Blocked</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {incoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">Friend requests</h2>
          <div className="mt-2 space-y-2">
            {incoming.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 rounded-3xl p-4 shadow-sm">
                <Avatar user={r.from} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">
                    {r.from.anonymousName}
                    {r.from.userNumber && <span className="ml-1.5 font-mono text-xs font-normal text-gray-400">{formatId(r.from.userNumber)}</span>}
                  </p>
                  <p className="text-xs text-gray-500">wants to be your friend</p>
                </div>
                <Button size="sm" onClick={() => respond(r.id, true)} className="h-9 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white">
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => respond(r.id, false)} className="h-9 rounded-full">
                  Decline
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {conversations.length === 0 ? (
        <Card className="rounded-3xl p-10 text-center shadow-sm">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-violet-50 text-4xl">💬</div>
          <h2 className="font-display mt-4 text-xl font-extrabold text-gray-900">You haven't talked to anyone yet.</h2>
          <p className="mt-1 text-sm text-gray-500">Your finished conversations will be saved here.</p>
          <Button onClick={startFinding} className="mt-5 h-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 px-7 text-white font-bold">
            Find Your Random Friend
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Card key={c.id} className="group flex items-center gap-3 rounded-3xl p-4 shadow-sm transition-shadow hover:shadow-md">
              <button onClick={() => openChat(c)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar user={c.peer} online={c.peerOnline} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-gray-900">
                      {c.type === 'friend' ? (c.peer ? c.peer.anonymousName : 'Friend') : 'Anonymous Friend'}
                    </p>
                    {c.type === 'random' && c.status !== 'active' && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Ended</span>
                    )}
                    {c.type === 'friend' && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Friend</span>
                    )}
                  </div>
                  <p className={`truncate text-sm ${c.unread > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    {c.lastMessage ? c.lastMessage.text : 'Say hi 👋'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11px] text-gray-400">{shortTime(c.updatedAt)}</span>
                  {c.unread > 0 && (
                    <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-violet-600 px-1 text-[11px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Chat options" className="rounded-full text-gray-400">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem onClick={() => removeChat(c.id)} className="gap-2 text-red-600 focus:text-red-600">
                    <Trash2 className="h-4 w-4" /> Delete chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
          <div className="pt-2 text-center">
            <Button variant="outline" onClick={startFinding} className="h-11 rounded-full">
              <MessageSquarePlus className="mr-2 h-4 w-4" /> Find Your Random Friend
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
