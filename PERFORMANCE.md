# Performance Optimization Guide

This guide explains how to optimize the performance of `oh-my-opencode` and troubleshoot performance issues.

## Quick Wins

### 1. Enable Caching

Caching is enabled by default for most operations. To monitor cache effectiveness:

```bash
# In your OpenCode session
performanceMonitor.getStats("lsp-responses");
cacheRegistry.getAllStats();
```

### 2. Configure Appropriate TTLs

Different operations benefit from different cache durations:

```json
{
  "experimental": {
    "cache_ttl": {
      "lsp": 300000,        // 5 minutes
      "ast_grep": 600000,   // 10 minutes
      "file_system": 60000  // 1 minute
    }
  }
}
```

### 3. Limit Agent Tool Access

Give agents only the tools they need:

```json
{
  "agents": {
    "explore": {
      "tools": {
        "include": ["grep", "glob", "lsp_*"]
      }
    }
  }
}
```

### 4. Use Circuit Breakers

Protect against slow or failing external services:

```json
{
  "experimental": {
    "circuit_breakers": {
      "context7": {
        "failureThreshold": 5,
        "resetTimeout": 60000
      }
    }
  }
}
```

## Measuring Performance

### Built-in Performance Monitoring

The `performanceMonitor` tracks all operations:

```typescript
// Get statistics for an operation
const stats = performanceMonitor.getStats("lsp_hover");
console.log(`Average: ${stats.avg}ms`);
console.log(`P95: ${stats.p95}ms`);
console.log(`P99: ${stats.p99}ms`);

// Find slow operations
const slow = performanceMonitor.getSlowOperations(1000); // > 1 second
```

### Export Metrics

```typescript
// Export all metrics to file
const metrics = performanceMonitor.export();
await Bun.write("performance-metrics.json", metrics);
```

### Memory Monitoring

```typescript
// Check memory usage
const memory = performanceMonitor.getMemoryUsage();
console.log(`Heap Used: ${memory.heapUsed}MB`);
console.log(`RSS: ${memory.rss}MB`);
```

## Performance Targets

### Response Time Goals

| Operation | Target | Cached Target |
|-----------|--------|---------------|
| File read | < 100ms | < 10ms |
| LSP hover | < 200ms | < 50ms |
| AST-Grep search | < 500ms | < 100ms |
| Agent invocation | < 2000ms | N/A |
| Grep/Glob | < 1000ms | < 200ms |

### Cache Hit Rate Goals

| Operation | Target Hit Rate |
|-----------|----------------|
| LSP queries | > 70% |
| File system | > 60% |
| AST-Grep | > 50% |
| API calls | > 80% |

## Common Performance Issues

### Issue: Slow LSP Responses

**Symptoms:**
- LSP operations take > 1 second
- High CPU usage during type checking

**Solutions:**

1. **Increase LSP cache TTL:**
```json
{
  "lsp": {
    "cache_ttl": 600000  // 10 minutes
  }
}
```

2. **Limit LSP server scope:**
```json
{
  "lsp": {
    "typescript-language-server": {
      "initialization": {
        "initializationOptions": {
          "maxTsServerMemory": 4096
        }
      }
    }
  }
}
```

3. **Use LSP pre-warming:**
```typescript
// Pre-load common files
await lsp.initialize(["src/index.ts", "src/main.ts"]);
```

### Issue: High Memory Usage

**Symptoms:**
- Memory steadily increases
- Out of memory errors
- Slow garbage collection

**Solutions:**

1. **Reduce cache sizes:**
```json
{
  "experimental": {
    "cache_max_size": {
      "lsp": 500,
      "ast_grep": 200,
      "file_system": 1000
    }
  }
}
```

2. **Enable cache cleanup:**
```typescript
// Run cleanup periodically
setInterval(() => {
  for (const cache of cacheRegistry.values()) {
    cache.cleanup();
  }
}, 60000); // Every minute
```

3. **Monitor memory:**
```typescript
// Alert on high memory
if (performanceMonitor.getMemoryUsage().heapUsed > 1000) {
  console.warn("High memory usage detected");
  cacheRegistry.clear(); // Emergency cleanup
}
```

### Issue: Slow Agent Responses

**Symptoms:**
- Agent takes > 10 seconds to respond
- Network timeouts
- Circuit breakers opening

**Solutions:**

1. **Optimize agent prompts:**
- Keep prompts concise
- Avoid redundant instructions
- Use specific tool requests

2. **Enable request timeouts:**
```json
{
  "experimental": {
    "agent_timeout": 30000  // 30 seconds
  }
}
```

3. **Use background agents:**
```typescript
// Run slow operations in background
await agent.execute({
  task: "analyze codebase",
  background: true
});
```

### Issue: Circuit Breaker Constantly Opening

**Symptoms:**
- External service calls fail immediately
- "Circuit breaker is open" errors
- Services appear down

**Solutions:**

1. **Check service health:**
```bash
curl -I https://api.example.com/health
```

2. **Adjust thresholds:**
```json
{
  "experimental": {
    "circuit_breakers": {
      "service": {
        "failureThreshold": 10,     // Increase tolerance
        "resetTimeout": 120000,     // Wait longer
        "requestTimeout": 60000     // Longer timeouts
      }
    }
  }
}
```

3. **Manual circuit control:**
```typescript
// Force circuit closed
const breaker = circuitBreakerRegistry.get("service");
breaker?.close();

// Or disable circuit breaker
// Remove from config
```

## Optimization Checklist

### Before Production

- [ ] Run performance benchmarks
- [ ] Configure appropriate cache TTLs
- [ ] Set up monitoring and alerts
- [ ] Test circuit breaker thresholds
- [ ] Profile memory usage under load
- [ ] Verify no memory leaks
- [ ] Test with realistic workloads
- [ ] Document performance characteristics

### Regular Maintenance

- [ ] Review performance metrics weekly
- [ ] Check cache hit rates
- [ ] Monitor circuit breaker states
- [ ] Analyze slow operations
- [ ] Update TTLs based on usage
- [ ] Clear old caches periodically
- [ ] Profile memory usage trends

## Advanced Optimizations

### 1. Request Batching

Batch multiple operations together:

```typescript
// Instead of:
for (const file of files) {
  await processFile(file);
}

// Do:
await Promise.all(files.map(file => processFile(file)));
```

### 2. Lazy Loading

Load heavy modules only when needed:

```typescript
// Lazy import
const { HeavyModule } = await import("./heavy-module");
```

### 3. Streaming Responses

For large results, use streaming:

```typescript
// Stream instead of buffering
for await (const chunk of streamLargeResult()) {
  process(chunk);
}
```

### 4. Worker Threads

Offload CPU-intensive work:

```typescript
// Run in worker thread
const result = await worker.execute(cpuIntensiveTask);
```

### 5. Database Indexing

For session storage, ensure proper indexes:

```sql
CREATE INDEX idx_session_created ON sessions(created_at);
CREATE INDEX idx_session_user ON sessions(user_id);
```

## Performance Testing

### Benchmarking

```typescript
// Benchmark an operation
const iterations = 1000;
const start = performance.now();

for (let i = 0; i < iterations; i++) {
  await operation();
}

const duration = performance.now() - start;
console.log(`Average: ${duration / iterations}ms`);
```

### Load Testing

```bash
# Simulate concurrent users
for i in {1..10}; do
  opencode --session=test-$i &
done
```

### Profiling

```bash
# Profile with Bun
bun --inspect index.ts

# Or with Chrome DevTools
bun --inspect-brk index.ts
# Open chrome://inspect
```

## Monitoring in Production

### Key Metrics to Track

1. **Response Times**
   - Average, P50, P95, P99
   - By operation type
   - Trend over time

2. **Cache Effectiveness**
   - Hit rate per cache
   - Eviction rate
   - Memory usage

3. **Circuit Breaker Status**
   - Open/closed state
   - Failure count
   - Last state change

4. **Memory Usage**
   - Heap size
   - RSS
   - GC frequency

5. **Error Rates**
   - By error type
   - By operation
   - Recovery success rate

### Alerting Rules

```yaml
# Example Prometheus alerts
alerts:
  - name: HighResponseTime
    condition: p95_response_time > 2000ms
    for: 5m
    
  - name: LowCacheHitRate
    condition: cache_hit_rate < 0.5
    for: 10m
    
  - name: CircuitBreakerOpen
    condition: circuit_breaker_state == "open"
    for: 1m
    
  - name: HighMemoryUsage
    condition: memory_heap_used > 1000MB
    for: 5m
```

## Getting Help

If you're experiencing performance issues:

1. **Collect metrics:**
   ```typescript
   const metrics = performanceMonitor.export();
   const cacheStats = cacheRegistry.getAllStats();
   const circuitStats = circuitBreakerRegistry.getAllStats();
   ```

2. **Check logs** for warnings and errors

3. **Profile the application** to identify bottlenecks

4. **Share findings** in GitHub Issues or Discord

5. **Include:**
   - Performance metrics export
   - Cache hit rates
   - Circuit breaker states
   - Memory usage profile
   - Configuration file
   - Steps to reproduce

## Resources

- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide
- [ADR-0002](./docs/adr/0002-implement-caching-layer.md) - Caching decisions
- [ADR-0003](./docs/adr/0003-circuit-breaker-pattern.md) - Circuit breaker decisions
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Bun Performance](https://bun.sh/blog/bun-v1.0#performance)
