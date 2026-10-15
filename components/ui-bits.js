'use client'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export function timeAgo(d) {
  if (!d) return ''
  return dayjs(d).fromNow()
}

export function shortTime(d) {
  if (!d) return ''
  const t = dayjs(d)
  if (t.isSame(dayjs(), 'day')) return t.format('HH:mm')
  if (t.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday'
  return t.format('DD MMM')
}

export function clockTime(d) {
  if (!d) return ''
  return dayjs(d).format('HH:mm')
}

export function formatId(n) {
  if (n === null || n === undefined || n === '') return ''
  return '#' + String(n)
}

export function Avatar({ user, size = 'md', online = null, className = '' }) {
  const sizes = {
    xs: 'h-7 w-7 text-[11px]',
    sm: 'h-9 w-9 text-sm',
    md: 'h-11 w-11 text-base',
    lg: 'h-16 w-16 text-2xl',
    xl: 'h-24 w-24 text-4xl',
  }
  const name = (user && user.anonymousName) || '?'
  const initial = name.charAt(0).toUpperCase()
  const color = (user && user.avatarColor) || '#7C3AED'
  const avatarUrl = user && user.avatarUrl
  const dot = size === 'lg' || size === 'xl' ? 'h-4 w-4' : 'h-2.5 w-2.5'
  return (
    <div className={`relative shrink-0 ${className}`}>
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizes[size]} rounded-full object-cover shadow-sm select-none`}
        />
      ) : (
        <div
          className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white shadow-sm select-none`}
          style={{ background: `linear-gradient(135deg, ${color}, ${color}B3)` }}
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
      {online !== null && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-gray-300'} ${dot}`}
          title={online ? 'Online' : 'Offline'}
        >
          <span className="sr-only">{online ? 'Online' : 'Offline'}</span>
        </span>
      )}
    </div>
  )
}

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-1" role="status" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}
