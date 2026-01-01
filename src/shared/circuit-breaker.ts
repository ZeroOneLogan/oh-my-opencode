/**
 * Circuit Breaker pattern for protecting external service calls
 * Prevents cascading failures and provides graceful degradation
 */

export enum CircuitState {
  CLOSED = "closed",     // Normal operation
  OPEN = "open",         // Failing, requests blocked
  HALF_OPEN = "half_open", // Testing if service recovered
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time to wait before attempting reset (ms) */
  resetTimeout?: number;
  /** Number of successful requests needed to close circuit */
  successThreshold?: number;
  /** Timeout for individual requests (ms) */
  requestTimeout?: number;
  /** Custom predicate to determine if error should count as failure */
  shouldCountFailure?: (error: Error) => boolean;
  /** Callback when circuit opens */
  onOpen?: () => void;
  /** Callback when circuit closes */
  onClose?: () => void;
  /** Callback when circuit transitions to half-open */
  onHalfOpen?: () => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  openedAt?: number;
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private openedAt?: number;
  private resetTimer?: Timer;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly requestTimeout: number;
  private readonly shouldCountFailure: (error: Error) => boolean;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;
  private readonly onHalfOpen?: () => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000; // 1 minute
    this.successThreshold = options.successThreshold ?? 2;
    this.requestTimeout = options.requestTimeout ?? 30000; // 30 seconds
    this.shouldCountFailure = options.shouldCountFailure ?? (() => true);
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onHalfOpen = options.onHalfOpen;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      throw new CircuitBreakerOpenError("Circuit breaker is open", {
        state: this.state,
        failures: this.failureCount,
        openedAt: this.openedAt,
      });
    }

    try {
      // Add timeout protection
      const result = await this.withTimeout(fn(), this.requestTimeout);
      this.onSuccess();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onFailure(err);
      throw err;
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
    };
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
      this.scheduleReset();
      this.onOpen?.();
    }
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
      this.openedAt = undefined;
      this.clearResetTimer();
      this.onClose?.();
    }
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.close();
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }

  /**
   * Check if circuit is currently open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = Date.now();

    if (!this.shouldCountFailure(error)) {
      return;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately open on failure in half-open state
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.open();
      }
    }
  }

  /**
   * Schedule circuit reset attempt
   */
  private scheduleReset(): void {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.onHalfOpen?.();
      }
    }, this.resetTimeout);
  }

  /**
   * Clear reset timer
   */
  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Execute with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new CircuitBreakerTimeoutError(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  public readonly stats: Partial<CircuitBreakerStats>;

  constructor(message: string, stats: Partial<CircuitBreakerStats>) {
    super(message);
    this.name = "CircuitBreakerOpenError";
    this.stats = stats;
  }
}

/**
 * Error thrown when request times out
 */
export class CircuitBreakerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerTimeoutError";
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(options));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Delete circuit breaker
   */
  delete(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      return this.breakers.delete(name);
    }
    return false;
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    this.breakers.clear();
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Create a protected version of an async function with circuit breaker
 */
export function withCircuitBreaker<Args extends unknown[], Result>(
  name: string,
  fn: (...args: Args) => Promise<Result>,
  options?: CircuitBreakerOptions
): (...args: Args) => Promise<Result> {
  const breaker = circuitBreakerRegistry.getOrCreate(name, options);

  return async (...args: Args): Promise<Result> => {
    return breaker.execute(() => fn(...args));
  };
}
