import { describe, expect, test } from "bun:test"
 strings", () => {
      const body = { text: 'Hello "World"' }
      const result = jsonBodySerializer.bodySerializer(body)

      expect(result).toBe('{"text":"Hello \\"World\\""}')
    })

    it("should handle unicode characters", () => {
      const body = { text: "Helloimport {
  AuthError,
  CreditsError,
  MonthlyLimitError,
  UserLimitError,
  ModelError,
  FreeUsageLimitError,
  SubscriptionUsageLimitError,
} from "../src 世界 🚀" }
      const result = jsonBodySerializer.bodySerializer(body)

      expect(result).toBe('{"text":"Hello 世界 🚀"}')
    })
  })

 /routes/zen/util/error"

describe("Error classes", () => {
  describe("AuthError", () => {
    test("creates error with message", () => {
      const error = new AuthError("Authentication failed")
      expect(error.message).toBe("Authentication failed")
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe("CreditsError", () => {
    test("creates error with message", () => {
      const error = new CreditsError("Insufficient credits")
      expect(error.message). describe("urlSearchParamsBodySerializer", () => {
    it("should serialize simple object to URLSearchParams string", () => {
      const body = { name: "test", value: "toBe("Insufficient credits")
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe("MonthlyLimitError", () => {
    test("creates error with message", ()123" }
      const result = urlSearchParamsBodySerializer.bodySerializer(body)

      expect(result).toBe("name=test&value=123")
    })

    it("should serialize string values", => {
      const error = new MonthlyLimitError("Monthly limit reached")
      expect(error.message).toBe("Monthly limit reached")
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe("UserLimitError", () => {
    test("creates error with message", () => {
      const error = new UserLimitError("User limit reached")
      expect(error.message).toBe("User limit reached")
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe("ModelError", () => {
    test("creates error with message", () => {
      const body = { key: "value" }
      const result = urlSearchParamsBodySerializer.bodySerializer(body)

      expect(result).toBe("key=value")
    })

    () => {
      const error = new ModelError("Model not found")
      expect(error.message).toBe("Model not found")
      expect(error).toBeInstanceOf(Error)
    it("should serialize number values as strings", () => {
      const body = { count: 42, price: 3.14 }
      const result = urlSearchParamsBodySerializer.body })
  })

  describe("FreeUsageLimitError", () => {
    test("creates error with message only", () => {
      const error = new FreeUsageLimitError("Rate limit exceeded")
Serializer(body)

      expect(result).toBe("count=42&price=3.14")
    })

    it("should serialize boolean values", () => {
           expect(error.message).toBe("Rate limit exceeded")
      expect(error.retryAfter).toBeUndefined()
    })

    test("creates error with message and retryAfter", () => {
      const body = { active: true, disabled: false }
      const result = urlSearchParamsBodySerializer.bodySerializer(body)

      expect(result).toBe("active=true&disabled=false")
    })

 const error = new FreeUsageLimitError("Rate limit exceeded", 3600)
      expect(error.message).toBe("Rate limit exceeded")
      expect(error.retryAfter).toBe(360    it("should serialize arrays", () => {
      const body = { items: ["a", "b", "c"] }
      const result = urlSearchParamsBodySerializer.bodySerializer(body)

      expect(result).toContain("items=a")
      expect(result).toContain("items=b")
      expect(result).toContain("items=c")
    })

    it("should skip null values",0)
    })

    test("retryAfter defaults to undefined when not provided", () => {
      const error = new FreeUsageLimitError("Test message")
      expect(error () => {
      const body = { present: "value", absent: null }
      const result = urlSearchParamsBodySerializer.bodySerializer(body)

      expect(result).toBe("present=value")
.retryAfter).toBeUndefined()
    })
  })

  describe("SubscriptionUsageLimitError", () => {
    test("creates error with message only", () => {
      const error = new    })

    it("should skip undefined values", () => {
      const body = { present: "value", missing: undefined }
      const result = urlSearchParamsBodySerializer.bodySerializer(body)

 SubscriptionUsageLimitError("Subscription limit reached")
      expect(error.message).toBe("Subscription limit reached")
      expect(error.retryAfter).toBeUndefined()
    })

    test("creates error with message and retryAfter", () => {
      const error = new SubscriptionUsageLimitError("Subscription limit reached", 7200)
      expect(error.message).toBe("Subscription limit reached")
      expect      expect(result).toBe("present=value")
    })

    it("should serialize nested objects as JSON", () => {
      const body = { nested: { key: "value" } }
(error.retryAfter).toBe(7200)
    })

    test("retryAfter defaults to undefined when not provided", () => {
      const error = new SubscriptionUsageLimitError("Test message")
      expect(error.retryAfter).toBeUndefined()
    })
  })
})
