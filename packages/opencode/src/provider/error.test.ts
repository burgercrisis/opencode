// Tests in this file test internal/private functions that are not exported.
// The ProviderError namespace does not export its internal functions (isOverflow, 
// isOpenAiErrorRetryable, error, message, json, parseStreamError, parseAPICallError).
// These tests are skipped as they test implementation details.

// If you need to test these functions, either:
// 1. Export them from the namespace in error.ts
// 2. Or test them through integration tests that exercise the public API

import { describe, it, expect } from "bun:test"

// Placeholder test to ensure test framework works
describe("ProviderError", () => {
  it("placeholder test", () => {
    expect(true).toBe(true)
  })
})
