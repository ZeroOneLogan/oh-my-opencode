/**
 * Enhanced error handling with custom error types and recovery strategies
 */

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum ErrorCategory {
  CONFIGURATION = "configuration",
  NETWORK = "network",
  VALIDATION = "validation",
  PERMISSION = "permission",
  TIMEOUT = "timeout",
  RESOURCE = "resource",
  EXTERNAL_SERVICE = "external_service",
  INTERNAL = "internal",
  USER_INPUT = "user_input",
}

export interface ErrorContext {
  operation?: string;
  component?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface RecoveryStrategy {
  name: string;
  execute: () => Promise<boolean>;
  description: string;
}

/**
 * Base error class with enhanced context and recovery capabilities
 */
export class OhMyOpenCodeError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly context: ErrorContext;
  public readonly timestamp: number;
  public readonly recoverable: boolean;
  public readonly recoveryStrategies: RecoveryStrategy[];

  constructor(
    message: string,
    options: {
      code: string;
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      context?: ErrorContext;
      recoverable?: boolean;
      recoveryStrategies?: RecoveryStrategy[];
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.severity = options.severity ?? ErrorSeverity.MEDIUM;
    this.category = options.category ?? ErrorCategory.INTERNAL;
    this.context = options.context ?? {};
    this.timestamp = Date.now();
    this.recoverable = options.recoverable ?? false;
    this.recoveryStrategies = options.recoveryStrategies ?? [];

    if (options.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Attempt to recover from the error
   */
  async tryRecover(): Promise<boolean> {
    if (!this.recoverable || this.recoveryStrategies.length === 0) {
      return false;
    }

    for (const strategy of this.recoveryStrategies) {
      try {
        const success = await strategy.execute();
        if (success) {
          return true;
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    return false;
  }

  /**
   * Serialize error for logging or transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack,
      cause: this.cause instanceof Error ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : undefined,
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends OhMyOpenCodeError {
  constructor(message: string, options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]>) {
    super(message, {
      code: "CONFIG_ERROR",
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.HIGH,
      ...options,
    });
  }
}

/**
 * Network-related errors with retry capability
 */
export class NetworkError extends OhMyOpenCodeError {
  public readonly statusCode?: number;
  public readonly url?: string;

  constructor(
    message: string,
    options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]> & {
      statusCode?: number;
      url?: string;
    }
  ) {
    super(message, {
      code: "NETWORK_ERROR",
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      ...options,
    });
    this.statusCode = options?.statusCode;
    this.url = options?.url;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends OhMyOpenCodeError {
  public readonly field?: string;
  public readonly validationErrors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]> & {
      field?: string;
      validationErrors?: Array<{ field: string; message: string }>;
    }
  ) {
    super(message, {
      code: "VALIDATION_ERROR",
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      ...options,
    });
    this.field = options?.field;
    this.validationErrors = options?.validationErrors ?? [];
  }
}

/**
 * Permission/authorization errors
 */
export class PermissionError extends OhMyOpenCodeError {
  public readonly resource?: string;
  public readonly action?: string;

  constructor(
    message: string,
    options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]> & {
      resource?: string;
      action?: string;
    }
  ) {
    super(message, {
      code: "PERMISSION_ERROR",
      category: ErrorCategory.PERMISSION,
      severity: ErrorSeverity.HIGH,
      ...options,
    });
    this.resource = options?.resource;
    this.action = options?.action;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends OhMyOpenCodeError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]> & {
      timeoutMs?: number;
    }
  ) {
    super(message, {
      code: "TIMEOUT_ERROR",
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      ...options,
    });
    this.timeoutMs = options?.timeoutMs ?? 0;
  }
}

/**
 * Resource errors (e.g., out of memory, disk full)
 */
export class ResourceError extends OhMyOpenCodeError {
  public readonly resourceType?: string;

  constructor(
    message: string,
    options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]> & {
      resourceType?: string;
    }
  ) {
    super(message, {
      code: "RESOURCE_ERROR",
      category: ErrorCategory.RESOURCE,
      severity: ErrorSeverity.HIGH,
      ...options,
    });
    this.resourceType = options?.resourceType;
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends OhMyOpenCodeError {
  public readonly serviceName?: string;

  constructor(
    message: string,
    options?: Partial<ConstructorParameters<typeof OhMyOpenCodeError>[1]> & {
      serviceName?: string;
    }
  ) {
    super(message, {
      code: "EXTERNAL_SERVICE_ERROR",
      category: ErrorCategory.EXTERNAL_SERVICE,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      ...options,
    });
    this.serviceName = options?.serviceName;
  }
}

/**
 * Error handler registry
 */
type ErrorHandler = (error: Error) => Promise<void> | void;

class ErrorHandlerRegistry {
  private handlers = new Map<string, ErrorHandler[]>();
  private globalHandlers: ErrorHandler[] = [];

  /**
   * Register error handler for specific error code
   */
  register(code: string, handler: ErrorHandler): void {
    if (!this.handlers.has(code)) {
      this.handlers.set(code, []);
    }
    this.handlers.get(code)!.push(handler);
  }

  /**
   * Register global error handler (catches all errors)
   */
  registerGlobal(handler: ErrorHandler): void {
    this.globalHandlers.push(handler);
  }

  /**
   * Handle an error by invoking registered handlers
   */
  async handle(error: Error): Promise<void> {
    // Invoke global handlers first
    for (const handler of this.globalHandlers) {
      try {
        await handler(error);
      } catch (handlerError) {
        console.error("Error in global error handler:", handlerError);
      }
    }

    // Invoke specific handlers if error has a code
    if (error instanceof OhMyOpenCodeError) {
      const handlers = this.handlers.get(error.code) ?? [];
      for (const handler of handlers) {
        try {
          await handler(error);
        } catch (handlerError) {
          console.error(`Error in error handler for ${error.code}:`, handlerError);
        }
      }
    }
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.globalHandlers = [];
  }
}

export const errorHandlerRegistry = new ErrorHandlerRegistry();

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options?: {
    onError?: (error: Error) => void;
    defaultValue?: Result;
    rethrow?: boolean;
  }
): (...args: Args) => Promise<Result | undefined> {
  return async (...args: Args): Promise<Result | undefined> => {
    try {
      return await fn(...args);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      if (options?.onError) {
        options.onError(err);
      }
      
      await errorHandlerRegistry.handle(err);
      
      if (options?.rethrow !== false) {
        throw err;
      }
      
      return options?.defaultValue;
    }
  };
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: Error): boolean {
  if (error instanceof OhMyOpenCodeError) {
    return error.recoverable;
  }
  
  // Common retryable errors
  return (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ExternalServiceError ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("ETIMEDOUT") ||
    error.message.includes("ENOTFOUND")
  );
}

/**
 * Retry an operation with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const shouldRetry = options.shouldRetry ?? isRetryable;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }
      
      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
