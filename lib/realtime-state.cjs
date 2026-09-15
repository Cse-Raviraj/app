// Shared in-process realtime state.
// server.js (Socket.IO engine) and Next.js API routes both live in the same
// node process in this deployment, so globalThis is the safest place for state.
function getSharedState() {
  if (!globalThis.__ttsState) {
    globalThis.__ttsState = {
      io: null,
      online: new Map(),          // userId -> Set<socketId>
      queue: [],                  // [{ userId, since }] users actively searching
      activeChats: new Map(),     // userId -> conversationId
      availableSet: new Set(),    // userIds online + availableToChat (may be idle)
      pendingRequests: new Map(), // requestId -> { fromId, toId, createdAt }
      notifyWaiters: new Set(),   // userIds that asked to be pinged when someone arrives
      blockedPairs: new Set(),    // 'a|b' (sorted)
      userCache: new Map(),       // userId -> user document
      convCache: new Map(),       // conversationId -> conversation document
      msgBuckets: new Map(),      // userId -> { count, ts } message rate limiting
      searchTokens: new Map(),    // userId -> token invalidating old search timeouts
    };
  }
  return globalThis.__ttsState;
}

module.exports = { getSharedState };
