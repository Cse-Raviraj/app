'use client'

import { useEffect, useState } from 'react'
import { MessageCircleHeart, UserCheck, EyeOff, Zap, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from './app-context'

const STEPS = [
  { emoji: '👆', title: 'Tap the button', text: 'Press "Find Your Random Friend" — that is all.' },
  { emoji: '🤝', title: 'Meet a real person', text: 'We look for a real, available user. Never bots, never fakes.' },
  { emoji: '💬', title: 'Chat instantly', text: 'Talk live, stay anonymous, and add them as a friend if you click.' },
]

const FEATURES = [
  { icon: UserCheck, title: 'Real people only', text: 'Every chat is with a verified user of the app. No AI. No bots.' },
  { icon: EyeOff, title: 'Anonymous identity', text: 'You get a fun secret name like RandomFriend_4821. Your email stays private.' },
  { icon: Zap, title: 'Instant & live', text: 'Messages arrive in real time with typing and read receipts.' },
  { icon: ShieldCheck, title: 'Safe by design', text: 'Block or report anyone in one tap. We never show your private info.' },
]

export default function Landing() {
  const { startFinding, openAuth } = useApp()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/stats')
        const d = await res.json()
        if (alive) setStats(d)
      } catch {}
    }
    load()
    const t = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const online = stats ? stats.online : 0

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-b from-violet-100 via-white to-rose-50">
      {/* decorative blobs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-pink-300/40 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-fuchsia-200/50 blur-3xl" />
        <div className="absolute top-24 left-10 text-3xl animate-float select-none" style={{ animationDelay: '0.3s' }}>💬</div>
        <div className="absolute top-40 right-16 text-3xl animate-float select-none" style={{ animationDelay: '1.2s' }}>👋</div>
        <div className="absolute bottom-40 left-16 text-3xl animate-float select-none" style={{ animationDelay: '2s' }}>✨</div>
      </div>

      {/* mini header */}
      <header className="relative z-10 mx-auto max-w-5xl px-5 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display font-extrabold text-gray-900">
          <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-pink-500 text-white grid place-items-center shadow-sm">
            <MessageCircleHeart className="h-5 w-5" />
          </span>
          Talk to Strangers
        </div>
        <button
          onClick={() => openAuth('login')}
          className="rounded-full px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Log in
        </button>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-5 pb-16 text-center">
        {/* hero */}
        <section className="pt-10 md:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-4 py-1.5 text-xs font-semibold text-violet-700 shadow-sm">
            Real people • Real conversations • No bots
          </span>
          <h1 className="font-display mt-6 text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900">
            Talk to{' '}
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              Strangers
            </span>
          </h1>
          <p className="mt-4 text-xl md:text-2xl font-semibold text-gray-800">Meet someone new. Talk freely. Stay anonymous.</p>
          <p className="mt-2 text-base text-gray-600 max-w-md mx-auto">
            Connect with a real person from anywhere and start a random conversation.
          </p>

          <div className="mt-9">
            <Button
              onClick={startFinding}
              className="h-16 px-10 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white text-lg font-bold shadow-xl shadow-violet-300/60 hover:scale-[1.03] active:scale-95 transition-transform"
            >
              Find Your Random Friend
            </Button>
          </div>

          <div className="mt-5 h-6" aria-live="polite">
            {online > 0 ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                {online} {online === 1 ? 'person is' : 'people are'} online right now
              </span>
            ) : (
              <span className="text-sm text-gray-500">Be the first to jump in today 🚀</span>
            )}
          </div>
        </section>

        {/* how it works */}
        <section className="mt-16">
          <h2 className="font-display text-2xl font-extrabold text-gray-900">How it works</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-3xl border border-border bg-white/85 p-6 text-left shadow-sm backdrop-blur">
                <div className="text-3xl">{s.emoji}</div>
                <h3 className="mt-3 font-display font-bold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* features */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-extrabold text-gray-900">Why you will like it here</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 text-left">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4 rounded-3xl border border-border bg-white/85 p-5 shadow-sm backdrop-blur">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display font-bold text-gray-900">{f.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-600">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* final CTA */}
        <section className="mt-16 rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 p-10 text-white shadow-xl">
          <h2 className="font-display text-3xl font-extrabold">Someone out there wants to chat</h2>
          <p className="mt-2 text-white/85">It takes one tap. Your identity stays yours.</p>
          <Button
            onClick={startFinding}
            className="mt-6 h-14 px-9 rounded-full bg-white text-violet-700 text-base font-bold shadow-lg hover:scale-[1.03] active:scale-95 transition-transform"
          >
            Find Your Random Friend
          </Button>
        </section>

        <footer className="mt-12 text-xs text-gray-500">
          © {new Date().getFullYear()} Talk to Strangers • Be kind. Stay safe. Report anything that feels wrong.
        </footer>
      </main>
    </div>
  )
}
