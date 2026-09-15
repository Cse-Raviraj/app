'use client'

import { useEffect, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from './app-context'
import { Avatar } from './ui-bits'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function CallOverlay() {
  const { call, acceptCall, rejectCall, hangup, toggleMute } = useApp()
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (call && call.state === 'active') {
      setSeconds(0)
      const t = setInterval(() => setSeconds((s) => s + 1), 1000)
      return () => clearInterval(t)
    }
  }, [call && call.state])

  if (!call) return null

  const peer = call.peer
  const status =
    call.state === 'incoming' ? 'Incoming voice call' :
    call.state === 'outgoing' ? 'Calling…' :
    fmt(seconds)

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-b from-violet-700 via-fuchsia-700 to-pink-700 px-6 py-16 text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative">
          <span className="absolute inset-0 -m-3 rounded-full bg-white/20 blur-xl animate-pulse" aria-hidden="true" />
          <Avatar user={peer} size="xl" online={null} className="relative" />
        </div>
        <div className="text-center">
          <h2 className="font-display text-2xl font-extrabold">{peer ? peer.anonymousName : 'Friend'}</h2>
          <p className="mt-1 flex items-center justify-center gap-2 text-white/80">
            {call.state === 'active' && <span className="h-2 w-2 rounded-full bg-emerald-300" />}
            {status}
          </p>
          <p className="mt-4 text-xs text-white/60">🔒 Voice calls are peer-to-peer and private.</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        {call.state === 'incoming' ? (
          <>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={rejectCall}
                aria-label="Decline call"
                className="h-16 w-16 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-xs text-white/80">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={acceptCall}
                aria-label="Accept call"
                className="h-16 w-16 rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600"
              >
                <Phone className="h-6 w-6" />
              </Button>
              <span className="text-xs text-white/80">Accept</span>
            </div>
          </>
        ) : (
          <>
            {call.state === 'active' && (
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={toggleMute}
                  aria-label={call.muted ? 'Unmute' : 'Mute'}
                  className={`h-14 w-14 rounded-full shadow-lg ${call.muted ? 'bg-white text-violet-700 hover:bg-white/90' : 'bg-white/20 text-white hover:bg-white/30'}`}
                >
                  {call.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <span className="text-xs text-white/80">{call.muted ? 'Unmute' : 'Mute'}</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={hangup}
                aria-label="End call"
                className="h-16 w-16 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-xs text-white/80">{call.state === 'outgoing' ? 'Cancel' : 'End'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
