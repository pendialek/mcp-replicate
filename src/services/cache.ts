/**
 * Cache service implementation with TTL and LRU strategy.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttl: number;
  private stats: CacheStats;

  constructor(maxSize: number = 1000, ttlSeconds: number = 300) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlSeconds * 1000; // Convert to milliseconds
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  /**
   * Set a value in the cache with TTL.
   */
  set(key: string, value: T): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
    this.stats.size = this.cache.size;
  }

  /**
   * Get a value from the cache, considering TTL.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
      this.stats.misses++;
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Remove a specific key from the cache.
   */
  delete(key: string): void {
    if (this.cache.delete(key)) {
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
    this.stats.evictions += this.stats.size;
    this.stats.size = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Warm up the cache with initial data.
   */
  warmup(entries: [string, T][]): void {
    entries.forEach(([key, value]) => this.set(key, value));
  }

  /**
   * Remove expired entries from the cache.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.evictions += removed;
    this.stats.size = this.cache.size;
    return removed;
  }

  /**
   * Get all valid (non-expired) keys in the cache.
   */
  keys(): string[] {
    const now = Date.now();
    return Array.from(this.cache.entries())
      .filter(([_, entry]) => now - entry.timestamp <= this.ttl)
      .map(([key]) => key);
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const expired = Date.now() - entry.timestamp > this.ttl;
    if (expired) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
      return false;
    }

    return true;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    // Find the least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    // Remove the oldest entry
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }
}

// Create specialized cache instances for different types
export const modelCache = new Cache<any>(500, 3600); // 1 hour TTL for models
export const predictionCache = new Cache<any>(1000, 60); // 1 minute TTL for predictions
export const collectionCache = new Cache<any>(100, 3600); // 1 hour TTL for collections
