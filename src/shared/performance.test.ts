import { describe, test, expect, beforeEach } from "bun:test";
import { performanceMonitor, tracked, trackedSync } from "./performance";

describe("performanceMonitor", () => {
  beforeEach(() => {
    performanceMonitor.clear();
    performanceMonitor.setEnabled(true);
  });

  test("should track operation duration with start/end", () => {
    // #given
    performanceMonitor.start("test-operation");
    
    // #when
    const duration = performanceMonitor.end("test-operation");
    
    // #then
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  test("should record metrics directly", () => {
    // #when
    performanceMonitor.record("test-metric", 100, { env: "test" });
    const stats = performanceMonitor.getStats("test-metric");
    
    // #then
    expect(stats).not.toBeNull();
    expect(stats?.count).toBe(1);
    expect(stats?.avg).toBe(100);
  });

  test("should measure async operations", async () => {
    // #given
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return "result";
    };
    
    // #when
    const result = await performanceMonitor.measure("async-test", fn);
    const stats = performanceMonitor.getStats("async-test");
    
    // #then
    expect(result).toBe("result");
    expect(stats?.count).toBe(1);
    expect(stats?.avg).toBeGreaterThanOrEqual(40); // Allow some variance
  });

  test("should measure sync operations", () => {
    // #given
    const fn = () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    };
    
    // #when
    const result = performanceMonitor.measureSync("sync-test", fn);
    const stats = performanceMonitor.getStats("sync-test");
    
    // #then
    expect(result).toBe(499500);
    expect(stats?.count).toBe(1);
    expect(stats?.avg).toBeGreaterThanOrEqual(0);
  });

  test("should calculate statistics correctly", () => {
    // #given
    performanceMonitor.record("test", 100);
    performanceMonitor.record("test", 200);
    performanceMonitor.record("test", 300);
    performanceMonitor.record("test", 400);
    performanceMonitor.record("test", 500);
    
    // #when
    const stats = performanceMonitor.getStats("test");
    
    // #then
    expect(stats?.count).toBe(5);
    expect(stats?.min).toBe(100);
    expect(stats?.max).toBe(500);
    expect(stats?.avg).toBe(300);
    expect(stats?.p50).toBe(300);
  });

  test("should filter by tags", () => {
    // #given
    performanceMonitor.record("test", 100, { env: "prod" });
    performanceMonitor.record("test", 200, { env: "dev" });
    performanceMonitor.record("test", 300, { env: "prod" });
    
    // #when
    const prodStats = performanceMonitor.getStats("test", { env: "prod" });
    const devStats = performanceMonitor.getStats("test", { env: "dev" });
    
    // #then
    expect(prodStats?.count).toBe(2);
    expect(prodStats?.avg).toBe(200);
    expect(devStats?.count).toBe(1);
    expect(devStats?.avg).toBe(200);
  });

  test("should get all stats grouped by name", () => {
    // #given
    performanceMonitor.record("op1", 100);
    performanceMonitor.record("op1", 200);
    performanceMonitor.record("op2", 300);
    
    // #when
    const allStats = performanceMonitor.getAllStats();
    
    // #then
    expect(Object.keys(allStats)).toEqual(["op1", "op2"]);
    expect(allStats.op1.count).toBe(2);
    expect(allStats.op2.count).toBe(1);
  });

  test("should get recent metrics", () => {
    // #given
    for (let i = 0; i < 10; i++) {
      performanceMonitor.record("test", i);
    }
    
    // #when
    const recent = performanceMonitor.getRecentMetrics(5);
    
    // #then
    expect(recent.length).toBe(5);
    expect(recent[0].duration).toBe(5);
    expect(recent[4].duration).toBe(9);
  });

  test("should get metrics by time range", () => {
    // #given
    const start = Date.now();
    performanceMonitor.record("test", 100);
    const mid = Date.now();
    performanceMonitor.record("test", 200);
    const end = Date.now();
    
    // #when
    const metrics = performanceMonitor.getMetricsByTimeRange(start, mid + 1);
    
    // #then
    expect(metrics.length).toBeGreaterThanOrEqual(1);
  });

  test("should clear all metrics", () => {
    // #given
    performanceMonitor.record("test", 100);
    performanceMonitor.start("op");
    
    // #when
    performanceMonitor.clear();
    
    // #then
    expect(performanceMonitor.count).toBe(0);
    expect(performanceMonitor.getStats("test")).toBeNull();
  });

  test("should enable/disable monitoring", () => {
    // #given
    performanceMonitor.setEnabled(false);
    
    // #when
    performanceMonitor.record("test", 100);
    
    // #then
    expect(performanceMonitor.count).toBe(0);
    expect(performanceMonitor.isEnabled()).toBe(false);
  });

  test("should track errors in async operations", async () => {
    // #given
    const fn = async () => {
      throw new Error("Test error");
    };
    
    // #when
    try {
      await performanceMonitor.measure("error-test", fn);
    } catch (err) {
      // Expected
    }
    
    // #then
    const metrics = performanceMonitor.getRecentMetrics(1);
    expect(metrics[0]?.metadata?.success).toBe(false);
    expect(metrics[0]?.metadata?.error).toContain("Test error");
  });

  test("should get slow operations", () => {
    // #given
    performanceMonitor.record("fast", 100);
    performanceMonitor.record("slow", 2000);
    performanceMonitor.record("medium", 500);
    
    // #when
    const slow = performanceMonitor.getSlowOperations(1000);
    
    // #then
    expect(slow.length).toBe(1);
    expect(slow[0].name).toBe("slow");
  });

  test("should get metrics by tag", () => {
    // #given
    performanceMonitor.record("test", 100, { type: "read" });
    performanceMonitor.record("test", 200, { type: "write" });
    performanceMonitor.record("test", 300, { type: "read" });
    
    // #when
    const reads = performanceMonitor.getMetricsByTag("type", "read");
    
    // #then
    expect(reads.length).toBe(2);
    expect(reads[0].duration).toBe(100);
    expect(reads[1].duration).toBe(300);
  });

  test("should export metrics as JSON", () => {
    // #given
    performanceMonitor.record("test", 100);
    
    // #when
    const exported = performanceMonitor.export();
    const parsed = JSON.parse(exported);
    
    // #then
    expect(parsed.metrics).toBeDefined();
    expect(parsed.stats).toBeDefined();
    expect(parsed.exportedAt).toBeDefined();
  });

  test("should handle missing timer gracefully", () => {
    // #given
    const consoleSpy = { warnings: [] as string[] };
    const originalWarn = console.warn;
    console.warn = (msg: string) => consoleSpy.warnings.push(msg);
    
    // #when
    const duration = performanceMonitor.end("nonexistent");
    
    // #then
    expect(duration).toBeUndefined();
    expect(consoleSpy.warnings.length).toBe(1);
    
    // Cleanup
    console.warn = originalWarn;
  });
});

describe("tracked function wrapper", () => {
  beforeEach(() => {
    performanceMonitor.clear();
  });

  test("should track async function calls", async () => {
    // #given
    const fn = async (x: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return x * 2;
    };
    const trackedFn = tracked("multiply", fn);
    
    // #when
    const result = await trackedFn(5);
    const stats = performanceMonitor.getStats("multiply");
    
    // #then
    expect(result).toBe(10);
    expect(stats?.count).toBe(1);
  });

  test("should track sync function calls", () => {
    // #given
    const fn = (x: number) => x * 2;
    const trackedFn = trackedSync("multiply-sync", fn);
    
    // #when
    const result = trackedFn(5);
    const stats = performanceMonitor.getStats("multiply-sync");
    
    // #then
    expect(result).toBe(10);
    expect(stats?.count).toBe(1);
  });
});
