# Development Guide

## Overview

This document provides comprehensive guidance for developing and contributing to `oh-my-opencode`. It covers architecture, patterns, best practices, and common workflows.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture](#architecture)
3. [Development Workflow](#development-workflow)
4. [Testing](#testing)
5. [Performance](#performance)
6. [Error Handling](#error-handling)
7. [Code Style](#code-style)
8. [Common Patterns](#common-patterns)
9. [Debugging](#debugging)
10. [Deployment](#deployment)

## Getting Started

### Prerequisites

- **Bun** >= 1.0.0 (NOT npm/yarn)
- **TypeScript** >= 5.7.0
- **OpenCode** >= 1.0.150

### Setup

```bash
# Clone repository
git clone https://github.com/code-yeongyu/oh-my-opencode.git
cd oh-my-opencode

# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Build
bun run build
```

## Architecture

### Core Modules

```
oh-my-opencode/
├── src/
│   ├── agents/          # AI agents (Sisyphus, oracle, librarian, etc.)
│   ├── hooks/           # Lifecycle hooks (21 hooks)
│   ├── tools/           # LSP, AST-Grep, Grep, Glob tools
│   ├── mcp/             # MCP servers
│   ├── features/        # Claude Code compatibility layer
│   ├── config/          # Configuration schema and types
│   ├── auth/            # Authentication plugins
│   ├── shared/          # Shared utilities and infrastructure
│   └── cli/             # Command-line interface
```

### Infrastructure Layer (src/shared/)

The shared infrastructure provides foundational capabilities:

- **cache.ts** - High-performance caching with TTL and LRU
- **performance.ts** - Performance monitoring and metrics
- **error-handling.ts** - Custom errors and recovery strategies
- **circuit-breaker.ts** - Protection for external services
- **logger.ts** - Structured logging
- **deep-merge.ts** - Configuration merging
- **pattern-matcher.ts** - Glob and pattern matching

### Agent Architecture

Agents are specialized AI models configured for specific tasks:

```typescript
export interface AgentConfig {
  model: string;               // Model identifier
  temperature?: number;        // 0.0 - 1.0
  prompt: string;             // System prompt
  tools?: ToolsConfig;        // Tool access
  description?: string;       // Agent description
  mode?: "primary" | "subagent";
  color?: string;             // CLI color
}
```

**Built-in Agents:**
- **Sisyphus** - Primary orchestrator (Claude Opus 4.5)
- **oracle** - Strategy and code review (GPT-5.2)
- **librarian** - Documentation and research (Claude Sonnet 4.5)
- **explore** - Fast codebase exploration (Grok)
- **frontend-ui-ux-engineer** - UI generation (Gemini 3 Pro)
- **document-writer** - Technical writing (Gemini 3 Flash)
- **multimodal-looker** - Visual content (Gemini 3 Flash)

### Hook System

Hooks intercept and modify plugin behavior at specific lifecycle events:

```typescript
export function createMyHook(input: PluginInput): Partial<Hooks> {
  return {
    "session.created": async (data) => {
      // Handle session creation
    },
    "tool.execute.before": async (data) => {
      // Intercept tool execution
    },
    "message.updated": async (data) => {
      // Process message updates
    },
  };
}
```

**Hook Naming Convention:** `createXXXHook()`

**Common Hook Events:**
- `session.created` / `session.deleted`
- `tool.execute.before` / `tool.execute.after`
- `message.updated`
- `agent.idle`

## Development Workflow

### Adding a New Agent

1. Create agent file in `src/agents/`:

```typescript
// src/agents/my-agent.ts
import type { AgentConfig } from "@opencode-ai/sdk";

export const myAgent: AgentConfig = {
  model: "anthropic/claude-sonnet-4-5",
  temperature: 0.1,
  prompt: `You are a specialized agent for...`,
  tools: { include: ["grep", "glob", "lsp_*"] },
  description: "Agent description",
};
```

2. Register in `src/agents/index.ts`:

```typescript
import { myAgent } from "./my-agent";

export const builtinAgents: Record<string, AgentConfig> = {
  // ... existing agents
  "my-agent": myAgent,
};
```

3. Add type in `src/agents/types.ts`:

```typescript
export type AvailableAgent = 
  | "oracle"
  | "librarian"
  | "my-agent"  // Add here
  | ...;
```

4. Write tests in `src/agents/my-agent.test.ts`

### Adding a New Hook

1. Create hook directory: `src/hooks/my-hook/`

2. Create `index.ts`:

```typescript
import type { PluginInput, Hooks } from "@opencode-ai/plugin";

export function createMyHook(input: PluginInput): Partial<Hooks> {
  return {
    "session.created": async (data) => {
      // Hook logic
    },
  };
}
```

3. Export from `src/hooks/index.ts`:

```typescript
export { createMyHook } from "./my-hook";
```

4. Register in `src/index.ts`:

```typescript
const myHook = isHookEnabled("my-hook")
  ? createMyHook(ctx)
  : null;

// In return statement:
return {
  hooks: {
    ...(myHook ? myHook : {}),
  },
};
```

5. Add hook name to types in `src/config/types.ts`:

```typescript
export type HookName = 
  | "my-hook"  // Add here
  | ...;
```

### Adding a New Tool

1. Create tool directory: `src/tools/my-tool/`

2. Create required files:
   - `index.ts` - Main exports
   - `types.ts` - Type definitions
   - `constants.ts` - Constants
   - `tools.ts` - Tool implementations
   - `utils.ts` - Helper functions (if needed)

3. Implement tool in `tools.ts`:

```typescript
import type { Tool } from "@opencode-ai/sdk";

export const myTool: Tool = {
  name: "my_tool",
  description: "Tool description",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string" },
    },
    required: ["input"],
  },
  execute: async (args) => {
    // Tool logic
    return { content: "result" };
  },
};
```

4. Export from `src/tools/index.ts`

5. Add to `builtinTools` in `src/index.ts`

## Testing

### Test Style

We use **BDD-style** comments for test organization:

```typescript
test("should do something", () => {
  // #given - Setup
  const input = "test";
  
  // #when - Action
  const result = fn(input);
  
  // #then - Assertions
  expect(result).toBe("expected");
});
```

### Running Tests

```bash
# All tests
bun test

# Specific file
bun test src/shared/cache.test.ts

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

### Test Structure

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("Feature", () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test("should handle normal case", () => {
    // Test implementation
  });

  test("should handle edge case", () => {
    // Test implementation
  });
});
```

### Integration Tests

For integration tests that require external services, use environment variables:

```typescript
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION === "true";

test.skipIf(SKIP_INTEGRATION)("should call external API", async () => {
  // Integration test
});
```

## Performance

### Using the Cache

```typescript
import { Cache, cacheRegistry } from "../shared";

// Create cache
const cache = new Cache({ maxSize: 1000, ttl: 60000 });

// Get or compute
const result = await cache.getOrCompute("key", async () => {
  return await expensiveOperation();
});

// Or use global registry
const sharedCache = cacheRegistry.getOrCreate("lsp-responses", {
  maxSize: 500,
  ttl: 300000,
});
```

### Performance Monitoring

```typescript
import { performanceMonitor } from "../shared";

// Start/end pattern
performanceMonitor.start("operation");
try {
  // ... work
} finally {
  performanceMonitor.end("operation");
}

// Or use measure
const result = await performanceMonitor.measure(
  "api-call",
  () => fetchData()
);

// Get statistics
const stats = performanceMonitor.getStats("api-call");
console.log(`Avg: ${stats.avg}ms, P95: ${stats.p95}ms`);
```

### Memoization

```typescript
import { memoize } from "../shared";

const expensiveFn = async (input: string) => {
  // Expensive computation
  return result;
};

// Memoize with custom key
const memoized = memoize(expensiveFn, {
  ttl: 60000,
  keyGenerator: (input) => input.toLowerCase(),
});
```

## Error Handling

### Custom Errors

```typescript
import { 
  NetworkError, 
  ValidationError, 
  retry,
  withErrorHandling 
} from "../shared";

// Throw custom errors
if (!response.ok) {
  throw new NetworkError("API request failed", {
    statusCode: response.status,
    url: response.url,
  });
}

// Retry with exponential backoff
const result = await retry(() => unreliableOperation(), {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
});

// Wrap with error handling
const safeFn = withErrorHandling(riskyOperation, {
  onError: (error) => log("Error:", error),
  defaultValue: null,
  rethrow: false,
});
```

### Circuit Breaker

```typescript
import { withCircuitBreaker } from "../shared";

// Protect external service calls
const protectedFetch = withCircuitBreaker("external-api", fetchFromAPI, {
  failureThreshold: 5,
  resetTimeout: 60000,
  requestTimeout: 30000,
});

try {
  const data = await protectedFetch();
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    // Circuit is open, use fallback
  }
}
```

## Code Style

### TypeScript

- Use **strict mode** - all strict checks enabled
- Prefer **interfaces** over type aliases for objects
- Use **optional properties** (`?`) for optional fields
- Avoid `any` - use `unknown` or proper types
- Use **const assertions** for readonly values

```typescript
// Good
interface Config {
  enabled?: boolean;
  options: Record<string, unknown>;
}

// Bad
type Config = {
  enabled: boolean | undefined;
  options: any;
};
```

### Naming Conventions

- **Files**: kebab-case (`my-feature.ts`)
- **Directories**: kebab-case (`my-feature/`)
- **Functions**: camelCase (`createMyHook()`)
- **Classes**: PascalCase (`CircuitBreaker`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`AgentConfig`)

### Imports

- Use **barrel exports** (`export * from "./module"`)
- Group imports: external, internal, relative
- Sort alphabetically within groups

```typescript
// External
import type { Plugin } from "@opencode-ai/plugin";
import { someUtil } from "external-lib";

// Internal
import { createAgent } from "../agents";
import { Cache } from "../shared";

// Relative
import { helper } from "./utils";
```

## Common Patterns

### Hook Pattern

```typescript
export function createFeatureHook(input: PluginInput): Partial<Hooks> {
  const { client, directory } = input;
  const state = new Map();

  return {
    "event.name": async (data) => {
      // Handle event
    },
  };
}
```

### Tool Pattern

```typescript
export const myTool: Tool = {
  name: "my_tool",
  description: "Description",
  parameters: { /* schema */ },
  execute: async (args, context) => {
    try {
      const result = await operation(args);
      return { content: JSON.stringify(result) };
    } catch (error) {
      return { 
        content: `Error: ${error.message}`,
        isError: true 
      };
    }
  },
};
```

### Agent Configuration

```typescript
export const myAgent: AgentConfig = {
  model: "provider/model-name",
  temperature: 0.1,
  prompt: `System prompt...`,
  tools: { 
    include: ["tool1", "tool2_*"]  // Glob patterns supported
  },
  description: "Agent description",
};
```

## Debugging

### Enable Verbose Logging

```typescript
import { log } from "../shared";

// Log with context
log("Operation started", { sessionId, args });
```

### Debug Performance

```typescript
import { performanceMonitor } from "../shared";

// Get all stats
const allStats = performanceMonitor.getAllStats();
console.log(JSON.stringify(allStats, null, 2));

// Find slow operations
const slow = performanceMonitor.getSlowOperations(1000); // > 1s
console.log("Slow operations:", slow);

// Export metrics
const exported = performanceMonitor.export();
await Bun.write("metrics.json", exported);
```

### Debug Cache

```typescript
import { cacheRegistry } from "../shared";

// Get cache stats
const stats = cacheRegistry.getAllStats();
console.log("Cache stats:", stats);

// Clear specific cache
cacheRegistry.delete("cache-name");
```

### Debug Circuit Breaker

```typescript
import { circuitBreakerRegistry } from "../shared";

// Get all circuit breaker stats
const stats = circuitBreakerRegistry.getAllStats();
console.log("Circuit breakers:", stats);

// Manually control circuit
const breaker = circuitBreakerRegistry.get("api-name");
breaker?.open();  // Force open
breaker?.close(); // Force close
```

## Deployment

### Build

```bash
# Clean build
bun run clean
bun run build

# The build process:
# 1. Bundles ESM modules
# 2. Generates TypeScript declarations
# 3. Builds JSON schema
# 4. Outputs to dist/
```

### Publishing

**DO NOT publish locally!** Use GitHub Actions workflow:

```bash
# Trigger publish workflow
gh workflow run publish -f bump=patch  # or minor, major
```

The CI workflow:
1. Bumps version in package.json
2. Runs tests and type checks
3. Builds the project
4. Generates changelog
5. Publishes to npm with OIDC provenance
6. Creates GitHub release

### Versioning

Follow **Semantic Versioning**:
- **MAJOR** - Breaking changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes

## Best Practices

1. **Always test** - Write tests for new features
2. **Type everything** - No `any` types
3. **Document public APIs** - JSDoc comments
4. **Handle errors** - Use custom error types
5. **Monitor performance** - Use performance monitoring
6. **Cache smartly** - Cache expensive operations
7. **Protect external calls** - Use circuit breakers
8. **Keep it simple** - Prefer simple over clever
9. **Follow conventions** - Consistency matters
10. **Review before commit** - Self-review your changes

## Resources

- [OpenCode Docs](https://opencode.ai/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Bun Documentation](https://bun.sh/docs)
- [Project README](./README.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Architecture Decision Records](./docs/adr/)

## Getting Help

- **Discord**: [Join our community](https://discord.gg/PWpXmbhF)
- **GitHub Issues**: [Report bugs or request features](https://github.com/code-yeongyu/oh-my-opencode/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/code-yeongyu/oh-my-opencode/discussions)
