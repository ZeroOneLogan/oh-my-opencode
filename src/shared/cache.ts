/**
 * High-performance caching layer for expensive operations
 * Supports TTL, LRU eviction, and async value loading
 */

export interface CacheOptions {
  /** Maximum number of entries before LRU eviction */
  maxSize?: number;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Enable cache statistics tracking */
  enableStats?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

interface CacheEntry<T> {
  value: T;
  expiry: number;
  lastAccessed: number;
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private enableStats: boolean;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttl = options.ttl ?? 5 * 60 * 1000; // 5 minutes default
    this.enableStats = options.enableStats ?? false;
  }

  /**
   * Get value from cache or compute it
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<T> | T
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    
    if (!entry) {
      if (this.enableStats) this.stats.misses++;
      return undefined;
    }

    // Check expiry
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      if (this.enableStats) this.stats.misses++;
      return undefined;
    }

    // Update last accessed for LRU
    entry.lastAccessed = Date.now();
    if (this.enableStats) this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }

    const expiry = Date.now() + (ttl ?? this.ttl);
    this.store.set(key, {
      value,
      expiry,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
    if (this.enableStats) {
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.evictions = 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.store.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiry) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
      if (this.enableStats) this.stats.evictions++;
    }
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Create a memoized version of an async function with caching
 */
export function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: CacheOptions & {
    keyGenerator?: (...args: Args) => string;
  } = {}
): (...args: Args) => Promise<Result> {
  const cache = new Cache<Result>(options);
  const keyGenerator = options.keyGenerator ?? ((...args: Args) => JSON.stringify(args));

  return async (...args: Args): Promise<Result> => {
    const key = keyGenerator(...args);
    return cache.getOrCompute(key, () => fn(...args));
  };
}

/**
 * Global cache registry for sharing caches across modules
 */
class CacheRegistry {
  private caches = new Map<string, Cache<unknown>>();

  getOrCreate<T>(name: string, options?: CacheOptions): Cache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new Cache<T>(options));
    }
    return this.caches.get(name) as Cache<T>;
  }

  get<T>(name: string): Cache<T> | undefined {
    return this.caches.get(name) as Cache<T> | undefined;
  }

  delete(name: string): boolean {
    return this.caches.delete(name);
  }

  clear(): void {
    this.caches.clear();
  }

  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }
}

export const cacheRegistry = new CacheRegistry();
