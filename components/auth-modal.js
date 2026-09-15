'use client'

import { useState } from 'react'
import { MessageCircleHeart } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApp } from './app-context'

export default function AuthModal() {
  const { authOpen, setAuthOpen, authTab, setAuthTab, auth } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await auth(authTab, email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isSignup = authTab === 'signup'

  return (
    <Dialog open={authOpen} onOpenChange={setAuthOpen}>
      <DialogContent className="rounded-3xl max-w-sm p-0 overflow-hidden gap-0">
        <div className="bg-gradient-to-br from-violet-600 to-pink-500 p-6 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20">
            <MessageCircleHeart className="h-6 w-6" />
          </span>
          <DialogHeader className="mt-3">
            <DialogTitle className="font-display text-xl text-white text-left">
              {isSignup ? 'Create your free account' : 'Welcome back'}
            </DialogTitle>
            <DialogDescription className="text-white/85 text-sm text-left">
              {isSignup
                ? 'Just an email and password — we will give you a fun anonymous name.'
                : 'Log in and find your random friend.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1" role="tablist">
            {['signup', 'login'].map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={authTab === tab}
                onClick={() => setAuthTab(tab)}
                className={`h-9 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  authTab === tab ? 'bg-white shadow text-violet-700' : 'text-gray-500'
                }`}
              >
                {tab === 'signup' ? 'Sign Up' : 'Log in'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
              className="h-11 rounded-xl"
            />
            <Input
              type="password"
              required
              minLength={6}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              className="h-11 rounded-xl"
            />
            {error && (
              <p className="text-sm text-red-600" role="alert">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold text-base"
            >
              {loading ? 'One moment…' : isSignup ? 'Create account' : 'Log in'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-gray-500">
            Your identity stays anonymous in chats. Be kind, and never share private details with strangers.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
