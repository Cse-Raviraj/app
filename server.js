/* eslint-disable */
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const next = require('next');
const { getDb, ensureIndexes, seedDefaults, backfillUserNumbers } = require('./lib/db.cjs');
const { getSharedState } = require('./lib/realtime-state.cjs');
const { COOKIE_NAME, verifyToken, parseCookies } = require('./lib/auth.cjs');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const S = getSharedState();

const app = next({ dev, hostname: '0.0.0.0', port });
const handle = app.getRequestHandler();

// ---------- helpers ----------
const now = () => new Date();
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, anonymousName: u.anonymousName, userNumber: u.userNumber || null, avatarColor: u.avatarColor || '#7C3AED', avatarUrl: u.avatarUrl || null, bio: u.bio || '' };
}
function publicConv(c) {
  if (!c) return null;
  return { id: c.id, type: c.type, participants: c.participants, status: c.status, endedBy: c.endedBy || null, createdAt: c.createdAt, updatedAt: c.updatedAt };
}
function publicMsg(m) {
  return { id: m.id, conversationId: m.conversationId, senderId: m.senderId, text: m.text, image: m.image || null, createdAt: m.createdAt, readBy: m.readBy || [] };
}
function emitToConvUsers(conv, event, payload) {
  if (!S.io || !conv || !conv.participants) return;
  for (const p of conv.participants) S.io.to(`user:${p}`).emit(event, payload);
}
const pairKey = (a, b) => [a, b].sort().join('|');
const blockedPair = (a, b) => S.blockedPairs.has(pairKey(a, b));
const socketsOf = (uid) => S.online.get(uid) || new Set();
function emitToUser(userId, event, payload) {
  if (S.io) S.io.to(`user:${userId}`).emit(event, payload);
}

async function getUserCached(db, userId) {
  if (S.userCache.has(userId)) return S.userCache.get(userId);
  const u = await db.collection('users').findOne({ id: userId });
  if (u) S.userCache.set(userId, u);
  return u;
}

function availabilityCount() {
  let n = 0;
  for (const uid of S.availableSet) {
    if (socketsOf(uid).size > 0 && !S.activeChats.has(uid)) n++;
  }
  return n;
}
function presenceStats() {
  return { online: S.online.size, available: availabilityCount() };
}
function emitPresence() {
  if (S.io) S.io.emit('presence_stats', presenceStats());
}

function pingWaiters(exceptId) {
  if (!S.io) return;
  for (const w of [...S.notifyWaiters]) {
    if (w === exceptId) continue;
    if (socketsOf(w).size === 0) { S.notifyWaiters.delete(w); continue; }
    S.notifyWaiters.delete(w);
    emitToUser(w, 'we_have_someone', {});
  }
}

function pruneQueue() {
  S.queue = S.queue.filter((q) => socketsOf(q.userId).size > 0 && !S.activeChats.has(q.userId));
}

function cancelPendingRequestsFor(userId) {
  for (const [rid, req] of [...S.pendingRequests]) {
    if (req.fromId === userId || req.toId === userId) S.pendingRequests.delete(rid);
  }
}

function notifyPeersPresence(db, userId, online) {
  if (!S.io) return;
  for (const conv of S.convCache.values()) {
    if (!conv.participants || !conv.participants.includes(userId)) continue;
    if (conv.type === 'random' && conv.status !== 'active') continue;
    for (const p of conv.participants) {
      if (p === userId) continue;
      emitToUser(p, 'peer_presence', { conversationId: conv.id, userId, online });
    }
  }
}

// ---------- matchmaking ----------
async function createMatch(db, a, b) {
  if (S.activeChats.has(a) || S.activeChats.has(b)) return; // race guard
  if (blockedPair(a, b)) return; // hard gate: blocked pairs can never match, any code path
  const conv = {
    id: uuidv4(),
    type: 'random',
    participants: [a, b].sort(),
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
    lastMessage: null,
    endedBy: null,
  };
  // Reserve synchronously (no await between check & reservation -> race safe)
  S.activeChats.set(a, conv.id);
  S.activeChats.set(b, conv.id);
  S.queue = S.queue.filter((q) => q.userId !== a && q.userId !== b);
  S.convCache.set(conv.id, conv);
  try {
    await db.collection('conversations').insertOne(conv);
  } catch (e) {
    S.activeChats.delete(a);
    S.activeChats.delete(b);
    console.error('createMatch persist error', e.message);
    return;
  }
  const [ua, ub] = await Promise.all([getUserCached(db, a), getUserCached(db, b)]);
  for (const uid of [a, b]) {
    for (const sid of socketsOf(uid)) {
      const s = S.io.sockets.sockets.get(sid);
      if (s) s.join(`conv:${conv.id}`);
    }
  }
  emitToUser(a, 'match_found', { conversation: publicConv(conv), peer: publicUser(ub) });
  emitToUser(b, 'match_found', { conversation: publicConv(conv), peer: publicUser(ua) });
  emitPresence();
}

// Self-healing busy check: if the remembered active chat is actually over, clean up
async function isReallyBusy(db, userId) {
  const convId = S.activeChats.get(userId);
  if (!convId) return false;
  let conv = S.convCache.get(convId);
  if (!conv) {
    conv = await db.collection('conversations').findOne({ id: convId });
    if (conv) S.convCache.set(convId, conv);
  }
  if (!conv || conv.type !== 'random' || conv.status !== 'active') {
    S.activeChats.delete(userId); // stale state -> heal
    return false;
  }
  return true;
}

async function findFriend(socket) {
  const userId = socket.data.userId;
  const db = await getDb();
  if (await isReallyBusy(db, userId)) return socket.emit('app_error', { code: 'busy', message: 'You are already in a chat.' });
  if (S.queue.some((q) => q.userId === userId)) return; // already searching

  pruneQueue();
  // 1) Match with another user who is actively searching (both consented)
  const idx = S.queue.findIndex((q) => q.userId !== userId && !blockedPair(userId, q.userId));
  if (idx >= 0) {
    const other = S.queue[idx];
    S.queue.splice(idx, 1);
    cancelPendingRequestsFor(other.userId);
    cancelPendingRequestsFor(userId);
    await createMatch(db, userId, other.userId);
    return;
  }

  // 2) Enqueue self + send accept/decline requests to available (idle) users
  S.queue.push({ userId, since: Date.now() });
  socket.emit('searching', {});
  const me = await getUserCached(db, userId);
  const candidates = [...S.availableSet]
    .filter((uid) => uid !== userId && socketsOf(uid).size > 0 && !S.activeChats.has(uid) && !blockedPair(userId, uid))
    .slice(0, 5);
  for (const uid of candidates) {
    const requestId = uuidv4();
    S.pendingRequests.set(requestId, { fromId: userId, toId: uid, createdAt: Date.now() });
    emitToUser(uid, 'chat_request', { requestId, from: publicUser(me), expiresIn: 30 });
  }

  // Overall search timeout: be honest instead of letting people wait forever
  const token = uuidv4();
  S.searchTokens.set(userId, token);
  setTimeout(() => {
    if (S.searchTokens.get(userId) !== token) return; // superseded by a newer search
    S.searchTokens.delete(userId);
    if (S.activeChats.has(userId)) return;
    S.queue = S.queue.filter((q) => q.userId !== userId);
    for (const [rid, req] of [...S.pendingRequests]) if (req.fromId === userId) S.pendingRequests.delete(rid);
    emitToUser(userId, 'nobody_available', {});
  }, 30000);
}

async function acceptRequest(socket, requestId) {
  const userId = socket.data.userId;
  const db = await getDb();
  const req = S.pendingRequests.get(requestId);
  if (!req || req.toId !== userId) {
    return socket.emit('app_error', { code: 'expired', message: 'They are no longer available.' });
  }
  S.pendingRequests.delete(requestId);
  if ((await isReallyBusy(db, req.fromId)) || (await isReallyBusy(db, userId)) || blockedPair(req.fromId, userId)) {
    emitToUser(req.fromId, 'request_expired', { requestId });
    return socket.emit('app_error', { code: 'unavailable', message: 'They are no longer available.' });
  }
  await createMatch(db, req.fromId, userId);
}

// ---------- chat handlers ----------
async function sendMessage(socket, { conversationId, text, clientId }) {
  const userId = socket.data.userId;
  const db = await getDb();
  const b = S.msgBuckets.get(userId) || { count: 0, ts: Date.now() };
  if (Date.now() - b.ts > 10000) { b.count = 0; b.ts = Date.now(); }
  b.count++;
  S.msgBuckets.set(userId, b);
  if (b.count > 25) return socket.emit('app_error', { code: 'rate_limited', message: 'Slow down a little' });
  const clean = String(text || '').trim().slice(0, 2000);
  if (!clean || !conversationId) return;
  let conv = S.convCache.get(conversationId);
  if (!conv) {
    conv = await db.collection('conversations').findOne({ id: conversationId });
    if (conv) S.convCache.set(conversationId, conv);
  }
  if (!conv || !conv.participants || !conv.participants.includes(userId)) return;
  if (conv.type === 'random' && conv.status !== 'active') return;
  const msg = { id: clientId || uuidv4(), conversationId, senderId: userId, text: clean, createdAt: now(), readBy: [userId] };
  await db.collection('messages').insertOne(msg);
  await db.collection('conversations').updateOne(
    { id: conversationId },
    { $set: { lastMessage: { text: clean, senderId: userId, createdAt: msg.createdAt }, updatedAt: msg.createdAt } }
  );
  emitToConvUsers(conv, 'new_message', publicMsg(msg));
}

async function readMessages(socket, { conversationId }) {
  const userId = socket.data.userId;
  const db = await getDb();
  let conv = S.convCache.get(conversationId);
  if (!conv) {
    conv = await db.collection('conversations').findOne({ id: conversationId });
    if (conv) S.convCache.set(conversationId, conv);
  }
  if (!conv || !conv.participants || !conv.participants.includes(userId)) return;
  await db.collection('messages').updateMany(
    { conversationId, senderId: { $ne: userId }, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );
  S.io.to(`conv:${conversationId}`).emit('messages_read', { conversationId, readerId: userId });
  emitToConvUsers(conv, 'messages_read', { conversationId, readerId: userId });
}

async function endChat(socket, { conversationId }) {
  const userId = socket.data.userId;
  const db = await getDb();
  let conv = S.convCache.get(conversationId);
  if (!conv) {
    conv = await db.collection('conversations').findOne({ id: conversationId });
    if (conv) S.convCache.set(conversationId, conv);
  }
  if (!conv || !conv.participants || !conv.participants.includes(userId)) return;
  if (conv.type !== 'random' || conv.status !== 'active') return;
  conv.status = 'ended';
  conv.endedBy = userId;
  S.convCache.set(conv.id, conv);
  await db.collection('conversations').updateOne({ id: conversationId }, { $set: { status: 'ended', endedBy: userId, updatedAt: now() } });
  for (const uid of conv.participants) S.activeChats.delete(uid);
  S.io.to(`conv:${conversationId}`).emit('chat_ended', { conversationId, endedBy: userId });
  emitPresence();
}

async function setAvailable(socket, available) {
  const userId = socket.data.userId;
  const db = await getDb();
  if (available) S.availableSet.add(userId);
  else S.availableSet.delete(userId);
  await db.collection('users').updateOne({ id: userId }, { $set: { availableToChat: !!available } });
  const cached = S.userCache.get(userId);
  if (cached) cached.availableToChat = !!available;
  emitPresence();
  if (available) pingWaiters(userId);
}

async function communityMessage(socket, { communityId, text }) {
  const userId = socket.data.userId;
  const db = await getDb();
  const clean = String(text || '').trim().slice(0, 1000);
  if (!clean || !communityId) return;
  const member = await db.collection('community_members').findOne({ communityId, userId });
  if (!member) return socket.emit('app_error', { code: 'forbidden', message: 'Join this community to chat.' });
  const msg = { id: uuidv4(), communityId, userId, text: clean, createdAt: now() };
  await db.collection('community_messages').insertOne(msg);
  S.io.to(`community:${communityId}`).emit('community_message', { ...msg, user: publicUser(await getUserCached(db, userId)) });
}

// ---------- boot ----------
app.prepare().then(async () => {
  const db = await getDb();
  await ensureIndexes(db);
  await seedDefaults(db);
  await backfillUserNumbers(db);
  // warm block pairs cache
  const blocks = await db.collection('blocks').find({}).toArray();
  for (const bl of blocks) S.blockedPairs.add(pairKey(bl.blockerId, bl.blockedId));

  const server = http.createServer((req, res) => handle(req, res));
  const io = new SocketIOServer(server, {
    path: '/api/socketio',
    cors: { origin: true, credentials: true },
    pingInterval: 20000,
    pingTimeout: 25000,
  });
  S.io = io;

  // Socket auth: only real logged-in users may connect
  io.use((socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie || '');
      const payload = verifyToken(cookies[COOKIE_NAME]);
      if (!payload || !payload.userId) return next(new Error('unauthorized'));
      socket.data.userId = payload.userId;
      next();
    } catch (e) {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    const db = await getDb();
    if (!S.online.has(userId)) S.online.set(userId, new Set());
    S.online.get(userId).add(socket.id);
    socket.join(`user:${userId}`);
    const u = await getUserCached(db, userId);
    if (u && u.availableToChat) S.availableSet.add(userId);
    db.collection('users').updateOne({ id: userId }, { $set: { online: true, lastSeen: now() } }).catch(() => {});
    socket.emit('connected_ok', { userId, stats: presenceStats() });
    emitPresence();
    pingWaiters(userId);
    notifyPeersPresence(db, userId, true);

    socket.on('find_friend', () => findFriend(socket).catch((e) => console.error('find_friend', e.message)));
    socket.on('cancel_search', () => {
      S.searchTokens.delete(userId);
      S.queue = S.queue.filter((q) => q.userId !== userId);
      for (const [rid, req] of [...S.pendingRequests]) if (req.fromId === userId) S.pendingRequests.delete(rid);
    });
    socket.on('accept_request', (d = {}) => acceptRequest(socket, d.requestId).catch((e) => console.error('accept_request', e.message)));
    socket.on('decline_request', (d = {}) => {
      const req = S.pendingRequests.get(d.requestId);
      if (req && req.toId === userId) S.pendingRequests.delete(d.requestId);
    });
    socket.on('set_available', (d = {}) => setAvailable(socket, !!d.available).catch((e) => console.error('set_available', e.message)));
    socket.on('notify_me', () => S.notifyWaiters.add(userId));
    socket.on('cancel_notify', () => S.notifyWaiters.delete(userId));
    socket.on('send_message', (d = {}) => sendMessage(socket, d).catch((e) => console.error('send_message', e.message)));
    socket.on('typing', (d = {}) => {
      const conv = S.convCache.get(d.conversationId);
      if (!conv || !conv.participants || !conv.participants.includes(userId)) return;
      const peerId = conv.participants.find((p) => p !== userId);
      if (peerId) emitToUser(peerId, 'typing', { conversationId: d.conversationId, userId, isTyping: !!d.isTyping });
    });
    socket.on('read_messages', (d = {}) => readMessages(socket, d).catch((e) => console.error('read_messages', e.message)));
    socket.on('end_chat', (d = {}) => endChat(socket, d).catch((e) => console.error('end_chat', e.message)));
    socket.on('join_community', (d = {}) => { if (d.communityId) socket.join(`community:${d.communityId}`); });
    socket.on('leave_community', (d = {}) => { if (d.communityId) socket.leave(`community:${d.communityId}`); });
    socket.on('community_message', (d = {}) => communityMessage(socket, d).catch((e) => console.error('community_message', e.message)));

    // ---- join a conversation room (friend chats: enables live text/typing/read) ----
    socket.on('join_conversation', async (d = {}) => {
      if (!d.conversationId) return;
      try {
        const database = await getDb();
        let conv = S.convCache.get(d.conversationId);
        if (!conv) { conv = await database.collection('conversations').findOne({ id: d.conversationId }); if (conv) S.convCache.set(d.conversationId, conv); }
        if (conv && conv.participants && conv.participants.includes(userId)) socket.join(`conv:${d.conversationId}`);
      } catch (e) { console.error('join_conversation', e.message); }
    });

    // ---- voice call signaling (relay only; WebRTC audio is peer-to-peer) ----
    const relayCall = async (event, d = {}, extra = {}) => {
      if (!d || !d.conversationId) return;
      const database = await getDb();
      let conv = S.convCache.get(d.conversationId);
      if (!conv) { conv = await database.collection('conversations').findOne({ id: d.conversationId }); if (conv) S.convCache.set(d.conversationId, conv); }
      if (!conv || !conv.participants || !conv.participants.includes(userId)) return;
      const peerId = conv.participants.find((p) => p !== userId);
      if (peerId) emitToUser(peerId, event, { conversationId: d.conversationId, from: userId, ...extra });
    };
    socket.on('call_offer', async (d = {}) => {
      try {
        const database = await getDb();
        const me = await getUserCached(database, userId);
        relayCall('call_incoming', d, { sdp: d.sdp, fromUser: publicUser(me) });
      } catch (e) { console.error('call_offer', e.message); }
    });
    socket.on('call_answer', (d = {}) => relayCall('call_answered', d, { sdp: d.sdp }).catch(() => {}));
    socket.on('call_ice', (d = {}) => relayCall('call_ice', d, { candidate: d.candidate }).catch(() => {}));
    socket.on('call_end', (d = {}) => relayCall('call_ended', d).catch(() => {}));
    socket.on('call_reject', (d = {}) => relayCall('call_rejected', d).catch(() => {}));

    socket.on('disconnect', () => {
      const set = S.online.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) S.online.delete(userId);
      }
      if (!S.online.has(userId)) {
        S.availableSet.delete(userId);
        S.queue = S.queue.filter((q) => q.userId !== userId); // left while searching
        S.searchTokens.delete(userId);
        S.notifyWaiters.delete(userId);
        for (const [rid, req] of [...S.pendingRequests]) {
          if (req.fromId === userId || req.toId === userId) S.pendingRequests.delete(rid);
        }
        // End any active random chat this user was in so nobody gets stuck as "busy".
        // Grace period allows quick reconnects (refresh / network blip) to keep the chat.
        const convId = S.activeChats.get(userId);
        if (convId) {
          setTimeout(async () => {
            if (S.online.has(userId)) return; // reconnected in time -> keep chat
            if (S.activeChats.get(userId) !== convId) return; // already resolved
            try {
              const database = await getDb();
              let conv = S.convCache.get(convId);
              if (!conv) conv = await database.collection('conversations').findOne({ id: convId });
              if (conv && conv.type === 'random' && conv.status === 'active') {
                conv.status = 'ended';
                conv.endedBy = userId;
                S.convCache.set(convId, conv);
                await database.collection('conversations').updateOne({ id: convId }, { $set: { status: 'ended', endedBy: userId, updatedAt: now() } });
                for (const p of conv.participants || []) S.activeChats.delete(p);
                if (S.io) S.io.to(`conv:${convId}`).emit('chat_ended', { conversationId: convId, endedBy: userId });
                emitPresence();
              } else {
                S.activeChats.delete(userId);
              }
            } catch (e) {
              console.error('disconnect end-chat', e.message);
            }
          }, 8000);
        }
        db.collection('users').updateOne({ id: userId }, { $set: { online: false, lastSeen: now() } }).catch(() => {});
        notifyPeersPresence(db, userId, false);
      }
      emitPresence();
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Talk to Strangers ready on http://0.0.0.0:${port} (dev=${dev})`);
  });
});
