import { describe, expect, test } from "bun:test"
import {
  AuthError,
  CreditsError,
  MonthlyLimitError,
  UserLimitError,
  ModelError,
  FreeUsageLimitError,
  SubscriptionUsageLimitError,
} from "./error"

describe("AuthError", () => {
  test("creates error with message", () => {
    const error = new AuthError("Authentication failed")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AuthError)
    expect(error.message).toBe("Authentication failed")
    expect(error.name).toBe("Error") // Default Error name
  })

  test("creates error without message", () => {
    const error = new AuthError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AuthError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
  })

  test("has stack trace", () => {
    const error = new AuthError("test")
    expect(error.stack).toBeDefined()
    expect(typeof error.stack).toBe("string")
  })
})

describe("CreditsError", () => {
  test("creates error with message", () => {
    const error = new CreditsError("Insufficient credits")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(CreditsError)
    expect(error.message).toBe("Insufficient credits")
    expect(error.name).toBe("Error") // Default Error name
  })

  test("creates error without message", () => {
    const error = new CreditsError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(CreditsError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
  })
})

describe("MonthlyLimitError", () => {
  test("creates error with message", () => {
    const error = new MonthlyLimitError("Monthly limit exceeded")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(MonthlyLimitError)
    expect(error.message).toBe("Monthly limit exceeded")
    expect(error.name).toBe("Error") // Default Error name
  })

  test("creates error without message", () => {
    const error = new MonthlyLimitError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(MonthlyLimitError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
  })
})

describe("UserLimitError", () => {
  test("creates error with message", () => {
    const error = new UserLimitError("User limit exceeded")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(UserLimitError)
    expect(error.message).toBe("User limit exceeded")
    expect(error.name).toBe("Error") // Default Error name
  })

  test("creates error without message", () => {
    const error = new UserLimitError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(UserLimitError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
  })
})

describe("ModelError", () => {
  test("creates error with message", () => {
    const error = new ModelError("Model not available")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ModelError)
    expect(error.message).toBe("Model not available")
    expect(error.name).toBe("Error") // Default Error name
  })

  test("creates error without message", () => {
    const error = new ModelError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ModelError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
  })
})

describe("FreeUsageLimitError", () => {
  test("creates error with message and retryAfter", () => {
    const error = new FreeUsageLimitError("Free limit exceeded", 300)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(FreeUsageLimitError)
    expect(error.message).toBe("Free limit exceeded")
    expect(error.name).toBe("Error") // Default Error name
    expect(error.retryAfter).toBe(300)
  })

  test("creates error with message without retryAfter", () => {
    const error = new FreeUsageLimitError("Free limit exceeded")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(FreeUsageLimitError)
    expect(error.message).toBe("Free limit exceeded")
    expect(error.name).toBe("Error") // Default Error name
    expect(error.retryAfter).toBeUndefined()
  })

  test("creates error without message or retryAfter", () => {
    const error = new FreeUsageLimitError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(FreeUsageLimitError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
    expect(error.retryAfter).toBeUndefined()
  })

  test("creates error with retryAfter zero", () => {
    const error = new FreeUsageLimitError("Retry immediately", 0)
    expect(error.retryAfter).toBe(0)
  })

  test("creates error with negative retryAfter", () => {
    const error = new FreeUsageLimitError("Negative retry", -1)
    expect(error.retryAfter).toBe(-1)
  })
})

describe("SubscriptionUsageLimitError", () => {
  test("creates error with message and retryAfter", () => {
    const error = new SubscriptionUsageLimitError("Subscription limit exceeded", 600)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(SubscriptionUsageLimitError)
    expect(error.message).toBe("Subscription limit exceeded")
    expect(error.name).toBe("Error") // Default Error name
    expect(error.retryAfter).toBe(600)
  })

  test("creates error with message without retryAfter", () => {
    const error = new SubscriptionUsageLimitError("Subscription limit exceeded")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(SubscriptionUsageLimitError)
    expect(error.message).toBe("Subscription limit exceeded")
    expect(error.name).toBe("Error") // Default Error name
    expect(error.retryAfter).toBeUndefined()
  })

  test("creates error without message or retryAfter", () => {
    const error = new SubscriptionUsageLimitError()
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(SubscriptionUsageLimitError)
    expect(error.message).toBe("")
    expect(error.name).toBe("Error") // Default Error name
    expect(error.retryAfter).toBeUndefined()
  })
})

describe("Error inheritance", () => {
  test("all errors inherit from Error", () => {
    const errors = [
      new AuthError(),
      new CreditsError(),
      new MonthlyLimitError(),
      new UserLimitError(),
      new ModelError(),
      new FreeUsageLimitError(),
      new SubscriptionUsageLimitError(),
    ]

    errors.forEach(error => {
      expect(error).toBeInstanceOf(Error)
      expect(typeof error.message).toBe("string")
      expect(typeof error.name).toBe("string")
      expect(error.stack).toBeDefined()
    })
  })

  test("limit errors have retryAfter property", () => {
    const limitErrors = [
      new FreeUsageLimitError("test", 100),
      new SubscriptionUsageLimitError("test", 200),
    ]

    limitErrors.forEach(error => {
      expect(error.retryAfter).toBeDefined()
      expect(typeof error.retryAfter).toBe("number")
    })
  })

  test("non-limit errors do not have retryAfter property", () => {
    const nonLimitErrors = [
      new AuthError(),
      new CreditsError(),
      new MonthlyLimitError(),
      new UserLimitError(),
      new ModelError(),
    ]

    nonLimitErrors.forEach(error => {
      expect((error as any).retryAfter).toBeUndefined()
    })
  })
})
