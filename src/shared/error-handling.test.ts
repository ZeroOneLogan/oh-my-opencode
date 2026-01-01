import { describe, test, expect, beforeEach } from "bun:test";
import {
  OhMyOpenCodeError,
  ConfigurationError,
  NetworkError,
  ValidationError,
  PermissionError,
  TimeoutError,
  ResourceError,
  ExternalServiceError,
  ErrorSeverity,
  ErrorCategory,
  errorHandlerRegistry,
  withErrorHandling,
  isRetryable,
  retry,
} from "./error-handling";

describe("OhMyOpenCodeError", () => {
  test("should create error with required fields", () => {
    // #when
    const error = new OhMyOpenCodeError("Test error", {
      code: "TEST_ERROR",
    });

    // #then
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.category).toBe(ErrorCategory.INTERNAL);
    expect(error.recoverable).toBe(false);
  });

  test("should serialize to JSON", () => {
    // #given
    const error = new OhMyOpenCodeError("Test error", {
      code: "TEST_ERROR",
      context: { operation: "test" },
    });

    // #when
    const json = error.toJSON();

    // #then
    expect(json.message).toBe("Test error");
    expect(json.code).toBe("TEST_ERROR");
    expect(json.context).toEqual({ operation: "test" });
  });

  test("should attempt recovery with strategies", async () => {
    // #given
    let recovered = false;
    const error = new OhMyOpenCodeError("Test error", {
      code: "TEST_ERROR",
      recoverable: true,
      recoveryStrategies: [
        {
          name: "test-recovery",
          description: "Test recovery strategy",
          execute: async () => {
            recovered = true;
            return true;
          },
        },
      ],
    });

    // #when
    const success = await error.tryRecover();

    // #then
    expect(success).toBe(true);
    expect(recovered).toBe(true);
  });

  test("should try multiple recovery strategies", async () => {
    // #given
    let attempt = 0;
    const error = new OhMyOpenCodeError("Test error", {
      code: "TEST_ERROR",
      recoverable: true,
      recoveryStrategies: [
        {
          name: "first",
          description: "First strategy",
          execute: async () => {
            attempt = 1;
            return false;
          },
        },
        {
          name: "second",
          description: "Second strategy",
          execute: async () => {
            attempt = 2;
            return true;
          },
        },
      ],
    });

    // #when
    const success = await error.tryRecover();

    // #then
    expect(success).toBe(true);
    expect(attempt).toBe(2);
  });
});

describe("Specialized Error Classes", () => {
  test("ConfigurationError should have correct defaults", () => {
    // #when
    const error = new ConfigurationError("Invalid config");

    // #then
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.category).toBe(ErrorCategory.CONFIGURATION);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
  });

  test("NetworkError should include status and URL", () => {
    // #when
    const error = new NetworkError("Connection failed", {
      statusCode: 500,
      url: "https://example.com",
    });

    // #then
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.url).toBe("https://example.com");
    expect(error.recoverable).toBe(true);
  });

  test("ValidationError should include field errors", () => {
    // #when
    const error = new ValidationError("Validation failed", {
      validationErrors: [
        { field: "email", message: "Invalid email" },
        { field: "age", message: "Must be positive" },
      ],
    });

    // #then
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.validationErrors.length).toBe(2);
    expect(error.severity).toBe(ErrorSeverity.LOW);
  });

  test("PermissionError should include resource and action", () => {
    // #when
    const error = new PermissionError("Access denied", {
      resource: "file.txt",
      action: "write",
    });

    // #then
    expect(error.code).toBe("PERMISSION_ERROR");
    expect(error.resource).toBe("file.txt");
    expect(error.action).toBe("write");
  });

  test("TimeoutError should include timeout duration", () => {
    // #when
    const error = new TimeoutError("Operation timed out", {
      timeoutMs: 5000,
    });

    // #then
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.timeoutMs).toBe(5000);
    expect(error.recoverable).toBe(true);
  });

  test("ResourceError should include resource type", () => {
    // #when
    const error = new ResourceError("Out of memory", {
      resourceType: "memory",
    });

    // #then
    expect(error.code).toBe("RESOURCE_ERROR");
    expect(error.resourceType).toBe("memory");
  });

  test("ExternalServiceError should include service name", () => {
    // #when
    const error = new ExternalServiceError("Service unavailable", {
      serviceName: "api.example.com",
    });

    // #then
    expect(error.code).toBe("EXTERNAL_SERVICE_ERROR");
    expect(error.serviceName).toBe("api.example.com");
    expect(error.recoverable).toBe(true);
  });
});

describe("ErrorHandlerRegistry", () => {
  beforeEach(() => {
    errorHandlerRegistry.clear();
  });

  test("should register and invoke specific handler", async () => {
    // #given
    let handled = false;
    errorHandlerRegistry.register("TEST_ERROR", (error) => {
      handled = true;
    });
    const error = new OhMyOpenCodeError("Test", { code: "TEST_ERROR" });

    // #when
    await errorHandlerRegistry.handle(error);

    // #then
    expect(handled).toBe(true);
  });

  test("should invoke global handler for all errors", async () => {
    // #given
    const handledErrors: string[] = [];
    errorHandlerRegistry.registerGlobal((error) => {
      if (error instanceof OhMyOpenCodeError) {
        handledErrors.push(error.code);
      }
    });

    // #when
    await errorHandlerRegistry.handle(new OhMyOpenCodeError("Test1", { code: "ERR1" }));
    await errorHandlerRegistry.handle(new OhMyOpenCodeError("Test2", { code: "ERR2" }));

    // #then
    expect(handledErrors).toEqual(["ERR1", "ERR2"]);
  });

  test("should handle errors in handlers gracefully", async () => {
    // #given
    errorHandlerRegistry.register("TEST_ERROR", () => {
      throw new Error("Handler error");
    });
    const error = new OhMyOpenCodeError("Test", { code: "TEST_ERROR" });

    // #when - should not throw even if handler throws
    await errorHandlerRegistry.handle(error);
    
    // #then - if we get here, it didn't throw
    expect(true).toBe(true);
  });
});

describe("withErrorHandling", () => {
  test("should return result on success", async () => {
    // #given
    const fn = async () => "success";
    const wrapped = withErrorHandling(fn);

    // #when
    const result = await wrapped();

    // #then
    expect(result).toBe("success");
  });

  test("should catch and handle errors", async () => {
    // #given
    let errorHandled = false;
    const fn = async () => {
      throw new Error("Test error");
    };
    const wrapped = withErrorHandling(fn, {
      onError: () => { errorHandled = true; },
      rethrow: false,
    });

    // #when
    const result = await wrapped();

    // #then
    expect(result).toBeUndefined();
    expect(errorHandled).toBe(true);
  });

  test("should return default value on error", async () => {
    // #given
    const fn = async () => {
      throw new Error("Test error");
    };
    const wrapped = withErrorHandling(fn, {
      defaultValue: "default",
      rethrow: false,
    });

    // #when
    const result = await wrapped();

    // #then
    expect(result).toBe("default");
  });

  test("should rethrow by default", async () => {
    // #given
    const fn = async () => {
      throw new Error("Test error");
    };
    const wrapped = withErrorHandling(fn);

    // #when/then
    await expect(wrapped()).rejects.toThrow("Test error");
  });
});

describe("isRetryable", () => {
  test("should identify retryable errors", () => {
    expect(isRetryable(new NetworkError("Network error"))).toBe(true);
    expect(isRetryable(new TimeoutError("Timeout"))).toBe(true);
    expect(isRetryable(new ExternalServiceError("Service error"))).toBe(true);
  });

  test("should identify non-retryable errors", () => {
    expect(isRetryable(new ValidationError("Invalid input"))).toBe(false);
    expect(isRetryable(new PermissionError("Access denied"))).toBe(false);
  });

  test("should check common error messages", () => {
    expect(isRetryable(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryable(new Error("ETIMEDOUT"))).toBe(true);
    expect(isRetryable(new Error("ENOTFOUND"))).toBe(true);
  });
});

describe("retry", () => {
  test("should succeed on first attempt", async () => {
    // #given
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return "success";
    };

    // #when
    const result = await retry(fn);

    // #then
    expect(result).toBe("success");
    expect(attempts).toBe(1);
  });

  test("should retry on failure and succeed", async () => {
    // #given
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new NetworkError("Temporary failure");
      }
      return "success";
    };

    // #when
    const result = await retry(fn, { maxAttempts: 5, delayMs: 10 });

    // #then
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  test("should fail after max attempts", async () => {
    // #given
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new NetworkError("Permanent failure");
    };

    // #when/then
    await expect(
      retry(fn, { maxAttempts: 3, delayMs: 10 })
    ).rejects.toThrow("Permanent failure");
    expect(attempts).toBe(3);
  });

  test("should not retry non-retryable errors", async () => {
    // #given
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new ValidationError("Invalid input");
    };

    // #when/then
    await expect(
      retry(fn, { maxAttempts: 5, delayMs: 10 })
    ).rejects.toThrow("Invalid input");
    expect(attempts).toBe(1);
  });

  test("should use custom shouldRetry predicate", async () => {
    // #given
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("Custom error");
    };

    // #when/then
    await expect(
      retry(fn, {
        maxAttempts: 3,
        delayMs: 10,
        shouldRetry: (error) => error.message.includes("Custom"),
      })
    ).rejects.toThrow("Custom error");
    expect(attempts).toBe(3);
  });
});
