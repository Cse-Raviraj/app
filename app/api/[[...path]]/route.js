import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { getDb, generateUserNumber } from '@/lib/db.cjs'
import { COOKIE_NAME, signToken, verifyToken, getTokenFromRequest } from '@/lib/auth.cjs'
import { getSharedState } from '@/lib/realtime-state.cjs'

const S = getSharedState()

// ---------- helpers ----------
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

function json(data, status = 200) {
  return handleCORS(NextResponse.json(data, { status }))
}
function err(message, status = 400, code) {
  return json({ error: message, ...(code ? { code } : {}) }, status)
}

function publicUser(u) {
  if (!u) return null
  return { id: u.id, anonymousName: u.anonymousName, userNumber: u.userNumber || null, avatarColor: u.avatarColor || '#7C3AED', avatarUrl: u.avatarUrl || null, bio: u.bio || '' }
}
function publicConv(c) {
  return { id: c.id, type: c.type, participants: c.participants, status: c.status, endedBy: c.endedBy || null, createdAt: c.createdAt, updatedAt: c.updatedAt }
}
const pairKey = (a, b) => [a, b].sort().join('|')

const NAME_PREFIXES = ['RandomFriend', 'Stranger', 'Anonymous', 'Wanderer', 'Dreamer', 'NightOwl', 'SunnySoul', 'KindHeart', 'StarGazer', 'Chatty', 'Explorer', 'BoldFox', 'CalmWave', 'Smiley', 'FreeSpirit']
const AVATAR_COLORS = ['#7C3AED', '#DB2777', '#EA580C', '#059669', '#0891B2', '#4F46E5', '#C026D3', '#DC2626', '#2563EB', '#D97706']
const REPORT_CATEGORIES = ['spam', 'harassment', 'abuse', 'threats', 'sexual_content', 'scam', 'fake_account', 'other']

function setAuthCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}

async function getUserFromRequest(request, db) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  try {
    const payload = verifyToken(token)
    return await db.collection('users').findOne({ id: payload.userId })
  } catch {
    return null
  }
}

async function hydrateUser(db, userId) {
  let u = S.userCache.get(userId)
  if (!u) {
    u = await db.collection('users').findOne({ id: userId })
    if (u) S.userCache.set(userId, u)
  }
  return u
}

// ---------- AUTH ----------
async function handleSignup(request, db) {
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Please enter a valid email address.')
  if (password.length < 6) return err('Password must be at least 6 characters.')
  const existing = await db.collection('users').findOne({ email })
  if (existing) return err('An account with this email already exists. Try logging in.', 409)

  let anonymousName = null
  for (let i = 0; i < 10 && !anonymousName; i++) {
    const candidate = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)] + Math.floor(100 + Math.random() * 900)
    anonymousName = candidate
  }
  if (!anonymousName) anonymousName = 'Stranger' + uuidv4().slice(0, 4)
  const userNumber = await generateUserNumber(db)

  const user = {
    id: uuidv4(),
    email,
    passwordHash: await bcrypt.hash(password, 10),
    anonymousName,
    userNumber,
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    avatarUrl: null,
    bio: '',
    availableToChat: true,
    online: false,
    createdAt: new Date(),
  }
  await db.collection('users').insertOne(user)
  const token = signToken({ userId: user.id, email: user.email })
  return setAuthCookie(json({ user: publicUser(user) }, 201), token)
}

async function handleLogin(request, db) {
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const user = await db.collection('users').findOne({ email })
  if (!user) return err('Wrong email or password.', 401)
  const ok = await bcrypt.compare(password, user.passwordHash || '')
  if (!ok) return err('Wrong email or password.', 401)
  const token = signToken({ userId: user.id, email: user.email })
  return setAuthCookie(json({ user: publicUser(user) }), token)
}

function handleLogout() {
  const response = json({ ok: true })
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}

async function handleMe(request, db) {
  const user = await getUserFromRequest(request, db)
  if (!user) return err('Please log in.', 401, 'unauthenticated')
  return json({ user: publicUser(user), availableToChat: !!user.availableToChat })
}

// ---------- STATS (real numbers only) ----------
async function handleStats() {
  let available = 0
  for (const uid of S.availableSet) {
    if ((S.online.get(uid)?.size || 0) > 0 && !S.activeChats.has(uid)) available++
  }
  return json({ online: S.online.size, available })
}

// ---------- CONVERSATIONS ----------
async function listConversations(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const convs = await db.collection('conversations').find({ participants: me.id }).sort({ updatedAt: -1 }).limit(100).toArray()
  const out = []
  for (const c of convs) {
    const peerId = (c.participants || []).find((p) => p !== me.id)
    const peerDoc = peerId ? await hydrateUser(db, peerId) : null
    const unread = await db.collection('messages').countDocuments({ conversationId: c.id, senderId: { $ne: me.id }, readBy: { $ne: me.id } })
    out.push({
      id: c.id, type: c.type, status: c.status, endedBy: c.endedBy || null,
      createdAt: c.createdAt, updatedAt: c.updatedAt, lastMessage: c.lastMessage || null,
      peer: publicUser(peerDoc), peerOnline: !!(peerId && (S.online.get(peerId)?.size || 0) > 0), unread,
    })
  }
  return json({ conversations: out })
}

async function getConversationMessages(request, db, convId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const conv = await db.collection('conversations').findOne({ id: convId })
  if (!conv || !conv.participants.includes(me.id)) return err('Conversation not found.', 404)
  const peerId = conv.participants.find((p) => p !== me.id)
  const peerDoc = peerId ? await hydrateUser(db, peerId) : null
  const msgs = await db.collection('messages').find({ conversationId: convId }).sort({ createdAt: 1 }).limit(300).toArray()
  return json({
    conversation: publicConv(conv),
    peer: publicUser(peerDoc),
    peerOnline: !!(peerId && (S.online.get(peerId)?.size || 0) > 0),
    messages: msgs.map((m) => ({ id: m.id, conversationId: m.conversationId, senderId: m.senderId, text: m.text, image: m.image || null, createdAt: m.createdAt, readBy: m.readBy || [] })),
  })
}

async function sendConversationImage(request, db, convId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const conv = await db.collection('conversations').findOne({ id: convId })
  if (!conv || !conv.participants.includes(me.id)) return err('Conversation not found.', 404)
  if (conv.type === 'random' && conv.status !== 'active') return err('This chat has ended.', 400)
  const ct = request.headers.get('content-type') || ''
  if (!ct.includes('multipart/form-data')) return err('Please choose a photo to send.')
  const form = await request.formData()
  const file = form.get('image')
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') return err('Please choose a photo to send.')
  if (file.size > 5 * 1024 * 1024) return err('Image must be under 5MB.')
  const exts = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
  const ext = exts[file.type]
  if (!ext) return err('Only PNG, JPG, WebP or GIF images are allowed.')
  const buf = Buffer.from(await file.arrayBuffer())
  const dir = path.join(process.cwd(), 'public', 'uploads', 'chat')
  fs.mkdirSync(dir, { recursive: true })
  const fname = `${uuidv4()}.${ext}`
  fs.writeFileSync(path.join(dir, fname), buf)
  const imagePath = `/uploads/chat/${fname}`
  const msg = { id: uuidv4(), conversationId: convId, senderId: me.id, text: '', image: imagePath, createdAt: new Date(), readBy: [me.id] }
  await db.collection('messages').insertOne(msg)
  await db.collection('conversations').updateOne(
    { id: convId },
    { $set: { lastMessage: { text: '📷 Photo', senderId: me.id, createdAt: msg.createdAt }, updatedAt: msg.createdAt } }
  )
  const payload = { id: msg.id, conversationId: convId, senderId: me.id, text: '', image: imagePath, createdAt: msg.createdAt, readBy: msg.readBy }
  if (S.io) for (const p of (conv.participants || [])) S.io.to(`user:${p}`).emit('new_message', payload)
  return json({ message: payload }, 201)
}

async function deleteConversation(request, db, convId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const conv = await db.collection('conversations').findOne({ id: convId })
  if (!conv || !conv.participants.includes(me.id)) return err('Conversation not found.', 404)
  await db.collection('conversations').deleteOne({ id: convId })
  await db.collection('messages').deleteMany({ conversationId: convId })
  S.convCache.delete(convId)
  return json({ ok: true })
}

// ---------- BLOCK & REPORT ----------
async function handleBlock(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const body = await request.json().catch(() => ({}))
  const targetId = String(body.userId || '')
  if (!targetId || targetId === me.id) return err('Invalid user to block.')
  await db.collection('blocks').updateOne(
    { blockerId: me.id, blockedId: targetId },
    { $setOnInsert: { id: uuidv4(), blockerId: me.id, blockedId: targetId, createdAt: new Date() } },
    { upsert: true }
  )
  S.blockedPairs.add(pairKey(me.id, targetId))
  const conv = await db.collection('conversations').findOne({ type: 'random', status: 'active', participants: { $all: [me.id, targetId] } })
  if (conv) {
    await db.collection('conversations').updateOne({ id: conv.id }, { $set: { status: 'ended', endedBy: me.id, updatedAt: new Date() } })
    S.activeChats.delete(me.id)
    S.activeChats.delete(targetId)
    S.convCache.set(conv.id, { ...conv, status: 'ended', endedBy: me.id })
    if (S.io) S.io.to(`conv:${conv.id}`).emit('chat_ended', { conversationId: conv.id, endedBy: me.id })
  }
  return json({ ok: true })
}

async function listBlocked(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const blocks = await db.collection('blocks').find({ blockerId: me.id }).sort({ createdAt: -1 }).toArray()
  const blocked = []
  for (const b of blocks) {
    const u = await hydrateUser(db, b.blockedId)
    blocked.push({ id: b.blockedId, anonymousName: u ? u.anonymousName : 'Unknown user', avatarColor: u ? u.avatarColor : '#9CA3AF' })
  }
  return json({ blocked })
}

async function handleUnblock(request, db, targetId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  await db.collection('blocks').deleteOne({ blockerId: me.id, blockedId: targetId })
  S.blockedPairs.delete(pairKey(me.id, targetId))
  return json({ ok: true })
}

async function handleReport(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const body = await request.json().catch(() => ({}))
  const category = String(body.category || '')
  if (!REPORT_CATEGORIES.includes(category)) return err('Please pick a reason for the report.')
  const report = {
    id: uuidv4(),
    reporterId: me.id,
    reportedUserId: body.reportedUserId ? String(body.reportedUserId) : null,
    category,
    description: String(body.description || '').trim().slice(0, 1000),
    conversationId: body.conversationId ? String(body.conversationId) : null,
    status: 'open',
    createdAt: new Date(),
  }
  await db.collection('reports').insertOne(report)
  return json({ ok: true }, 201)
}

// ---------- ME / PROFILE ----------
async function getMyProfile(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const [friends, chats, posts, communities] = await Promise.all([
    db.collection('friendships').countDocuments({ users: me.id }),
    db.collection('conversations').countDocuments({ participants: me.id }),
    db.collection('posts').countDocuments({ userId: me.id }),
    db.collection('community_members').countDocuments({ userId: me.id }),
  ])
  return json({ user: publicUser(me), email: me.email, availableToChat: !!me.availableToChat, stats: { friends, chats, posts, communities } })
}

async function updateMyProfile(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const body = await request.json().catch(() => ({}))
  const update = {}
  if (body.anonymousName !== undefined) {
    const name = String(body.anonymousName).trim().replace(/\s+/g, ' ')
    if (!/^[A-Za-z0-9 ]{2,24}$/.test(name)) return err('Name must be 2-24 letters or numbers.')
    update.anonymousName = name
  }
  if (body.bio !== undefined) update.bio = String(body.bio).trim().slice(0, 160)
  if (Object.keys(update).length === 0) return err('Nothing to update.')
  await db.collection('users').updateOne({ id: me.id }, { $set: update })
  const cached = S.userCache.get(me.id)
  if (cached) Object.assign(cached, update)
  const fresh = await db.collection('users').findOne({ id: me.id })
  // Tell everyone this user chats with that their name/bio/color changed (live).
  if (S.io && update.anonymousName !== undefined) {
    try {
      const convs = await db.collection('conversations').find({ participants: me.id }).toArray()
      const seen = new Set()
      for (const c of convs) {
        for (const p of (c.participants || [])) {
          if (p === me.id || seen.has(p)) continue
          seen.add(p)
          S.io.to(`user:${p}`).emit('peer_updated', { user: publicUser(fresh) })
        }
      }
    } catch {}
  }
  return json({ user: publicUser(fresh) })
}

async function updateMyAvatar(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const ct = request.headers.get('content-type') || ''
  if (!ct.includes('multipart/form-data')) return err('Please choose a photo.')
  const form = await request.formData()
  const file = form.get('image')
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') return err('Please choose a photo.')
  if (file.size > 5 * 1024 * 1024) return err('Image must be under 5MB.')
  const exts = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
  const ext = exts[file.type]
  if (!ext) return err('Only PNG, JPG, WebP or GIF images are allowed.')
  const buf = Buffer.from(await file.arrayBuffer())
  const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
  fs.mkdirSync(dir, { recursive: true })
  const fname = `${me.id}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(dir, fname), buf)
  const avatarUrl = `/uploads/avatars/${fname}`
  await db.collection('users').updateOne({ id: me.id }, { $set: { avatarUrl } })
  const cached = S.userCache.get(me.id)
  if (cached) cached.avatarUrl = avatarUrl
  const fresh = await db.collection('users').findOne({ id: me.id })
  if (S.io) {
    try {
      const convs = await db.collection('conversations').find({ participants: me.id }).toArray()
      const seen = new Set()
      for (const c of convs) {
        for (const p of (c.participants || [])) {
          if (p === me.id || seen.has(p)) continue
          seen.add(p)
          S.io.to(`user:${p}`).emit('peer_updated', { user: publicUser(fresh) })
        }
      }
    } catch {}
  }
  return json({ user: publicUser(fresh) })
}

// ---------- FRIENDS ----------
async function listFriends(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const fships = await db.collection('friendships').find({ users: me.id }).toArray()
  const friendIds = fships.flatMap((f) => f.users.filter((u) => u !== me.id))
  const friends = []
  for (const fid of friendIds) {
    const u = await hydrateUser(db, fid)
    if (u) friends.push(publicUser(u))
  }
  const incomingRaw = await db.collection('friend_requests').find({ toId: me.id, status: 'pending' }).sort({ createdAt: -1 }).toArray()
  const outgoingRaw = await db.collection('friend_requests').find({ fromId: me.id, status: 'pending' }).sort({ createdAt: -1 }).toArray()
  const incoming = []
  for (const r of incomingRaw) {
    const u = await hydrateUser(db, r.fromId)
    incoming.push({ id: r.id, from: publicUser(u), createdAt: r.createdAt })
  }
  const outgoing = []
  for (const r of outgoingRaw) {
    const u = await hydrateUser(db, r.toId)
    outgoing.push({ id: r.id, to: publicUser(u), createdAt: r.createdAt })
  }
  return json({ friends, incoming, outgoing })
}

async function sendFriendRequest(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const body = await request.json().catch(() => ({}))
  const toId = String(body.toUserId || '')
  if (!toId || toId === me.id) return err('Invalid friend request.')
  const target = await db.collection('users').findOne({ id: toId })
  if (!target) return err('User not found.', 404)
  if (S.blockedPairs.has(pairKey(me.id, toId))) return err('You cannot add this user.', 403)
  const already = await db.collection('friendships').findOne({ users: [me.id, toId].sort() })
  if (already) return err('You are already friends.', 409)
  const pending = await db.collection('friend_requests').findOne({
    status: 'pending',
    $or: [{ fromId: me.id, toId }, { fromId: toId, toId: me.id }],
  })
  if (pending) {
    if (pending.fromId === toId) return json({ ok: true, alreadyRequested: true, requestId: pending.id })
    return err('Friend request already sent.', 409)
  }
  const reqDoc = { id: uuidv4(), fromId: me.id, toId, status: 'pending', createdAt: new Date() }
  await db.collection('friend_requests').insertOne(reqDoc)
  if (S.io) S.io.to(`user:${toId}`).emit('notification', { type: 'friend_request', requestId: reqDoc.id, from: publicUser(me) })
  return json({ ok: true, requestId: reqDoc.id }, 201)
}

async function respondFriendRequest(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const body = await request.json().catch(() => ({}))
  const reqDoc = await db.collection('friend_requests').findOne({ id: String(body.requestId || ''), toId: me.id, status: 'pending' })
  if (!reqDoc) return err('Request not found.', 404)
  if (!body.accept) {
    await db.collection('friend_requests').updateOne({ id: reqDoc.id }, { $set: { status: 'declined' } })
    return json({ ok: true })
  }
  await db.collection('friend_requests').updateOne({ id: reqDoc.id }, { $set: { status: 'accepted' } })
  const pair = [reqDoc.fromId, reqDoc.toId].sort()
  await db.collection('friendships').updateOne(
    { users: pair },
    { $setOnInsert: { id: uuidv4(), users: pair, pairKey: pair.join('|'), createdAt: new Date() } },
    { upsert: true }
  )
  let conv = await db.collection('conversations').findOne({ type: 'friend', participants: pair })
  if (!conv) {
    conv = { id: uuidv4(), type: 'friend', participants: pair, status: 'active', createdAt: new Date(), updatedAt: new Date(), lastMessage: null, endedBy: null }
    await db.collection('conversations').insertOne(conv)
  }
  const fromUser = await hydrateUser(db, reqDoc.fromId)
  const toUser = await hydrateUser(db, reqDoc.toId)
  if (S.io) {
    S.io.to(`user:${reqDoc.fromId}`).emit('friend_accepted', { conversation: publicConv(conv), peer: publicUser(toUser) })
    S.io.to(`user:${reqDoc.toId}`).emit('friend_accepted', { conversation: publicConv(conv), peer: publicUser(fromUser) })
  }
  return json({ ok: true, conversation: publicConv(conv) })
}

// ---------- POSTS (social feed) ----------
async function hydratePost(db, post, meId) {
  const author = await hydrateUser(db, post.userId)
  const [likeCount, commentCount, liked] = await Promise.all([
    db.collection('likes').countDocuments({ postId: post.id }),
    db.collection('comments').countDocuments({ postId: post.id }),
    meId ? db.collection('likes').findOne({ postId: post.id, userId: meId }) : null,
  ])
  return {
    id: post.id, text: post.text, image: post.image || null, createdAt: post.createdAt,
    author: publicUser(author), likeCount, commentCount, likedByMe: !!liked,
  }
}

async function listPosts(request, db) {
  const me = await getUserFromRequest(request, db)
  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = 10
  const posts = await db.collection('posts').find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray()
  const hydrated = []
  for (const p of posts) hydrated.push(await hydratePost(db, p, me ? me.id : null))
  return json({ posts: hydrated, hasMore: posts.length === limit, page })
}

async function createPost(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  let text = ''
  let imagePath = null
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    text = String(form.get('text') || '').trim().slice(0, 1000)
    const file = form.get('image')
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
      if (file.size > 5 * 1024 * 1024) return err('Image must be under 5MB.')
      const exts = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
      const ext = exts[file.type]
      if (!ext) return err('Only PNG, JPG, WebP or GIF images are allowed.')
      const buf = Buffer.from(await file.arrayBuffer())
      const dir = path.join(process.cwd(), 'public', 'uploads')
      fs.mkdirSync(dir, { recursive: true })
      const fname = `${uuidv4()}.${ext}`
      fs.writeFileSync(path.join(dir, fname), buf)
      imagePath = `/uploads/${fname}`
    }
  } else {
    const body = await request.json().catch(() => ({}))
    text = String(body.text || '').trim().slice(0, 1000)
  }
  if (!text && !imagePath) return err('Say something or add a photo.')
  const post = { id: uuidv4(), userId: me.id, text, image: imagePath, createdAt: new Date() }
  await db.collection('posts').insertOne(post)
  return json({ post: await hydratePost(db, post, me.id) }, 201)
}

async function toggleLike(request, db, postId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const post = await db.collection('posts').findOne({ id: postId })
  if (!post) return err('Post not found.', 404)
  const existing = await db.collection('likes').findOne({ postId, userId: me.id })
  if (existing) {
    await db.collection('likes').deleteOne({ postId, userId: me.id })
  } else {
    await db.collection('likes').insertOne({ id: uuidv4(), postId, userId: me.id, createdAt: new Date() })
  }
  const likeCount = await db.collection('likes').countDocuments({ postId })
  return json({ liked: !existing, likeCount })
}

async function listComments(request, db, postId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const comments = await db.collection('comments').find({ postId }).sort({ createdAt: 1 }).limit(100).toArray()
  const out = []
  for (const c of comments) {
    const u = await hydrateUser(db, c.userId)
    out.push({ id: c.id, text: c.text, createdAt: c.createdAt, author: publicUser(u) })
  }
  return json({ comments: out })
}

async function addComment(request, db, postId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const post = await db.collection('posts').findOne({ id: postId })
  if (!post) return err('Post not found.', 404)
  const body = await request.json().catch(() => ({}))
  const text = String(body.text || '').trim().slice(0, 500)
  if (!text) return err('Comment cannot be empty.')
  const comment = { id: uuidv4(), postId, userId: me.id, text, createdAt: new Date() }
  await db.collection('comments').insertOne(comment)
  return json({ comment: { id: comment.id, text: comment.text, createdAt: comment.createdAt, author: publicUser(me) } }, 201)
}

// ---------- COMMUNITIES ----------
async function listCommunities(request, db) {
  const me = await getUserFromRequest(request, db)
  const communities = await db.collection('communities').find({}).sort({ name: 1 }).limit(50).toArray()
  const out = []
  for (const c of communities) {
    const memberCount = await db.collection('community_members').countDocuments({ communityId: c.id })
    const joined = me ? !!(await db.collection('community_members').findOne({ communityId: c.id, userId: me.id })) : false
    out.push({ id: c.id, name: c.name, emoji: c.emoji || '💬', description: c.description || '', memberCount, joined })
  }
  return json({ communities: out })
}

async function joinCommunity(request, db, communityId, joining) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const community = await db.collection('communities').findOne({ id: communityId })
  if (!community) return err('Community not found.', 404)
  if (joining) {
    await db.collection('community_members').updateOne(
      { communityId, userId: me.id },
      { $setOnInsert: { id: uuidv4(), communityId, userId: me.id, createdAt: new Date() } },
      { upsert: true }
    )
  } else {
    await db.collection('community_members').deleteOne({ communityId, userId: me.id })
  }
  const memberCount = await db.collection('community_members').countDocuments({ communityId })
  return json({ ok: true, joined: joining, memberCount })
}

async function communityMessages(request, db, communityId) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const msgs = await db.collection('community_messages').find({ communityId }).sort({ createdAt: 1 }).limit(100).toArray()
  const out = []
  for (const m of msgs) {
    const u = await hydrateUser(db, m.userId)
    out.push({ id: m.id, text: m.text, createdAt: m.createdAt, user: publicUser(u) })
  }
  return json({ messages: out })
}

// ---------- USER SEARCH (find friends by unique numeric ID) ----------
async function searchUsersById(request, db) {
  const me = await getUserFromRequest(request, db)
  if (!me) return err('Please log in.', 401)
  const url = new URL(request.url)
  const raw = String(url.searchParams.get('query') || '').trim()
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length < 3) return err('Enter at least 3 digits of the ID, like 482913.')
  const num = parseInt(digits, 10)
  let docs = []
  // exact match first
  const exact = await db.collection('users').findOne({ userNumber: num })
  if (exact) docs.push(exact)
  // then prefix matches (numbers that start with the typed digits)
  if (digits.length < 6) {
    const lo = parseInt(digits.padEnd(6, '0'), 10)
    const hi = parseInt(digits.padEnd(6, '9'), 10)
    const range = await db.collection('users')
      .find({ userNumber: { $gte: lo, $lte: hi } })
      .sort({ userNumber: 1 })
      .limit(6)
      .toArray()
    for (const u of range) if (!docs.some((d) => d.id === u.id)) docs.push(u)
  }
  docs = docs.slice(0, 5)
  const results = []
  for (const u of docs) {
    const pair = [me.id, u.id].sort()
    const [friend, pendingReq] = await Promise.all([
      db.collection('friendships').findOne({ users: pair }),
      db.collection('friend_requests').findOne({ status: 'pending', $or: [{ fromId: me.id, toId: u.id }, { fromId: u.id, toId: me.id }] }),
    ])
    let relationship = 'none'
    let requestId = null
    if (friend) relationship = 'friend'
    else if (pendingReq) {
      relationship = pendingReq.fromId === me.id ? 'pending_out' : 'pending_in'
      requestId = pendingReq.id
    } else if (S.blockedPairs.has(pairKey(me.id, u.id))) relationship = 'blocked'
    results.push({ user: publicUser(u), relationship, requestId, self: u.id === me.id })
  }
  return json({ users: results })
}

// ---------- ROUTER ----------
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await getDb()

    if (route === '/root' && method === 'GET') return json({ message: 'Talk to Strangers API is running' })
    if (route === '/' && method === 'GET') return json({ message: 'Talk to Strangers API is running' })

    // Public
    if (route === '/stats' && method === 'GET') return handleStats()
    if (route === '/auth/signup' && method === 'POST') return handleSignup(request, db)
    if (route === '/auth/login' && method === 'POST') return handleLogin(request, db)
    if (route === '/auth/logout' && method === 'POST') return handleLogout()
    if (route === '/auth/me' && method === 'GET') return handleMe(request, db)

    // Conversations
    if (route === '/conversations' && method === 'GET') return listConversations(request, db)
    if (path[0] === 'conversations' && path[1] && path[2] === 'messages' && method === 'GET') return getConversationMessages(request, db, path[1])
    if (path[0] === 'conversations' && path[1] && path[2] === 'image' && method === 'POST') return sendConversationImage(request, db, path[1])
    if (path[0] === 'conversations' && path[1] && method === 'DELETE') return deleteConversation(request, db, path[1])

    // Block & report
    if (route === '/block' && method === 'POST') return handleBlock(request, db)
    if (route === '/me/blocked' && method === 'GET') return listBlocked(request, db)
    if (path[0] === 'block' && path[1] && method === 'DELETE') return handleUnblock(request, db, path[1])
    if (route === '/report' && method === 'POST') return handleReport(request, db)

    // Profile
    if (route === '/me/profile' && method === 'GET') return getMyProfile(request, db)
    if (route === '/me/profile' && method === 'PATCH') return updateMyProfile(request, db)
    if (route === '/me/avatar' && method === 'POST') return updateMyAvatar(request, db)

    // Friends
    if (route === '/users/search' && method === 'GET') return searchUsersById(request, db)
    if (route === '/friends' && method === 'GET') return listFriends(request, db)
    if (route === '/friends/request' && method === 'POST') return sendFriendRequest(request, db)
    if (route === '/friends/respond' && method === 'POST') return respondFriendRequest(request, db)

    // Feed
    if (route === '/posts' && method === 'GET') return listPosts(request, db)
    if (route === '/posts' && method === 'POST') return createPost(request, db)
    if (path[0] === 'posts' && path[1] && path[2] === 'like' && method === 'POST') return toggleLike(request, db, path[1])
    if (path[0] === 'posts' && path[1] && path[2] === 'comments' && method === 'GET') return listComments(request, db, path[1])
    if (path[0] === 'posts' && path[1] && path[2] === 'comments' && method === 'POST') return addComment(request, db, path[1])

    // Communities
    if (route === '/communities' && method === 'GET') return listCommunities(request, db)
    if (path[0] === 'communities' && path[1] && path[2] === 'join' && method === 'POST') return joinCommunity(request, db, path[1], true)
    if (path[0] === 'communities' && path[1] && path[2] === 'leave' && method === 'POST') return joinCommunity(request, db, path[1], false)
    if (path[0] === 'communities' && path[1] && path[2] === 'messages' && method === 'GET') return communityMessages(request, db, path[1])

    return err(`Route ${route} not found`, 404)
  } catch (error) {
    console.error('API Error:', error)
    return err('Something went wrong. Please try again.', 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
