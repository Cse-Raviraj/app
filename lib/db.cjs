const { MongoClient } = require('mongodb');

let _client = null;
let _dbPromise = null;

async function getDb() {
  if (!_dbPromise) {
    _client = new MongoClient(process.env.MONGO_URL, { maxPoolSize: 20 });
    _dbPromise = _client.connect().then((c) => c.db(process.env.DB_NAME || 'talktostrangers'));
  }
  return _dbPromise;
}

async function ensureIndexes(db) {
  try {
    // Migration: the old unique index on the `users` ARRAY was multikey-unique,
    // which wrongly limited every user to a single friendship. Drop it if present.
    try { await db.collection('friendships').dropIndex('users_1') } catch (e) {}
    await Promise.all([
      db.collection('users').createIndexes([{ key: { email: 1 }, unique: true }, { key: { anonymousName: 1 } }, { key: { userNumber: 1 }, unique: true, sparse: true }]),
      db.collection('conversations').createIndexes([{ key: { participants: 1 } }, { key: { updatedAt: -1 } }]),
      db.collection('messages').createIndexes([{ key: { conversationId: 1, createdAt: -1 } }]),
      db.collection('blocks').createIndexes([{ key: { blockerId: 1, blockedId: 1 }, unique: true }]),
      db.collection('reports').createIndexes([{ key: { createdAt: -1 } }]),
      db.collection('friend_requests').createIndexes([{ key: { toId: 1, status: 1 } }, { key: { fromId: 1, status: 1 } }]),
      db.collection('friendships').createIndexes([{ key: { users: 1 } }, { key: { pairKey: 1 }, unique: true, sparse: true }]),
      db.collection('posts').createIndexes([{ key: { createdAt: -1 } }]),
      db.collection('likes').createIndexes([{ key: { postId: 1, userId: 1 }, unique: true }]),
      db.collection('comments').createIndexes([{ key: { postId: 1, createdAt: 1 } }]),
      db.collection('communities').createIndexes([{ key: { name: 1 }, unique: true }]),
      db.collection('community_members').createIndexes([{ key: { communityId: 1, userId: 1 }, unique: true }]),
      db.collection('community_messages').createIndexes([{ key: { communityId: 1, createdAt: -1 } }]),
    ]);
  } catch (e) {
    console.error('Index creation warning:', e.message);
  }
}

const DEFAULT_COMMUNITIES = [
  { id: 'cm_music', name: 'Music', emoji: '\u{1F3B5}', description: 'Share songs, concerts and playlist swaps.', createdAt: new Date() },
  { id: 'cm_movies', name: 'Movies & TV', emoji: '\u{1F3AC}', description: 'What are you watching this week?', createdAt: new Date() },
  { id: 'cm_gaming', name: 'Gaming', emoji: '\u{1F3AE}', description: 'Find teammates and talk games.', createdAt: new Date() },
  { id: 'cm_tech', name: 'Tech', emoji: '\u{1F4BB}', description: 'Gadgets, code and the future.', createdAt: new Date() },
  { id: 'cm_books', name: 'Books', emoji: '\u{1F4DA}', description: 'Recommendations and book chatter.', createdAt: new Date() },
  { id: 'cm_travel', name: 'Travel', emoji: '\u2708\uFE0F', description: 'Stories and tips from around the world.', createdAt: new Date() },
];

async function seedDefaults(db) {
  try {
    const count = await db.collection('communities').countDocuments();
    if (count === 0) await db.collection('communities').insertMany(DEFAULT_COMMUNITIES.map((c) => ({ ...c })));
  } catch (e) {
    console.error('Seed warning:', e.message);
  }
}

async function generateUserNumber(db) {
  // 6-digit unique numeric ID (100000-999999)
  for (let i = 0; i < 25; i++) {
    const candidate = Math.floor(100000 + Math.random() * 900000)
    const exists = await db.collection('users').findOne({ userNumber: candidate })
    if (!exists) return candidate
  }
  // extremely unlikely fallback: widen the range
  for (let i = 0; i < 25; i++) {
    const candidate = Math.floor(1000000 + Math.random() * 9000000)
    const exists = await db.collection('users').findOne({ userNumber: candidate })
    if (!exists) return candidate
  }
  return Date.now() % 100000000
}

async function backfillUserNumbers(db) {
  try {
    const cursor = db.collection('users').find({ userNumber: { $exists: false } })
    const users = await cursor.toArray()
    for (const u of users) {
      const num = await generateUserNumber(db)
      await db.collection('users').updateOne({ id: u.id }, { $set: { userNumber: num } })
    }
    if (users.length) console.log(`Backfilled userNumber for ${users.length} user(s).`)
  } catch (e) {
    console.error('backfillUserNumbers warning:', e.message)
  }
}

module.exports = { getDb, ensureIndexes, seedDefaults, generateUserNumber, backfillUserNumbers };
