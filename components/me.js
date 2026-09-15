'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Pencil, LogOut, ShieldCheck, ScrollText, LifeBuoy, Flag, UserX, Loader2, Copy, Check, Camera,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'
import { Avatar, formatId } from './ui-bits'

const REPORT_REASONS = ['spam', 'harassment', 'abuse', 'threats', 'sexual_content', 'scam', 'fake_account', 'other']

export default function Me() {
  const { user, setUser, logout, setAvailable, openAuth } = useApp()
  const [profile, setProfile] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [bioDraft, setBioDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [blocked, setBlocked] = useState([])
  const [infoOpen, setInfoOpen] = useState(null) // 'terms' | 'privacy' | 'help'
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState('other')
  const [reportNote, setReportNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarRef = useRef(null)

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(u.userNumber || u.anonymousName))
    } catch {}
    setCopied(true)
    toast.success('Your ID is copied! Share it so friends can add you.')
    setTimeout(() => setCopied(false), 1800)
  }

  const onPickAvatar = async (e) => {
    const f = e.target.files && e.target.files[0]
    if (avatarRef.current) avatarRef.current.value = ''
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB.'); return }
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('image', f)
      const r = await api('/api/me/avatar', { method: 'POST', formData: fd })
      setUser(r.user)
      setProfile((p) => (p ? { ...p, user: r.user } : p))
      toast.success('Profile picture updated ✨')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const load = async () => {
    try {
      const r = await api('/api/me/profile')
      setProfile(r)
      setUser(r.user)
    } catch (e) {
      toast.error(e.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const available = user?.availableToChat !== false

  const saveProfile = async () => {
    setSaving(true)
    try {
      const r = await api('/api/me/profile', { method: 'PATCH', body: { anonymousName: nameDraft, bio: bioDraft } })
      setUser(r.user)
      setEditOpen(false)
      toast.success('Profile updated ✨')
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const loadBlocked = async () => {
    try {
      const r = await api('/api/me/blocked')
      setBlocked(r.blocked || [])
    } catch (e) {
      toast.error(e.message)
    }
  }

  const unblock = async (id) => {
    try {
      await api(`/api/block/${id}`, { method: 'DELETE' })
      toast.success('User unblocked')
      loadBlocked()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const submitProblem = async () => {
    try {
      await api('/api/report', { method: 'POST', body: { category: reportCategory, description: reportNote } })
      setReportOpen(false)
      setReportNote('')
      toast.success('Report received. Thank you!')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const u = profile ? profile.user : user
  if (!u) return null

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold text-gray-900">Me</h1>

      {/* profile card */}
      <Card className="rounded-3xl p-6 text-center shadow-sm">
        <div className="relative mx-auto w-fit">
          <Avatar user={u} size="xl" className="mx-auto" online={null} />
          <button
            onClick={() => avatarRef.current && avatarRef.current.click()}
            disabled={uploadingAvatar}
            aria-label="Change profile picture"
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-pink-500 text-white shadow-md ring-2 ring-white transition hover:scale-105 disabled:opacity-60"
          >
            {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={avatarRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onPickAvatar}
            aria-hidden="true"
          />
        </div>
        <h2 className="font-display mt-3 text-xl font-extrabold text-gray-900">{u.anonymousName}</h2>
        <button
          onClick={copyId}
          className="mx-auto mt-2 flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Copy your unique ID"
        >
          <span className="font-mono">{formatId(u.userNumber)}</span>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy ID'}
        </button>
        <p className="mt-2 text-xs text-gray-400">Share your ID number so friends can search and add you.</p>
        {u.bio ? <p className="mt-1 text-sm text-gray-600">{u.bio}</p> : <p className="mt-1 text-sm italic text-gray-400">No bio yet</p>}
        <Button
          variant="outline"
          onClick={() => {
            setNameDraft(u.anonymousName)
            setBioDraft(u.bio || '')
            setEditOpen(true)
          }}
          className="mt-4 h-10 rounded-full"
        >
          <Pencil className="mr-2 h-4 w-4" /> Edit profile
        </Button>
        {profile && (
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-violet-50 py-3">
              <p className="font-display text-lg font-extrabold text-violet-700">{profile.stats.friends}</p>
              <p className="text-xs text-gray-500">Friends</p>
            </div>
            <div className="rounded-2xl bg-pink-50 py-3">
              <p className="font-display text-lg font-extrabold text-pink-600">{profile.stats.chats}</p>
              <p className="text-xs text-gray-500">Chats</p>
            </div>
            <div className="rounded-2xl bg-amber-50 py-3">
              <p className="font-display text-lg font-extrabold text-amber-600">{profile.stats.posts}</p>
              <p className="text-xs text-gray-500">Posts</p>
            </div>
          </div>
        )}
        {profile && <p className="mt-4 text-xs text-gray-400">Signed in as {profile.email}</p>}
      </Card>

      {/* settings */}
      <Card className="divide-y divide-border rounded-3xl shadow-sm">
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-semibold text-gray-900">Available to chat</p>
            <p className="text-xs text-gray-500">Receive random chat invites. You accept or decline.</p>
          </div>
          <Switch checked={available} onCheckedChange={setAvailable} aria-label="Available to chat" className="data-[state=checked]:bg-emerald-500" />
        </div>
        <button onClick={() => { setBlockedOpen(true); loadBlocked() }} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserX className="h-5 w-5 text-gray-400" />
          <span className="flex-1 font-medium text-gray-900">Blocked users</span>
          <span className="text-gray-400">›</span>
        </button>
        <button onClick={() => setReportOpen(true)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Flag className="h-5 w-5 text-gray-400" />
          <span className="flex-1 font-medium text-gray-900">Report a Problem</span>
          <span className="text-gray-400">›</span>
        </button>
        <button onClick={() => setInfoOpen('help')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LifeBuoy className="h-5 w-5 text-gray-400" />
          <span className="flex-1 font-medium text-gray-900">Help & Support</span>
          <span className="text-gray-400">›</span>
        </button>
        <button onClick={() => setInfoOpen('privacy')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ShieldCheck className="h-5 w-5 text-gray-400" />
          <span className="flex-1 font-medium text-gray-900">Privacy Policy</span>
          <span className="text-gray-400">›</span>
        </button>
        <button onClick={() => setInfoOpen('terms')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ScrollText className="h-5 w-5 text-gray-400" />
          <span className="flex-1 font-medium text-gray-900">Terms</span>
          <span className="text-gray-400">›</span>
        </button>
      </Card>

      <Button
        variant="outline"
        onClick={logout}
        className="w-full h-12 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <LogOut className="mr-2 h-4 w-4" /> Log out
      </Button>

      {/* edit profile */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-left">Edit profile</DialogTitle>
            <DialogDescription className="text-left">Choose any display name you like. Your ID number stays the same.</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Display name</label>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={24} aria-label="Display name" className="h-11 rounded-xl" placeholder="Your name (letters & numbers)" />
              <p className="mt-1 text-xs text-gray-400">Your permanent ID: <span className="font-mono font-semibold text-violet-600">{formatId(u.userNumber)}</span></p>
            </div>
            <Textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} maxLength={160} aria-label="Bio" className="rounded-2xl" placeholder="A one-line bio (optional)" />
            <Button onClick={saveProfile} disabled={saving} className="w-full h-11 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* blocked users */}
      <Dialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-left">Blocked users</DialogTitle>
            <DialogDescription className="text-left">Blocked people can never be matched with you again.</DialogDescription>
          </DialogHeader>
          {blocked.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">You have not blocked anyone. 💚</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {blocked.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                  <Avatar user={b} size="sm" online={null} />
                  <span className="flex-1 truncate font-medium text-gray-900">{b.anonymousName}</span>
                  <Button size="sm" variant="outline" onClick={() => unblock(b.id)} className="h-8 rounded-full">
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* info dialogs */}
      <Dialog open={infoOpen !== null} onOpenChange={(o) => !o && setInfoOpen(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          {infoOpen === 'terms' && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-left">Terms</DialogTitle>
              </DialogHeader>
              <div className="max-h-80 space-y-2 overflow-y-auto text-sm text-gray-600">
                <p>Talk to Strangers connects real, registered users for friendly conversations.</p>
                <p>• Be kind. Harassment, threats, sexual content and spam are not allowed and can get you banned.</p>
                <p>• You must be 18+ or have a guardian's permission.</p>
                <p>• Don't share passwords, OTPs, banking details or other private information with strangers.</p>
                <p>• We may remove content and accounts that break these rules. Chats are retained until you delete them or after 90 days of inactivity, whichever comes first.</p>
              </div>
            </>
          )}
          {infoOpen === 'privacy' && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-left">Privacy Policy</DialogTitle>
              </DialogHeader>
              <div className="max-h-80 space-y-2 overflow-y-auto text-sm text-gray-600">
                <p>Your privacy comes first:</p>
                <p>• Chats are anonymous — other users only ever see your anonymous name and avatar colour.</p>
                <p>• Your email and password are never shown to other users.</p>
                <p>• Messages are stored securely and retained until you delete the chat or after 90 days of inactivity.</p>
                <p>• Screenshots cannot be fully prevented in a web browser — please avoid sharing anything sensitive.</p>
                <p>• You can block or report anyone, and delete your chats at any time.</p>
              </div>
            </>
          )}
          {infoOpen === 'help' && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-left">Help & Support</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• To start a chat: go Home and tap "Find Your Random Friend".</p>
                <p>• Nobody around? Tap "Notify Me" and we will ping you when someone arrives.</p>
                <p>• You can end, block or report from the ⋮ menu in any chat.</p>
                <p>• Found a bug or something that feels unsafe? Use "Report a Problem" below.</p>
                <p>• Password reset via email is coming soon.</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* report a problem */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-left">Report a Problem</DialogTitle>
            <DialogDescription className="text-left">Tell us what went wrong. We read every report.</DialogDescription>
          </DialogHeader>
          <div className="mt-1 flex flex-wrap gap-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReportCategory(r)}
                aria-pressed={reportCategory === r}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  reportCategory === r ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-border text-gray-600'
                }`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>
          <Textarea
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            placeholder="Describe the problem (optional)"
            className="mt-2 rounded-2xl"
            maxLength={1000}
          />
          <Button onClick={submitProblem} className="mt-2 h-11 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold">
            Submit
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
