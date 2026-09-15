'use client'

import { Home, MessagesSquare, Newspaper, Users, User, MessageCircleHeart } from 'lucide-react'
import { useApp } from './app-context'
import { Avatar } from './ui-bits'

const ITEMS = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'chats', icon: MessagesSquare, label: 'Chats' },
  { id: 'feed', icon: Newspaper, label: 'Feed' },
  { id: 'me', icon: User, label: 'Me' },
]

function NavButton({ item, active, onClick, badge }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? 'text-violet-600' : 'text-gray-500 hover:text-gray-800'
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
      <span>{item.label}</span>
      {badge > 0 && (
        <span className="absolute top-0.5 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold grid place-items-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

export function TopNav() {
  const { user, stats, screen, setScreen, unreadTotal } = useApp()
  const items = [...ITEMS, { id: 'communities', icon: Users, label: 'Communities' }]
  return (
    <header className="sticky top-0 z-40 hidden md:block border-b border-border bg-white/85 backdrop-blur">
      <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => setScreen('home')}
          className="flex items-center gap-2.5 font-display font-extrabold text-lg text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-pink-500 text-white grid place-items-center shadow-sm">
            <MessageCircleHeart className="h-5 w-5" />
          </span>
          Talk to Strangers
        </button>
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {items.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={screen === item.id}
              onClick={() => setScreen(item.id)}
              badge={item.id === 'chats' ? unreadTotal : 0}
            />
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {stats.online > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {stats.online} online
            </span>
          )}
          <button
            onClick={() => setScreen('me')}
            aria-label="Open profile"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar user={user} size="sm" online={true} />
          </button>
        </div>
      </div>
    </header>
  )
}

export function BottomNav() {
  const { screen, setScreen, unreadTotal, user } = useApp()
  if (!user) return null
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-4 max-w-lg mx-auto py-1.5">
        {ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={screen === item.id}
            onClick={() => setScreen(item.id)}
            badge={item.id === 'chats' ? unreadTotal : 0}
          />
        ))}
      </div>
    </nav>
  )
}
