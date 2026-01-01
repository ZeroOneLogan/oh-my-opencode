/**
 * Performance monitoring and metrics collection
 * Tracks operation timing, memory usage, and throughput
 */

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
  count: number;
  total: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers = new Map<string, number>();
  private maxMetrics = 10000;
  private enabled = true;

  /**
   * Start timing an operation
   */
  start(name: string): void {
    if (!this.enabled) return;
    this.timers.set(name, performance.now());
  }

  /**
   * End timing and record metric
   */
  end(
    name: string,
    tags?: Record<string, string>,
    metadata?: Record<string, unknown>
  ): number | undefined {
    if (!this.enabled) return undefined;

    const startTime = this.timers.get(name);
    if (startTime === undefined) {
      console.warn(`Performance timer "${name}" was not started`);
      return undefined;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);

    this.record(name, duration, tags, metadata);
    return duration;
  }

  /**
   * Record a metric directly
   */
  record(
    name: string,
    duration: number,
    tags?: Record<string, string>,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.enabled) return;

    // Prevent unbounded growth
    if (this.metrics.length >= this.maxMetrics) {
      this.metrics.shift();
    }

    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
      tags,
      metadata,
    });
  }

  /**
   * Measure an async operation
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      this.record(name, duration, tags, { success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.record(name, duration, tags, { success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Measure a sync operation
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    tags?: Record<string, string>
  ): T {
    const startTime = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - startTime;
      this.record(name, duration, tags, { success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.record(name, duration, tags, { success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Get statistics for a specific operation
   */
  getStats(name: string, tags?: Record<string, string>): PerformanceStats | null {
    const filtered = this.metrics.filter(m => {
      if (m.name !== name) return false;
      if (!tags) return true;
      return Object.entries(tags).every(([key, value]) => m.tags?.[key] === value);
    });

    if (filtered.length === 0) return null;

    const durations = filtered.map(m => m.duration).sort((a, b) => a - b);
    const total = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: durations.length,
      total,
      min: durations[0],
      max: durations[durations.length - 1],
      avg: total / durations.length,
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
    };
  }

  /**
   * Get all metrics grouped by name
   */
  getAllStats(): Record<string, PerformanceStats> {
    const names = new Set(this.metrics.map(m => m.name));
    const stats: Record<string, PerformanceStats> = {};

    for (const name of names) {
      const stat = this.getStats(name);
      if (stat) {
        stats[name] = stat;
      }
    }

    return stats;
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 100): PerformanceMetric[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get metrics within time range
   */
  getMetricsByTimeRange(startTime: number, endTime: number): PerformanceMetric[] {
    return this.metrics.filter(
      m => m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current metrics count
   */
  get count(): number {
    return this.metrics.length;
  }

  /**
   * Export metrics as JSON
   */
  export(): string {
    return JSON.stringify({
      metrics: this.metrics,
      stats: this.getAllStats(),
      exportedAt: Date.now(),
    }, null, 2);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryUsage(): Record<string, number> | null {
    if (typeof process !== "undefined" && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
      };
    }
    return null;
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get slow operations (above threshold)
   */
  getSlowOperations(thresholdMs: number = 1000): PerformanceMetric[] {
    return this.metrics.filter(m => m.duration > thresholdMs);
  }

  /**
   * Get operations by tag
   */
  getMetricsByTag(tagKey: string, tagValue: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.tags?.[tagKey] === tagValue);
  }
}

// Global singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator to measure method execution time
 */
export function Measure(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const metricName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return performanceMonitor.measure(
        metricName,
        () => originalMethod.apply(this, args)
      );
    };

    return descriptor;
  };
}

/**
 * Create a performance-tracked version of a function
 */
export function tracked<Args extends unknown[], Result>(
  name: string,
  fn: (...args: Args) => Promise<Result>
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    return performanceMonitor.measure(name, () => fn(...args));
  };
}

/**
 * Create a performance-tracked version of a sync function
 */
export function trackedSync<Args extends unknown[], Result>(
  name: string,
  fn: (...args: Args) => Result
): (...args: Args) => Result {
  return (...args: Args): Result => {
    return performanceMonitor.measureSync(name, () => fn(...args));
  };
}
