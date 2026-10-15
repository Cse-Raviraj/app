'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, SearchX, Sparkles } from 'lucide-react'
import { useApp } from './app-context'

const MESSAGES = [
  'Looking for someone interesting...',
  'Finding a random friend...',
  'Almost there...',
  'Checking who is around...',
]

export default function Finding() {
  const { finding, cancelFinding, notifyMe, connectNow } = useApp()
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    if (finding !== 'searching') return
    setMsgIdx(0)
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 2200)
    return () => clearInterval(t)
  }, [finding])

  if (!finding) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-violet-600 via-violet-500 to-pink-500 px-6 text-center text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Finding someone for you"
    >
      {finding === 'searching' && (
        <>
          <div className="relative mb-10 h-28 w-28">
            {[0, 0.6, 1.2].map((delay) => (
              <span
                key={delay}
                className="absolute inset-0 rounded-full bg-white/30 animate-ping-slow"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
            <div className="absolute inset-2 grid place-items-center rounded-full bg-white text-5xl shadow-2xl">👋</div>
          </div>
          <h2 className="font-display text-3xl font-extrabold">Finding someone for you...</h2>
          <p key={msgIdx} className="animate-fade-up mt-3 text-white/85" aria-live="polite">{MESSAGES[msgIdx]}</p>
          <Button
            variant="ghost"
            onClick={cancelFinding}
            className="mt-12 rounded-full px-8 text-white hover:bg-white/15 hover:text-white focus-visible:ring-white"
          >
            Cancel
          </Button>
        </>
      )}

      {finding === 'nobody' && (
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-gray-900">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-violet-50 text-4xl">☕</div>
          <h2 className="font-display mt-4 text-2xl font-extrabold">Nobody is available right now</h2>
          <p className="mt-2 text-sm text-gray-600">Don't worry. We'll let you know when someone is ready to chat.</p>
          <Button
            onClick={notifyMe}
            className="mt-6 w-full h-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold"
          >
            <Bell className="mr-2 h-4 w-4" /> Notify Me
          </Button>
          <Button onClick={connectNow} variant="outline" className="mt-2 w-full h-12 rounded-full">
            Try again
          </Button>
          <Button onClick={cancelFinding} variant="ghost" className="mt-2 w-full rounded-full text-gray-500">
            Back home
          </Button>
        </div>
      )}

      {finding === 'waiting' && (
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-gray-900">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-violet-50 text-4xl">🔔</div>
          <h2 className="font-display mt-4 text-2xl font-extrabold">You're on the list!</h2>
          <p className="mt-2 text-sm text-gray-600">The moment someone becomes available, we'll ping you here.</p>
          <Button onClick={cancelFinding} variant="outline" className="mt-6 w-full h-12 rounded-full">
            Stop waiting
          </Button>
        </div>
      )}

      {finding === 'someone' && (
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-gray-900">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-4xl">🎉</div>
          <h2 className="font-display mt-4 text-2xl font-extrabold">Someone just showed up!</h2>
          <p className="mt-2 text-sm text-gray-600">A real person is available right now. Say hello?</p>
          <Button
            onClick={connectNow}
            className="mt-6 w-full h-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold"
          >
            <Sparkles className="mr-2 h-4 w-4" /> Say hello
          </Button>
          <Button onClick={cancelFinding} variant="ghost" className="mt-2 w-full rounded-full text-gray-500">
            Not now
          </Button>
        </div>
      )}
    </div>
  )
}
