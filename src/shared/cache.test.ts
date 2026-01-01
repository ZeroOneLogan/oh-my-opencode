import { describe, test, expect, beforeEach } from "bun:test";
import { Cache, memoize, cacheRegistry } from "./cache";

describe("Cache", () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>({ maxSize: 3, ttl: 1000, enableStats: true });
  });

  test("should set and get values", () => {
    // #given
    cache.set("key1", "value1");
    
    // #when
    const result = cache.get("key1");
    
    // #then
    expect(result).toBe("value1");
  });

  test("should return undefined for non-existent keys", () => {
    // #when
    const result = cache.get("nonexistent");
    
    // #then
    expect(result).toBeUndefined();
  });

  test("should expire entries after TTL", async () => {
    // #given
    cache.set("key1", "value1", 50); // 50ms TTL
    
    // #when - wait for expiry
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = cache.get("key1");
    
    // #then
    expect(result).toBeUndefined();
  });

  test("should evict LRU when maxSize reached", async () => {
    // #given - disable TTL for this test
    cache = new Cache<string>({ maxSize: 3, ttl: 10000, enableStats: true });
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    cache.get("key1"); // Access key1 to make it more recent
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // #when - add 4th item, should evict key2 (least recently used)
    cache.set("key4", "value4");
    
    // #then
    expect(cache.get("key1")).toBe("value1"); // Still exists
    expect(cache.get("key2")).toBeUndefined(); // Evicted
    expect(cache.get("key3")).toBe("value3"); // Still exists
    expect(cache.get("key4")).toBe("value4"); // Newly added
  });

  test("should track cache statistics", () => {
    // #given
    cache.set("key1", "value1");
    
    // #when
    cache.get("key1"); // Hit
    cache.get("key2"); // Miss
    cache.get("key1"); // Hit
    
    // #then
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.666, 2);
  });

  test("should clear all entries", () => {
    // #given
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    
    // #when
    cache.clear();
    
    // #then
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  test("should check if key exists", () => {
    // #given
    cache.set("key1", "value1");
    
    // #then
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("key2")).toBe(false);
  });

  test("should delete specific key", () => {
    // #given
    cache.set("key1", "value1");
    
    // #when
    const deleted = cache.delete("key1");
    
    // #then
    expect(deleted).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
  });

  test("should cleanup expired entries", async () => {
    // #given
    cache.set("key1", "value1", 50); // 50ms TTL
    cache.set("key2", "value2", 1000); // 1000ms TTL
    
    // #when - wait for key1 to expire
    await new Promise(resolve => setTimeout(resolve, 100));
    const removed = cache.cleanup();
    
    // #then
    expect(removed).toBe(1);
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBe("value2");
  });

  test("should compute value if not in cache", async () => {
    // #given
    let computeCalls = 0;
    const compute = async () => {
      computeCalls++;
      return "computed";
    };
    
    // #when
    const result1 = await cache.getOrCompute("key1", compute);
    const result2 = await cache.getOrCompute("key1", compute);
    
    // #then
    expect(result1).toBe("computed");
    expect(result2).toBe("computed");
    expect(computeCalls).toBe(1); // Computed only once
  });
});

describe("memoize", () => {
  test("should memoize async function results", async () => {
    // #given
    let callCount = 0;
    const fn = async (x: number) => {
      callCount++;
      return x * 2;
    };
    const memoized = memoize(fn, { ttl: 1000 });
    
    // #when
    const result1 = await memoized(5);
    const result2 = await memoized(5);
    const result3 = await memoized(10);
    
    // #then
    expect(result1).toBe(10);
    expect(result2).toBe(10);
    expect(result3).toBe(20);
    expect(callCount).toBe(2); // Called for 5 and 10, but not twice for 5
  });

  test("should use custom key generator", async () => {
    // #given
    let callCount = 0;
    const fn = async (obj: { id: number; name: string }) => {
      callCount++;
      return obj.id * 2;
    };
    const memoized = memoize(fn, {
      keyGenerator: (obj) => String(obj.id),
      ttl: 1000,
    });
    
    // #when
    const result1 = await memoized({ id: 1, name: "a" });
    const result2 = await memoized({ id: 1, name: "b" }); // Different name, same id
    
    // #then
    expect(result1).toBe(2);
    expect(result2).toBe(2);
    expect(callCount).toBe(1); // Called only once due to same id
  });
});

describe("CacheRegistry", () => {
  beforeEach(() => {
    cacheRegistry.clear();
  });

  test("should create and retrieve caches", () => {
    // #when
    const cache1 = cacheRegistry.getOrCreate<string>("test1");
    const cache2 = cacheRegistry.getOrCreate<string>("test1");
    
    // #then
    expect(cache1).toBe(cache2); // Same instance
  });

  test("should get stats for all caches", () => {
    // #given
    const cache1 = cacheRegistry.getOrCreate<string>("test1", { enableStats: true });
    const cache2 = cacheRegistry.getOrCreate<string>("test2", { enableStats: true });
    
    cache1.set("key1", "value1");
    cache1.get("key1");
    cache2.set("key2", "value2");
    cache2.get("key2");
    cache2.get("missing");
    
    // #when
    const stats = cacheRegistry.getAllStats();
    
    // #then
    expect(stats.test1.hits).toBe(1);
    expect(stats.test1.misses).toBe(0);
    expect(stats.test2.hits).toBe(1);
    expect(stats.test2.misses).toBe(1);
  });

  test("should delete specific cache", () => {
    // #given
    cacheRegistry.getOrCreate<string>("test1");
    
    // #when
    const deleted = cacheRegistry.delete("test1");
    const retrieved = cacheRegistry.get("test1");
    
    // #then
    expect(deleted).toBe(true);
    expect(retrieved).toBeUndefined();
  });

  test("should clear all caches", () => {
    // #given
    cacheRegistry.getOrCreate<string>("test1");
    cacheRegistry.getOrCreate<string>("test2");
    
    // #when
    cacheRegistry.clear();
    
    // #then
    expect(cacheRegistry.get("test1")).toBeUndefined();
    expect(cacheRegistry.get("test2")).toBeUndefined();
  });
});
