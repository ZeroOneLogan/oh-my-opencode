# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the oh-my-opencode project. An ADR is a document that captures an important architectural decision made along with its context and consequences.

## Format

Each ADR follows this structure:

```markdown
# [Number]. [Title]

Date: YYYY-MM-DD

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context

What is the issue we're seeing that motivates this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?
```

## Index

- [ADR-0001](./0001-use-bun-as-package-manager.md) - Use Bun as Package Manager
- [ADR-0002](./0002-implement-caching-layer.md) - Implement High-Performance Caching Layer
- [ADR-0003](./0003-circuit-breaker-pattern.md) - Adopt Circuit Breaker Pattern for External Services
- [ADR-0004](./0004-performance-monitoring.md) - Add Performance Monitoring Infrastructure

## Creating New ADRs

1. Copy the template from `0000-template.md`
2. Number sequentially (next available number)
3. Use kebab-case for the filename
4. Update this index
5. Commit with message: `docs: Add ADR-XXXX - [Title]`

## References

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
