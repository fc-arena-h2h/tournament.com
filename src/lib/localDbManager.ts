/**
 * Precision Local Database Management System (লোকাল ডাটাবেজ ম্যানেজমেন্ট সিস্টেম)
 *
 * Responsibilities:
 * 1. Shard Routing Table (`tournamentId -> shardId`): Remembers which database shard
 *    ('shard_1' = Gariena1, 'shard_2' = FC Tournament, 'master' = zxzx) owns each tournament,
 *    eliminating redundant cross-database queries.
 * 2. Smart Stale-While-Revalidate Cache: Caches tournament lists, standings, and match records
 *    locally in localStorage + memory to save 70-80% of Firestore read quota.
 * 3. Active Notification Shard Tracker: Tracks which tournament shards a player/publisher interacts with.
 * 4. Automatic Garbage Collection: Prevents localStorage overflow by pruning stale entries.
 */

export type ShardId = 'shard_1' | 'shard_2' | 'master' | string;

export interface ShardRouteEntry {
  tournamentId: string;
  shardId: ShardId;
  notifShardId: string;
  title?: string;
  updatedAt: number;
}

interface CacheEnvelope<T = any> {
  data: T;
  createdAt: number;
  expiresAt: number;
  shardId?: ShardId;
}

export interface LocalDbStats {
  routedTournamentsCount: number;
  cachedEntriesCount: number;
  cacheHits: number;
  estimatedSavedReads: number;
  shardBreakdown: Record<string, number>;
}

const ROUTING_STORAGE_KEY = 'fc_arena_shard_routing_v1';
const CACHE_STORAGE_PREFIX = 'fc_arena_ldb_cache_v1_';
const STATS_STORAGE_KEY = 'fc_arena_ldb_stats_v1';
const USER_SHARDS_KEY = 'fc_arena_user_active_shards_v1';
const MAX_ROUTING_ENTRIES = 500;
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes fresh TTL

// Fast in-memory mirrors for 0ms synchronous access
let memoryRoutingMap: Record<string, ShardRouteEntry> | null = null;
const memoryCache = new Map<string, CacheEnvelope>();

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getNotifShardIdForTournamentShard(shardId: ShardId): string {
  if (shardId === 'shard_1') return 'notif_1';
  if (shardId === 'shard_2') return 'notif_2';
  if (shardId === 'master') return 'master';
  return shardId.replace('shard_', 'notif_');
}

function ensureRoutingMapLoaded(): Record<string, ShardRouteEntry> {
  if (memoryRoutingMap !== null) {
    return memoryRoutingMap;
  }
  if (typeof window === 'undefined') {
    memoryRoutingMap = {};
    return memoryRoutingMap;
  }
  memoryRoutingMap = safeJsonParse<Record<string, ShardRouteEntry>>(
    localStorage.getItem(ROUTING_STORAGE_KEY),
    {}
  );
  return memoryRoutingMap;
}

function persistRoutingMap() {
  if (typeof window === 'undefined' || !memoryRoutingMap) return;
  try {
    const entries = Object.values(memoryRoutingMap);
    if (entries.length > MAX_ROUTING_ENTRIES) {
      // Keep the most recently updated entries
      entries.sort((a, b) => b.updatedAt - a.updatedAt);
      const trimmed: Record<string, ShardRouteEntry> = {};
      for (let i = 0; i < MAX_ROUTING_ENTRIES; i++) {
        trimmed[entries[i].tournamentId] = entries[i];
      }
      memoryRoutingMap = trimmed;
    }
    localStorage.setItem(ROUTING_STORAGE_KEY, JSON.stringify(memoryRoutingMap));
  } catch {
    // Ignore storage quota errors after running garbage collection
    runLocalDbGarbageCollection();
  }
}

function incrementSavedReads(count: number = 1) {
  if (typeof window === 'undefined') return;
  try {
    const raw = safeJsonParse<{ hits: number; savedReads: number }>(
      localStorage.getItem(STATS_STORAGE_KEY),
      { hits: 0, savedReads: 0 }
    );
    raw.hits += 1;
    raw.savedReads += count;
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(raw));
  } catch {
    // Ignore
  }
}

/**
 * Register a tournament's shard location in the Local Database Routing Table.
 */
export function registerTournamentShard(
  tournamentId: string,
  shardId: ShardId,
  title?: string
): void {
  if (!tournamentId || !shardId) return;
  const map = ensureRoutingMapLoaded();
  const existing = map[tournamentId];
  const notifShardId = getNotifShardIdForTournamentShard(shardId);

  if (
    existing &&
    existing.shardId === shardId &&
    (!title || existing.title === title) &&
    Date.now() - existing.updatedAt < 60_000
  ) {
    return;
  }

  map[tournamentId] = {
    tournamentId,
    shardId,
    notifShardId,
    title: title || existing?.title,
    updatedAt: Date.now()
  };
  persistRoutingMap();
}

/**
 * Register a batch of tournaments into the Local Database Routing Table at once.
 */
export function registerTournamentBatchShards(
  tournaments: Array<{ id: string; shardId?: ShardId; title?: string }>,
  defaultShardId?: ShardId
): void {
  if (!Array.isArray(tournaments) || tournaments.length === 0) return;
  const map = ensureRoutingMapLoaded();
  let changed = false;
  const now = Date.now();

  for (const t of tournaments) {
    if (!t || !t.id) continue;
    const shardId = t.shardId || defaultShardId;
    if (!shardId) continue;
    const existing = map[t.id];
    if (!existing || existing.shardId !== shardId || (t.title && existing.title !== t.title)) {
      map[t.id] = {
        tournamentId: t.id,
        shardId,
        notifShardId: getNotifShardIdForTournamentShard(shardId),
        title: t.title || existing?.title,
        updatedAt: now
      };
      changed = true;
    }
  }

  if (changed) {
    persistRoutingMap();
  }
}

/**
 * Remove a deleted tournament from the Local Database Routing Table and Cache.
 */
export function removeTournamentFromLocalDb(tournamentId: string): void {
  if (!tournamentId) return;
  const map = ensureRoutingMapLoaded();
  if (map[tournamentId]) {
    delete map[tournamentId];
    persistRoutingMap();
  }
  invalidateLocalCache(`tournament_${tournamentId}`);
  invalidateLocalCache(`matches_${tournamentId}`);
  invalidateLocalCache(`registrations_${tournamentId}`);
}

/**
 * Look up which shard owns a tournamentId in 0ms from the Local Routing Table.
 */
export function getTournamentShard(tournamentId?: string | null): ShardId | null {
  if (!tournamentId) return null;
  const map = ensureRoutingMapLoaded();
  const entry = map[tournamentId];
  if (entry?.shardId) {
    incrementSavedReads(1);
    return entry.shardId;
  }
  return null;
}

/**
 * Get the full routing entry for a tournamentId.
 */
export function getTournamentRouteEntry(tournamentId?: string | null): ShardRouteEntry | null {
  if (!tournamentId) return null;
  const map = ensureRoutingMapLoaded();
  return map[tournamentId] || null;
}

/**
 * Track which shards the current user actively participates in.
 */
export function recordUserActiveShard(userId: string, shardId: ShardId): void {
  if (!userId || !shardId || typeof window === 'undefined') return;
  try {
    const all = safeJsonParse<Record<string, ShardId[]>>(
      localStorage.getItem(USER_SHARDS_KEY),
      {}
    );
    const current = new Set<ShardId>(all[userId] || ['shard_1', 'shard_2']);
    current.add(shardId);
    all[userId] = Array.from(current);
    localStorage.setItem(USER_SHARDS_KEY, JSON.stringify(all));
  } catch {
    // Ignore
  }
}

export function getUserActiveShards(userId?: string | null): ShardId[] {
  if (!userId || typeof window === 'undefined') return ['shard_1', 'shard_2'];
  const all = safeJsonParse<Record<string, ShardId[]>>(
    localStorage.getItem(USER_SHARDS_KEY),
    {}
  );
  const shards = all[userId];
  if (!shards || shards.length === 0) {
    return ['shard_1', 'shard_2'];
  }
  return Array.from(new Set(['shard_1', 'shard_2', ...shards]));
}

/**
 * Save data into the Local Database Cache with a TTL.
 */
export function setLocalCache<T>(
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS,
  shardId?: ShardId
): void {
  const now = Date.now();
  const envelope: CacheEnvelope<T> = {
    data,
    createdAt: now,
    expiresAt: now + ttlMs,
    shardId
  };
  memoryCache.set(key, envelope);

  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_STORAGE_PREFIX + key, JSON.stringify(envelope));
  } catch {
    runLocalDbGarbageCollection();
  }
}

/**
 * Retrieve data from the Local Database Cache.
 * Supports returning stale data when `allowStale = true` for instant UI rendering
 * or offline/quota-saver fallback.
 */
export function getLocalCache<T>(
  key: string,
  allowStale: boolean = false
): { data: T; isFresh: boolean; shardId?: ShardId } | null {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem) {
    const isFresh = now <= mem.expiresAt;
    if (isFresh || allowStale) {
      incrementSavedReads(1);
      return { data: mem.data as T, isFresh, shardId: mem.shardId };
    }
  }

  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(CACHE_STORAGE_PREFIX + key);
  if (!raw) return null;

  const parsed = safeJsonParse<CacheEnvelope<T> | null>(raw, null);
  if (!parsed || parsed.data === undefined) return null;

  memoryCache.set(key, parsed);
  const isFresh = now <= parsed.expiresAt;
  if (isFresh || allowStale) {
    incrementSavedReads(1);
    return { data: parsed.data, isFresh, shardId: parsed.shardId };
  }
  return null;
}

/**
 * Invalidate local cache keys matching a prefix or exact key.
 */
export function invalidateLocalCache(keyOrPrefix: string): void {
  for (const k of Array.from(memoryCache.keys())) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      memoryCache.delete(k);
    }
  }
  if (typeof window === 'undefined') return;
  try {
    const fullPrefix = CACHE_STORAGE_PREFIX + keyOrPrefix;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && (storageKey === fullPrefix || storageKey.startsWith(fullPrefix))) {
        keysToRemove.push(storageKey);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore
  }
}

/**
 * Garbage Collection: Prunes expired cache entries so localStorage stays lean and fast.
 */
export function runLocalDbGarbageCollection(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const expiredKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_STORAGE_PREFIX)) {
        const parsed = safeJsonParse<CacheEnvelope | null>(localStorage.getItem(k), null);
        // Remove entries older than 24 hours
        if (!parsed || now - parsed.createdAt > 24 * 60 * 60 * 1000) {
          expiredKeys.push(k);
        }
      }
    }
    expiredKeys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore
  }
}

/**
 * Returns real-time telemetry about the Local Database Management System
 * for the Admin Cluster Monitor.
 */
export function getLocalDbStats(): LocalDbStats {
  const map = ensureRoutingMapLoaded();
  const entries = Object.values(map);
  const shardBreakdown: Record<string, number> = {
    shard_1: 0,
    shard_2: 0,
    master: 0
  };

  for (const entry of entries) {
    shardBreakdown[entry.shardId] = (shardBreakdown[entry.shardId] || 0) + 1;
  }

  let cachedEntriesCount = memoryCache.size;
  let hits = 0;
  let savedReads = 0;

  if (typeof window !== 'undefined') {
    const rawStats = safeJsonParse<{ hits: number; savedReads: number }>(
      localStorage.getItem(STATS_STORAGE_KEY),
      { hits: 0, savedReads: 0 }
    );
    hits = rawStats.hits;
    savedReads = rawStats.savedReads;

    let lsCacheCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_STORAGE_PREFIX)) {
        lsCacheCount++;
      }
    }
    cachedEntriesCount = Math.max(cachedEntriesCount, lsCacheCount);
  }

  return {
    routedTournamentsCount: entries.length,
    cachedEntriesCount,
    cacheHits: hits,
    estimatedSavedReads: savedReads,
    shardBreakdown
  };
}
