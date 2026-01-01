import { describe, test, expect, beforeEach } from "bun:test";
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  circuitBreakerRegistry,
  withCircuitBreaker,
} from "./circuit-breaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100,
      successThreshold: 2,
      requestTimeout: 500,
    });
  });

  test("should start in closed state", () => {
    // #then
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
  });

  test("should execute successful requests", async () => {
    // #given
    const fn = async () => "success";

    // #when
    const result = await breaker.execute(fn);
    const stats = breaker.getStats();

    // #then
    expect(result).toBe("success");
    expect(stats.successes).toBe(0); // Not in HALF_OPEN, so not counted
    expect(stats.totalRequests).toBe(1);
  });

  test("should open after threshold failures", async () => {
    // #given
    const fn = async () => {
      throw new Error("Failure");
    };

    // #when - fail 3 times to hit threshold
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch (e) {
        // Expected
      }
    }

    // #then
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getStats().state).toBe(CircuitState.OPEN);
    expect(breaker.getStats().failures).toBe(3);
  });

  test("should reject requests when open", async () => {
    // #given
    breaker.open();
    const fn = async () => "success";

    // #when/then
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
  });

  test("should transition to half-open after reset timeout", async () => {
    // #given
    breaker.open();
    expect(breaker.getStats().state).toBe(CircuitState.OPEN);

    // #when - wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // #then
    expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);
  });

  test("should close after successful requests in half-open state", async () => {
    // #given
    breaker.open();
    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for half-open
    const fn = async () => "success";

    // #when - succeed twice to meet threshold
    await breaker.execute(fn);
    await breaker.execute(fn);

    // #then
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
  });

  test("should reopen on failure in half-open state", async () => {
    // #given
    breaker.open();
    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for half-open
    const fn = async () => {
      throw new Error("Failure");
    };

    // #when
    try {
      await breaker.execute(fn);
    } catch (e) {
      // Expected
    }

    // #then
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getStats().state).toBe(CircuitState.OPEN);
  });

  test("should timeout long-running requests", async () => {
    // #given
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return "success";
    };

    // #when/then
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerTimeoutError);
  });

  test("should reset failure count on success in closed state", async () => {
    // #given
    const failFn = async () => {
      throw new Error("Failure");
    };
    const successFn = async () => "success";

    // #when - fail twice, then succeed
    try {
      await breaker.execute(failFn);
    } catch (e) {}
    try {
      await breaker.execute(failFn);
    } catch (e) {}
    await breaker.execute(successFn);

    // #then - failure count should be reset
    const stats = breaker.getStats();
    expect(stats.failures).toBe(0);
    expect(stats.state).toBe(CircuitState.CLOSED);
  });

  test("should track statistics correctly", async () => {
    // #given
    const fn = async () => "success";
    const failFn = async () => {
      throw new Error("Failure");
    };

    // #when
    await breaker.execute(fn);
    try {
      await breaker.execute(failFn);
    } catch (e) {}

    // #then
    const stats = breaker.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.failures).toBe(1);
    expect(stats.lastSuccessTime).toBeDefined();
    expect(stats.lastFailureTime).toBeDefined();
  });

  test("should manually open circuit", () => {
    // #when
    breaker.open();

    // #then
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getStats().openedAt).toBeDefined();
  });

  test("should manually close circuit", () => {
    // #given
    breaker.open();

    // #when
    breaker.close();

    // #then
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getStats().failures).toBe(0);
    expect(breaker.getStats().openedAt).toBeUndefined();
  });

  test("should reset all statistics", async () => {
    // #given
    const fn = async () => "success";
    await breaker.execute(fn);
    await breaker.execute(fn);

    // #when
    breaker.reset();

    // #then
    const stats = breaker.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.failures).toBe(0);
    expect(stats.successes).toBe(0);
    expect(stats.state).toBe(CircuitState.CLOSED);
  });

  test("should call onOpen callback", () => {
    // #given
    let opened = false;
    breaker = new CircuitBreaker({
      failureThreshold: 1,
      onOpen: () => { opened = true; },
    });

    // #when
    breaker.open();

    // #then
    expect(opened).toBe(true);
  });

  test("should call onClose callback", () => {
    // #given
    let closed = false;
    breaker = new CircuitBreaker({
      onClose: () => { closed = true; },
    });
    breaker.open();

    // #when
    breaker.close();

    // #then
    expect(closed).toBe(true);
  });

  test("should call onHalfOpen callback", async () => {
    // #given
    let halfOpened = false;
    breaker = new CircuitBreaker({
      resetTimeout: 50,
      onHalfOpen: () => { halfOpened = true; },
    });
    breaker.open();

    // #when - wait for half-open transition
    await new Promise(resolve => setTimeout(resolve, 100));

    // #then
    expect(halfOpened).toBe(true);
  });

  test("should use custom failure predicate", async () => {
    // #given
    breaker = new CircuitBreaker({
      failureThreshold: 2,
      shouldCountFailure: (error) => !error.message.includes("ignore"),
    });
    const ignoreFn = async () => {
      throw new Error("ignore this");
    };
    const countFn = async () => {
      throw new Error("count this");
    };

    // #when
    try {
      await breaker.execute(ignoreFn);
    } catch (e) {}
    try {
      await breaker.execute(ignoreFn);
    } catch (e) {}
    try {
      await breaker.execute(countFn);
    } catch (e) {}

    // #then - should still be closed because ignored errors don't count
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getStats().failures).toBe(1);
  });
});

describe("CircuitBreakerRegistry", () => {
  beforeEach(() => {
    circuitBreakerRegistry.clear();
  });

  test("should create and retrieve circuit breakers", () => {
    // #when
    const breaker1 = circuitBreakerRegistry.getOrCreate("test1");
    const breaker2 = circuitBreakerRegistry.getOrCreate("test1");

    // #then
    expect(breaker1).toBe(breaker2); // Same instance
  });

  test("should get stats for all breakers", () => {
    // #given
    circuitBreakerRegistry.getOrCreate("test1");
    circuitBreakerRegistry.getOrCreate("test2");

    // #when
    const stats = circuitBreakerRegistry.getAllStats();

    // #then
    expect(Object.keys(stats)).toEqual(["test1", "test2"]);
    expect(stats.test1.state).toBe(CircuitState.CLOSED);
  });

  test("should delete specific breaker", () => {
    // #given
    circuitBreakerRegistry.getOrCreate("test1");

    // #when
    const deleted = circuitBreakerRegistry.delete("test1");
    const retrieved = circuitBreakerRegistry.get("test1");

    // #then
    expect(deleted).toBe(true);
    expect(retrieved).toBeUndefined();
  });

  test("should clear all breakers", () => {
    // #given
    circuitBreakerRegistry.getOrCreate("test1");
    circuitBreakerRegistry.getOrCreate("test2");

    // #when
    circuitBreakerRegistry.clear();

    // #then
    expect(circuitBreakerRegistry.get("test1")).toBeUndefined();
    expect(circuitBreakerRegistry.get("test2")).toBeUndefined();
  });
});

describe("withCircuitBreaker wrapper", () => {
  beforeEach(() => {
    circuitBreakerRegistry.clear();
  });

  test("should protect function with circuit breaker", async () => {
    // #given
    const fn = async (x: number) => x * 2;
    const protectedFn = withCircuitBreaker("multiply", fn, {
      failureThreshold: 2,
    });

    // #when
    const result = await protectedFn(5);

    // #then
    expect(result).toBe(10);
  });

  test("should open circuit after failures", async () => {
    // #given
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error("Failure");
    };
    const protectedFn = withCircuitBreaker("failing", fn, {
      failureThreshold: 2,
    });

    // #when - fail twice to open circuit
    try {
      await protectedFn();
    } catch (e) {}
    try {
      await protectedFn();
    } catch (e) {}

    // #then - third call should be rejected by circuit breaker
    try {
      await protectedFn();
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitBreakerOpenError);
    }
    expect(callCount).toBe(2); // Function not called on 3rd attempt
  });
});
