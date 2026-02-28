import { describe, expect, test } from "bun:test"
import { MessageV2 } from "./message-v2"

describe("MessageV2 Comprehensive", () => {
  describe("Error Types", () => {
    test("creates OutputLengthError", () => {
      const error = new MessageV2.OutputLengthError({})
      expect(error.name).toBe("MessageOutputLengthError")
      expect(error).toBeInstanceOf(Error)
    })

    test("creates AbortedError", () => {
      const error = new MessageV2.AbortedError({ message: "Operation aborted" })
      expect(error.name).toBe("MessageAbortedError")
      // The error.message is set to the error name, not the data.message
      expect(error.message).toBe("MessageAbortedError")
      // The actual message is in data.message
      expect(error.data.message).toBe("Operation aborted")
    })

    test("creates StructuredOutputError", () => {
      const error = new MessageV2.StructuredOutputError({
        message: "Invalid JSON",
        retries: 3
      })
      expect(error.name).toBe("StructuredOutputError")
      expect(error.data.message).toBe("Invalid JSON")
      expect(error.data.retries).toBe(3)
    })

    test("creates AuthError", () => {
      const error = new MessageV2.AuthError({
        providerID: "openai",
        message: "Invalid API key"
      })
      expect(error.name).toBe("ProviderAuthError")
      expect(error.data.providerID).toBe("openai")
    })

    test("creates APIError", () => {
      const error = new MessageV2.APIError({
        message: "API error",
        isRetryable: true,
        statusCode: 500
      })
      expect(error.name).toBe("APIError")
      expect(error.data.message).toBe("API error")
    })

    test("creates ContextOverflowError", () => {
      const error = new MessageV2.ContextOverflowError({
        message: "Context overflow"
      })
      expect(error.name).toBe("ContextOverflowError")
      expect(error.data.message).toBe("Context overflow")
    })
  })
})
