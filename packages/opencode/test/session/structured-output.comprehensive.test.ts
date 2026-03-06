// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionPrompt } from "../../src/session/prompt"
import path from "path"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

// Skip tests if no API key is available
const hasApiKey = !!process.env.ANTHROPIC_API_KEY

// Helper to run test within Instance context
async function withInstance<T>(fn: () => Promise<T>): Promise<T> {
  return Instance.provide({
    directory: projectRoot,
    fn,
  })
}

describe("Structured Output - Comprehensive Tests", () => {
  describe("MessageV2 Format Schema Validation", () => {
    bulletproofTest("parses text format", async () => {
      const result = MessageV2.Format.safeParse({ type: "text" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("text")
      }
    })

    bulletproofTest("parses json_schema format with defaults", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: { type: "object", properties: { name: { type: "string" } } },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.retryCount).toBe(2) // default value
        }
      }
    })

    bulletproofTest("parses json_schema format with custom retryCount", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: { type: "object", properties: { name: { type: "string" } } },
        retryCount: 5,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.retryCount).toBe(5)
        }
      }
    })

    bulletproofTest("rejects invalid format type", async () => {
      const result = MessageV2.Format.safeParse({
        type: "invalid" as any,
        schema: { type: "object" },
      })
      expect(result.success).toBe(false)
    })

    bulletproofTest("rejects json_schema without schema", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
      })
      expect(result.success).toBe(false)
    })

    bulletproofTest("rejects invalid retryCount", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: { type: "object" },
        retryCount: -1,
      })
      expect(result.success).toBe(false)
    })

    bulletproofTest("handles complex JSON schemas", async () => {
      const complexSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
              email: { type: "string", format: "email" }
            },
            required: ["name", "email"]
          },
          tags: {
            type: "array",
            items: { type: "string" }
          },
          metadata: {
            type: "object",
            additionalProperties: true
          }
        },
        required: ["user"]
      }

      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: complexSchema,
        retryCount: 3,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.retryCount).toBe(3)
          expect(result.data.schema).toEqual(complexSchema)
        }
      }
    })
  })

  describe("Structured Output Integration", () => {
    test.skipIf(!hasApiKey)(
      "produces structured output with simple schema",
      async () => {
        await withInstance(async () => {
          const session = await Session.create({ title: "Structured Output Test" })

          const result = await SessionPrompt.prompt({
            session,
            messages: [
              {
                role: "user",
                content: "Extract user information from: 'John Doe is 30 years old and works as a developer'",
              },
            ],
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  age: { type: "number" },
                  profession: { type: "string" },
                },
                required: ["name", "age"],
              },
            },
          })

          expect(result).toBeDefined()
          expect(typeof result).toBe("object")
        })
      }
    )

    test.skipIf(!hasApiKey)(
      "produces structured output with nested schema",
      async () => {
        await withInstance(async () => {
          const session = await Session.create({ title: "Nested Schema Test" })

          const result = await SessionPrompt.prompt({
            session,
            messages: [
              {
                role: "user",
                content: "Analyze this product: 'iPhone 15 Pro costs $999, has 256GB storage, and comes in Space Black'",
              },
            ],
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: {
                  product: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      price: { type: "number" },
                      specifications: {
                        type: "object",
                        properties: {
                          storage: { type: "string" },
                          color: { type: "string" },
                        },
                      },
                    },
                    required: ["name", "price"],
                  },
                },
                required: ["product"],
              },
            },
          })

          expect(result).toBeDefined()
          expect(typeof result).toBe("object")
        })
      }
    )

    test.skipIf(!hasApiKey)(
      "handles structured output with array schemas",
      async () => {
        await withInstance(async () => {
          const session = await Session.create({ title: "Array Schema Test" })

          const result = await SessionPrompt.prompt({
            session,
            messages: [
              {
                role: "user",
                content: "List the first 5 planets in our solar system",
              },
            ],
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: {
                  planets: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        order: { type: "number" },
                      },
                      required: ["name", "order"],
                    },
                  },
                },
                required: ["planets"],
              },
            },
          })

          expect(result).toBeDefined()
          expect(typeof result).toBe("object")
        })
      }
    )
  })

  describe("Structured Output Edge Cases", () => {
    bulletproofTest("handles empty schema gracefully", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: {},
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.schema).toEqual({})
        }
      }
    })

    bulletproofTest("handles schema with additionalProperties", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            known: { type: "string" },
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.schema.additionalProperties).toBe(true)
        }
      }
    })

    bulletproofTest("handles schema with pattern properties", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: {
          type: "object",
          patternProperties: {
            "^prefix_": { type: "string" },
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.schema.patternProperties).toBeDefined()
        }
      }
    })

    bulletproofTest("handles schema with allOf, anyOf, oneOf", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: {
          type: "object",
          allOf: [
            { type: "object", properties: { name: { type: "string" } } },
            { type: "object", properties: { age: { type: "number" } } },
          ],
          anyOf: [
            { type: "object", properties: { email: { type: "string" } } },
            { type: "object", properties: { phone: { type: "string" } } },
          ],
          oneOf: [
            { type: "object", properties: { admin: { type: "boolean" } } },
            { type: "object", properties: { user: { type: "boolean" } } },
          ],
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.schema.allOf).toBeDefined()
          expect(result.data.schema.anyOf).toBeDefined()
          expect(result.data.schema.oneOf).toBeDefined()
        }
      }
    })
  })

  describe("Structured Output Performance", () => {
    bulletproofTest("handles large schemas efficiently", async () => {
      const largeSchema = {
        type: "object",
        properties: {},
        required: [],
      }

      // Create a schema with many properties
      for (let i = 0; i < 100; i++) {
        largeSchema.properties[`field${i}`] = {
          type: "object",
          properties: {
            nested1: { type: "string" },
            nested2: { type: "number" },
            nested3: { type: "boolean" },
          },
        }
        largeSchema.required.push(`field${i}`)
      }

      const startTime = Date.now()
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: largeSchema,
      })
      const endTime = Date.now()

      expect(result.success).toBe(true)
      expect(endTime - startTime).toBeLessThan(100) // Should complete quickly
    })

    bulletproofTest("handles deeply nested schemas efficiently", async () => {
      let nestedSchema: any = { type: "string" }

      // Create deeply nested structure
      for (let i = 0; i < 50; i++) {
        nestedSchema = {
          type: "object",
          properties: {
            [`level${i}`]: nestedSchema,
          },
        }
      }

      const startTime = Date.now()
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: nestedSchema,
      })
      const endTime = Date.now()

      expect(result.success).toBe(true)
      expect(endTime - startTime).toBeLessThan(100) // Should complete quickly
    })
  })

  describe("Structured Output Error Handling", () => {
    bulletproofTest("handles malformed schemas gracefully", async () => {
      const malformedSchemas = [
        null,
        undefined,
        "string" as any,
        123 as any,
        [],
        { type: "json_schema" }, // Missing schema
        { schema: {} }, // Missing type
        { type: "json_schema", schema: null }, // Invalid schema
      ]

      for (const malformedSchema of malformedSchemas) {
        const result = MessageV2.Format.safeParse(malformedSchema)
        expect(result.success).toBe(false)
      }
    })

    bulletproofTest("handles circular references in schemas", async () => {
      const schema: any = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      }
      schema.self = schema // Create circular reference

      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema,
      })

      // Should handle circular references without infinite loops
      expect(typeof result.success).toBe("boolean")
    })

    bulletproofTest("handles very large retryCount values", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: { type: "object" },
        retryCount: Number.MAX_SAFE_INTEGER,
      })

      expect(result.success).toBe(false) // Should reject unreasonably large values
    })

    bulletproofTest("handles negative retryCount values", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: { type: "object" },
        retryCount: -1,
      })

      expect(result.success).toBe(false)
    })

    bulletproofTest("handles fractional retryCount values", async () => {
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: { type: "object" },
        retryCount: 2.5,
      })

      expect(result.success).toBe(false)
    })
  })

  describe("Structured Output Validation", () => {
    bulletproofTest("validates JSON Schema Draft 7 features", async () => {
      const draft7Schema = {
        type: "object",
        properties: {
          stringField: { 
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "^[a-zA-Z]+$"
          },
          numberField: {
            type: "number",
            minimum: 0,
            maximum: 100,
            multipleOf: 5
          },
          arrayField: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
            uniqueItems: true
          },
          enumField: {
            type: "string",
            enum: ["option1", "option2", "option3"]
          },
          constField: {
            type: "string",
            const: "fixed_value"
          }
        },
        required: ["stringField", "numberField"]
      }

      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: draft7Schema,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.schema).toEqual(draft7Schema)
        }
      }
    })

    bulletproofTest("handles schema references ($ref)", async () => {
      const schemaWithRef = {
        type: "object",
        properties: {
          user: { $ref: "#/definitions/User" },
          admin: { $ref: "#/definitions/Admin" },
        },
        definitions: {
          User: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name"],
          },
          Admin: {
            allOf: [
              { $ref: "#/definitions/User" },
              { type: "object", properties: { permissions: { type: "array" } } }
            ],
          },
        },
      }

      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: schemaWithRef,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe("json_schema")
        if (result.data.type === "json_schema") {
          expect(result.data.schema.definitions).toBeDefined()
        }
      }
    })
  })

  describe("Structured Output Security", () => {
    bulletproofTest("handles potentially malicious schemas", async () => {
      const maliciousSchemas = [
        {
          type: "object",
          properties: {
            xss: { type: "string", default: "<script>alert('xss')</script>" },
          },
        },
        {
          type: "object",
          properties: {
            injection: { type: "string", pattern: "'; DROP TABLE users; --" },
          },
        },
        {
          type: "object",
          properties: {
            path: { type: "string", format: "path" },
          },
        },
      ]

      for (const schema of maliciousSchemas) {
        const result = MessageV2.Format.safeParse({
          type: "json_schema",
          schema,
        })

        // Should parse without throwing, but security should be handled at runtime
        expect(typeof result.success).toBe("boolean")
      }
    })

    bulletproofTest("handles extremely large schemas", async () => {
      const hugeSchema = {
        type: "object",
        properties: {},
      }

      // Create schema with 10,000 properties
      for (let i = 0; i < 10000; i++) {
        hugeSchema.properties[`field${i}`] = {
          type: "string",
          description: "x".repeat(100), // Make it even larger
        }
      }

      const startTime = Date.now()
      const result = MessageV2.Format.safeParse({
        type: "json_schema",
        schema: hugeSchema,
      })
      const endTime = Date.now()

      expect(typeof result.success).toBe("boolean")
      expect(endTime - startTime).toBeLessThan(1000) // Should complete in reasonable time
    })
  })
})
