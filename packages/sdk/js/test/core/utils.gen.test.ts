import { describe, expect, test } from "bun:test"
import { defaultPathSerializer, getUrl, getValidRequestBody, PATH_PARAM_RE } from "../../src/v2/gen/core/utils.gen"

describe("utils.gen defaultPathSerializer", () => {
  test("replaces simple primitive path parameters", () => {
    const url = defaultPathSerializer({
      path: { id: "123" },
      url: "/users/{id}",
    })
    expect(url).toBe("/users/123")
  })

  test("handles label and matrix styles with arrays and objects", () => {
    const url = defaultPathSerializer({
      path: {
        // label style
        tags: ["a", "b"],
        // matrix style
        filter: { status: "open", sort: "desc" },
      },
      url: "/items/{.tags}{;filter*}",
    })
    expect(url).not.toContain("{.tags}")
    expect(url).not.toContain("{;filter*}")
    expect(url.startsWith("/items/")).toBe(true)
  })

  test("skips undefined and null values", () => {
    const url = defaultPathSerializer({
      path: { id: undefined, name: null },
      url: "/things/{id}/{name}",
    })
    expect(url).toBe("/things/{id}/{name}")
  })

  test("PATH_PARAM_RE matches path placeholders", () => {
    const matches = "/foo/{bar}/baz/{id*}".match(PATH_PARAM_RE)
    expect(matches).toEqual(["{bar}", "{id*}"])
  })
})

describe("utils.gen getUrl", () => {
  const querySerializer = (query: Record<string, unknown>) => {
    const entries = Object.entries(query)
    if (!entries.length) return ""
    return "?" + entries.map(([k, v]) => `${k}=${v}`).join("&")
  }

  test("builds URL with base, path params, and query", () => {
    const url = getUrl({
      baseUrl: "https://api.example.com",
      path: { id: "42" },
      query: { a: 1, b: "two" },
      querySerializer,
      url: "items/{id}",
    })

    expect(url.startsWith("https://api.example.com/items/42")).toBe(true)
    expect(url).toContain("a=1")
    expect(url).toContain("b=two")
  })

  test("handles leading slash and strips leading ? from querySerializer", () => {
    const qs = () => "?x=1"
    const url = getUrl({
      baseUrl: "",
      path: undefined,
      query: { x: 1 },
      querySerializer: qs,
      url: "/test",
    })
    expect(url).toBe("/test?x=1")
  })
})

describe("utils.gen getValidRequestBody", () => {
  test("returns undefined when no body provided", () => {
    expect(
      getValidRequestBody({
        body: undefined,
      }),
    ).toBeUndefined()
  })

  test("returns plain body when no serializer is provided", () => {
    expect(
      getValidRequestBody({
        body: "text-body",
      }),
    ).toBe("text-body")
  })

  test("returns serializedBody when provided and non-empty", () => {
    const body = { foo: "bar" }
    const result = getValidRequestBody({
      body,
      bodySerializer: {} as any,
      serializedBody: '{"foo":"bar"}',
    })
    expect(result).toBe('{"foo":"bar"}')
  })

  test("returns null when serializedBody is empty or undefined", () => {
    const body = { foo: "bar" }
    const result1 = getValidRequestBody({
      body,
      bodySerializer: {} as any,
      serializedBody: "",
    })
    const result2 = getValidRequestBody({
      body,
      bodySerializer: {} as any,
      serializedBody: undefined,
    })
    expect(result1).toBeNull()
    expect(result2).toBeNull()
  })

  test("falls back to body when serializer exists but no serializedBody property", () => {
    const body = '{"x":1}'
    const result = getValidRequestBody({
      body,
      bodySerializer: {} as any,
    })
    expect(result).toBe(body)

    const emptyBodyResult = getValidRequestBody({
      body: "",
      bodySerializer: {} as any,
    })
    expect(emptyBodyResult).toBeNull()
  })
})

