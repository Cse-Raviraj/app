'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ShieldCheck, EyeOff, Zap, UserPlus } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'
import { Avatar, formatId } from './ui-bits'

export default function Home() {
  const { user, stats, startFinding, setAvailable, friendIncoming, refreshFriendRequests, refreshConversations } = useApp()
  const available = user?.availableToChat !== false
  const incoming = friendIncoming || []

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

  return (
    <div className="space-y-5">
      {/* incoming friend requests — visible right here on the home page */}
      {incoming.length > 0 && (
        <section className="rounded-3xl border border-violet-200 bg-violet-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-violet-600" />
            <h2 className="font-display font-bold text-gray-900">
              Friend request{incoming.length > 1 ? `s (${incoming.length})` : ''}
            </h2>
          </div>
          <div className="mt-3 space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <Avatar user={r.from} size="sm" />
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
              </div>
            ))}
          </div>
        </section>
      )}

      {/* main CTA card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 p-8 text-white shadow-lg">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-14 -left-6 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute top-6 right-8 text-3xl animate-float select-none">👋</div>
        </div>
        <p className="text-white/80">Hey {user?.anonymousName} 👋</p>
        <h1 className="font-display mt-1 text-3xl md:text-4xl font-extrabold">Ready to meet someone new?</h1>
        <p className="mt-2 max-w-sm text-white/85">One tap and we will find a real person for you to talk to. No bots, ever.</p>
        <Button
          onClick={startFinding}
          className="mt-6 h-14 px-8 rounded-full bg-white text-violet-700 text-lg font-bold shadow-xl hover:scale-[1.02] active:scale-95 transition-transform"
        >
          Find Your Random Friend
        </Button>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-medium">
          {stats.online > 0 && (
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">🟢 {stats.online} online now</span>
          )}
          {stats.available > 0 && (
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">💬 {stats.available} available to chat</span>
          )}
          {stats.online === 0 && (
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">You are the first one here today</span>
          )}
        </div>
      </section>

      {/* availability toggle */}
      <Card className="rounded-3xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-gray-900">Available to chat</h2>
            <p className="mt-1 text-sm text-gray-600">
              People looking for a random friend can invite you. You always choose Accept or Decline — nothing happens automatically.
            </p>
          </div>
          <Switch
            checked={available}
            onCheckedChange={setAvailable}
            aria-label="Available to chat"
            className="mt-1 data-[state=checked]:bg-emerald-500"
          />
        </div>
      </Card>

      {/* what to expect */}
      <Card className="rounded-3xl p-5 shadow-sm">
        <h2 className="font-display font-bold text-gray-900">What to expect</h2>
        <ul className="mt-3 space-y-3 text-sm text-gray-600">
          <li className="flex gap-3"><Zap className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" /> You get matched with a real user the moment someone is around.</li>
          <li className="flex gap-3"><EyeOff className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" /> You appear as {user?.anonymousName} — your email is never shown.</li>
          <li className="flex gap-3"><ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" /> End, block or report any chat in one tap. Be kind and stay safe. 💜</li>
        </ul>
      </Card>
    </div>
  )
}
