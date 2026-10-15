'use client'

import { useState } from 'react'
import { MessageCircleHeart } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'

export default function AuthModal() {
  const { authOpen, setAuthOpen, authTab, setAuthTab, auth } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState('prefer-not-to-say')
  const [otp, setOtp] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [forgotStep, setForgotStep] = useState('email')

  const resetForm = () => {
    setError('')
    setResetMessage('')
    setPassword('')
    setConfirmPassword('')
    setOtp('')
    setEmail('')
    setGender('prefer-not-to-say')
    setForgotStep('email')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isForgotPassword) {
        if (forgotStep === 'email') {
          const res = await api('/api/auth/request-reset-otp', { method: 'POST', body: { email } })
          setResetMessage(res.message)
          setForgotStep('verify')
          setPassword('')
          setConfirmPassword('')
          setOtp('')
          return
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }

        const verifyRes = await api('/api/auth/verify-reset-otp', { method: 'POST', body: { email, otp } })
        if (!verifyRes.verified) throw new Error('OTP verification failed.')

        const res = await api('/api/auth/reset-password', { method: 'POST', body: { email, otp, password } })
        setResetMessage(res.message)
        setForgotStep('email')
        setIsForgotPassword(false)
        setAuthTab('login')
        setPassword('')
        setConfirmPassword('')
        setOtp('')
        return
      }

      if (authTab === 'signup') {
        await auth(authTab, email, password, gender)
      } else {
        await auth(authTab, email, password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isSignup = authTab === 'signup'

  return (
    <Dialog open={authOpen} onOpenChange={(open) => {
      setAuthOpen(open)
      if (!open) {
        resetForm()
        setIsForgotPassword(false)
      }
    }}>
      <DialogContent className="rounded-3xl max-w-sm p-0 overflow-hidden gap-0">
        <div className="bg-gradient-to-br from-violet-600 to-pink-500 p-6 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20">
            <MessageCircleHeart className="h-6 w-6" />
          </span>
          <DialogHeader className="mt-3">
            <DialogTitle className="font-display text-xl text-white text-left">
              {isForgotPassword ? 'Reset your password' : isSignup ? 'Create your free account' : 'Welcome back'}
            </DialogTitle>
            <DialogDescription className="text-white/85 text-sm text-left">
              {isForgotPassword
                ? forgotStep === 'email'
                  ? 'Enter your email to receive a verification code.'
                  : 'Verify your code, then choose a new password.'
                : isSignup
                  ? 'Just an email and password — we will give you a fun anonymous name.'
                  : 'Log in and find your random friend.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6">
          {!isForgotPassword && (
            <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1" role="tablist">
              {['signup', 'login'].map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={authTab === tab}
                  onClick={() => {
                    setAuthTab(tab)
                    setError('')
                    setPassword('')
                    setGender('prefer-not-to-say')
                  }}
                  className={`h-9 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    authTab === tab ? 'bg-white shadow text-violet-700' : 'text-gray-500'
                  }`}
                >
                  {tab === 'signup' ? 'Sign Up' : 'Log in'}
                </button>
              ))}
            </div>
          )}

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

            {!isForgotPassword && isSignup && (
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label="Gender"
              >
                <option value="prefer-not-to-say">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
              </select>
            )}

            {isForgotPassword && forgotStep === 'verify' && (
              <>
                <Input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  aria-label="OTP code"
                  className="h-11 rounded-xl"
                />
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="New password"
                  className="h-11 rounded-xl"
                />
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-label="Confirm new password"
                  className="h-11 rounded-xl"
                />
              </>
            )}

            {!isForgotPassword && (
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
            )}

            {error && (
              <p className="text-sm text-red-600" role="alert">{error}</p>
            )}

            {resetMessage && (
              <p className="text-sm text-emerald-600" role="status">{resetMessage}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold text-base"
            >
              {loading
                ? 'One moment…'
                : isForgotPassword
                  ? forgotStep === 'email'
                    ? 'Send OTP'
                    : 'Verify & update password'
                  : isSignup
                    ? 'Create account'
                    : 'Log in'}
            </Button>
          </form>

          {!isForgotPassword && !isSignup && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(true)
                setForgotStep('email')
                setError('')
                setResetMessage('')
                setPassword('')
                setConfirmPassword('')
                setOtp('')
              }}
              className="mt-4 block w-full text-center text-sm font-medium text-violet-600 hover:text-violet-700"
            >
              Forgot password?
            </button>
          )}

          {isForgotPassword && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false)
                setForgotStep('email')
                setError('')
                setResetMessage('')
                setPassword('')
                setConfirmPassword('')
                setOtp('')
                setAuthTab('login')
              }}
              className="mt-4 block w-full text-center text-sm font-medium text-violet-600 hover:text-violet-700"
            >
              Back to log in
            </button>
          )}

          <p className="mt-4 text-center text-xs text-gray-500">
            Your identity stays anonymous in chats. Be kind, and never share private details with strangers.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
