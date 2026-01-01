# 3. Adopt Circuit Breaker Pattern for External Services

Date: 2026-01-01

## Status

Accepted

## Context

The oh-my-opencode plugin integrates with numerous external services:

1. **MCP servers** - Context7, Exa, grep.app for documentation and search
2. **LLM APIs** - OpenAI, Anthropic, Google for agent models
3. **LSP servers** - Language servers for various programming languages
4. **OAuth providers** - Google Antigravity, OpenAI Codex for authentication
5. **npm registry** - For version checks and updates

These external dependencies introduce several failure modes:

**Transient Failures:**
- Network timeouts
- Service temporarily unavailable (503)
- Rate limiting (429)
- DNS resolution failures

**Cascading Failures:**
- When one service fails, repeated retry attempts overwhelm it
- Other services become slow waiting for failed service
- Thread pool exhaustion from blocking calls
- Memory exhaustion from queued requests

**User Impact:**
- Hung sessions waiting for failed services
- Poor error messages and user experience
- Wasted resources on doomed requests
- Plugin becomes unusable during outages

Traditional error handling (try/catch, retry) doesn't prevent cascading failures. We need a mechanism to:
- Detect failing services quickly
- Stop making requests to failing services
- Allow services time to recover
- Automatically retry when services recover
- Provide fallback behavior

## Decision

We implemented the **Circuit Breaker** pattern with a complete `CircuitBreaker` class that manages three states:

### States

1. **CLOSED** (Normal)
   - Requests flow through normally
   - Failures are counted
   - Opens after threshold failures

2. **OPEN** (Failing)
   - Requests fail immediately without calling service
   - Saves resources by not waiting for timeouts
   - Transitions to HALF_OPEN after reset timeout

3. **HALF_OPEN** (Testing)
   - Limited requests allowed through
   - If successful → back to CLOSED
   - If failed → back to OPEN

### Features

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 60000,      // Try recovery after 1min
  successThreshold: 2,      // 2 successes to close
  requestTimeout: 30000,    // 30s timeout per request
  shouldCountFailure: (error) => isRetryable(error),
  onOpen: () => log("Circuit opened"),
  onClose: () => log("Circuit closed"),
  onHalfOpen: () => log("Testing recovery"),
});

// Protect service call
const result = await breaker.execute(() => fetchFromAPI());
```

### Helper Functions

```typescript
// Wrap function with circuit breaker
const protectedFetch = withCircuitBreaker("api", fetchData, {
  failureThreshold: 3,
  resetTimeout: 60000,
});

// Use circuit breaker registry
const breaker = circuitBreakerRegistry.getOrCreate("mcp-context7");
```

### Implementation Details

- **State machine** - Clean state transitions with callbacks
- **Timeout protection** - Per-request timeouts prevent hanging
- **Custom failure predicates** - Decide which errors count as failures
- **Statistics tracking** - Monitor failure rates and state
- **Manual control** - Force open/close for testing or emergencies
- **Well-tested** - 23 unit tests covering all states and transitions

## Consequences

### Positive

1. **Prevents cascading failures**
   - Failed services don't drag down entire system
   - Resources freed up quickly when service fails
   - Other services continue working normally

2. **Fast failure**
   - Users get immediate error instead of hanging
   - No wasted time waiting for timeouts
   - Better user experience during outages

3. **Automatic recovery**
   - Periodically tests if service recovered
   - Self-healing without manual intervention
   - Smooth transition back to normal operation

4. **Resource protection**
   - Thread pools not exhausted
   - Memory not filled with pending requests
   - Network connections not tied up

5. **Observability**
   - Statistics show which services are problematic
   - State changes can trigger alerts
   - Easy to monitor in production

6. **Graceful degradation**
   - Can provide fallback responses when circuit is open
   - Plugin remains functional even with some services down
   - Better than complete failure

### Negative

1. **Increased complexity**
   - More code to understand and maintain
   - State machine behavior to reason about
   - Debugging across states can be tricky

2. **Configuration overhead**
   - Need to tune thresholds for each service
   - Wrong values can cause false positives or negatives
   - May need different settings per environment

3. **State coordination**
   - Multiple instances don't share circuit state
   - Can lead to thundering herd on recovery
   - Mitigated by: jittered retry, distributed coordination (future)

4. **Testing challenges**
   - Need to test all state transitions
   - Time-dependent behavior hard to test
   - Mitigated by: comprehensive test suite, manual controls

### When to Use

**Use circuit breakers for:**
- ✅ External HTTP APIs
- ✅ Database connections
- ✅ Remote procedure calls
- ✅ File system operations (network drives)
- ✅ Any operation that can fail and is expensive

**Don't use for:**
- ❌ In-memory operations
- ❌ Local file system (usually)
- ❌ Operations that must succeed
- ❌ Operations with built-in retry logic

### Configuration Guidelines

```typescript
// Web APIs - moderate tolerance
{
  failureThreshold: 5,
  resetTimeout: 60000,      // 1 minute
  successThreshold: 2,
  requestTimeout: 30000,    // 30 seconds
}

// Critical services - low tolerance
{
  failureThreshold: 3,
  resetTimeout: 30000,      // 30 seconds
  successThreshold: 1,
  requestTimeout: 10000,    // 10 seconds
}

// Bulk operations - high tolerance
{
  failureThreshold: 10,
  resetTimeout: 120000,     // 2 minutes
  successThreshold: 5,
  requestTimeout: 60000,    // 1 minute
}
```

### Future Improvements

1. **Distributed circuit breaker** - Share state across instances (Redis)
2. **Adaptive thresholds** - Automatically tune based on metrics
3. **Bulkhead pattern** - Isolate resources per service
4. **Retry budget** - Limit total retry attempts across all circuits
5. **Dashboard** - Visualize circuit breaker states in real-time
6. **Alerts** - Notify on repeated circuit opening

## References

- Implementation: `src/shared/circuit-breaker.ts`
- Tests: `src/shared/circuit-breaker.test.ts`
- Usage: `DEVELOPMENT.md#error-handling`
- [Martin Fowler - CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Microsoft - Circuit Breaker Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [Netflix Hystrix](https://github.com/Netflix/Hystrix) (inspiration)
