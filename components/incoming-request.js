'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApp } from './app-context'
import { Avatar } from './ui-bits'

export default function IncomingRequest() {
  const { incomingRequest, acceptRequest, declineRequest } = useApp()
  const [left, setLeft] = useState(30)

  useEffect(() => {
    if (!incomingRequest) return
    setLeft(incomingRequest.expiresIn || 30)
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [incomingRequest && incomingRequest.requestId])

  if (!incomingRequest) return null
  const from = incomingRequest.from || {}

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="rounded-3xl max-w-sm p-6 text-center" aria-describedby={undefined}>
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 rounded-full bg-violet-200 animate-ping" aria-hidden="true" />
          <Avatar user={from} size="lg" className="relative" />
        </div>
        <h2 className="font-display mt-4 text-2xl font-extrabold text-gray-900">Someone wants to talk to you</h2>
        <p className="mt-1 text-sm text-gray-600">{from.anonymousName || 'Someone'} is looking for a random friend.</p>
        <p className="mt-1 text-xs text-gray-400">Request expires in {left}s</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12 rounded-full" onClick={() => declineRequest(incomingRequest.requestId)}>
            Decline
          </Button>
          <Button
            className="h-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold"
            onClick={() => acceptRequest(incomingRequest.requestId)}
          >
            Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
