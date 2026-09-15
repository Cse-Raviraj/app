'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Heart, MessageCircle, ImagePlus, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { useApp } from './app-context'
import { Avatar, timeAgo, shortTime } from './ui-bits'

export default function Feed() {
  const { user } = useApp()
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [posting, setPosting] = useState(false)
  const [openComments, setOpenComments] = useState(null)
  const [comments, setComments] = useState([])
  const [commentDraft, setCommentDraft] = useState('')
  const fileRef = useRef(null)

  const load = async (p = 1) => {
    try {
      const r = await api(`/api/posts?page=${p}`)
      setPosts((prev) => (p === 1 ? r.posts : [...prev, ...r.posts]))
      setHasMore(r.hasMore)
      setPage(p)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
  }, [])

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const clearFile = () => {
    setFile(null)
    setPreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async () => {
    if (!draft.trim() && !file) return
    setPosting(true)
    try {
      const fd = new FormData()
      fd.append('text', draft)
      if (file) fd.append('image', file)
      const r = await api('/api/posts', { method: 'POST', formData: fd })
      setPosts((p) => [r.post, ...p])
      setDraft('')
      clearFile()
      toast.success('Posted! 🎉')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPosting(false)
    }
  }

  const like = async (post) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p
      )
    )
    try {
      await api(`/api/posts/${post.id}/like`, { method: 'POST' })
    } catch (e) {
      toast.error(e.message)
      load(page)
    }
  }

  const toggleComments = async (post) => {
    if (openComments === post.id) {
      setOpenComments(null)
      return
    }
    setOpenComments(post.id)
    try {
      const r = await api(`/api/posts/${post.id}/comments`)
      setComments(r.comments || [])
    } catch (e) {
      toast.error(e.message)
    }
  }

  const addComment = async (post) => {
    const text = commentDraft.trim()
    if (!text) return
    try {
      const r = await api(`/api/posts/${post.id}/comments`, { method: 'POST', body: { text } })
      setComments((c) => [...c, r.comment])
      setCommentDraft('')
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, commentCount: p.commentCount + 1 } : p)))
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold text-gray-900">Feed</h1>

      {/* composer */}
      <Card className="rounded-3xl p-4 shadow-sm">
        <div className="flex gap-3">
          <Avatar user={user} size="sm" />
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share something with the community..."
            className="min-h-[60px] rounded-2xl border-0 bg-gray-50 focus-visible:ring-1"
            maxLength={1000}
            aria-label="Write a post"
          />
        </div>
        {preview && (
          <div className="relative mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected preview" className="max-h-56 rounded-2xl object-cover" />
            <button
              onClick={clearFile}
              aria-label="Remove selected image"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
            >
              ✕
            </button>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => fileRef.current && fileRef.current.click()}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Add a photo"
          >
            <ImagePlus className="h-4 w-4" /> Photo
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickFile} aria-hidden="true" />
          <Button
            onClick={submit}
            disabled={posting || (!draft.trim() && !file)}
            className="h-10 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 px-6 text-white font-bold"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
          </Button>
        </div>
      </Card>

      {/* posts */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-32 animate-pulse rounded-3xl bg-gray-100" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card className="rounded-3xl p-10 text-center shadow-sm">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-violet-50 text-4xl">📝</div>
          <h2 className="font-display mt-4 text-xl font-extrabold text-gray-900">No posts yet</h2>
          <p className="mt-1 text-sm text-gray-500">Be the very first to share something!</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id} className="rounded-3xl p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Avatar user={post.author} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{post.author ? post.author.anonymousName : 'Anonymous'}</p>
                  <p className="text-xs text-gray-400" title={new Date(post.createdAt).toLocaleString()}>{timeAgo(post.createdAt)}</p>
                </div>
              </div>
              {post.text && <p className="mt-3 whitespace-pre-wrap break-words text-[15px] text-gray-800">{post.text}</p>}
              {post.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={post.image} alt="Post image" loading="lazy" className="mt-3 max-h-96 w-full rounded-2xl object-cover" />
              )}
              <div className="mt-4 flex items-center gap-5">
                <button
                  onClick={() => like(post)}
                  aria-label={post.likedByMe ? 'Unlike post' : 'Like post'}
                  aria-pressed={post.likedByMe}
                  className={`flex items-center gap-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full px-2 py-1 ${post.likedByMe ? 'text-pink-600' : 'text-gray-500 hover:text-pink-600'}`}
                >
                  <Heart className={`h-5 w-5 ${post.likedByMe ? 'fill-current' : ''}`} /> {post.likeCount}
                </button>
                <button
                  onClick={() => toggleComments(post)}
                  aria-label="View comments"
                  aria-expanded={openComments === post.id}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full px-2 py-1"
                >
                  <MessageCircle className="h-5 w-5" /> {post.commentCount}
                </button>
              </div>

              {openComments === post.id && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  {comments.length === 0 && <p className="text-sm text-gray-400">No comments yet. Say something nice!</p>}
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <Avatar user={c.author} size="xs" />
                      <div className="min-w-0 flex-1 rounded-2xl bg-gray-50 px-3 py-2">
                        <p className="text-xs font-semibold text-gray-900">
                          {c.author ? c.author.anonymousName : 'Anonymous'}
                          <span className="ml-2 font-normal text-gray-400">{shortTime(c.createdAt)}</span>
                        </p>
                        <p className="break-words text-sm text-gray-700">{c.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addComment(post)}
                      placeholder="Write a comment..."
                      aria-label="Write a comment"
                      maxLength={500}
                      className="h-10 flex-1 rounded-full"
                    />
                    <Button size="icon" onClick={() => addComment(post)} aria-label="Send comment" className="h-10 w-10 rounded-full bg-violet-600 text-white">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {hasMore && (
            <div className="pt-2 text-center">
              <Button variant="outline" onClick={() => load(page + 1)} className="rounded-full">
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
