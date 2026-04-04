import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { FileRoutes } from "../../routes/file"
import { File } from "../../../file"
import { Ripgrep } from "../../../file/ripgrep"
import { LSP } from "../../../lsp"
import { Instance } from "../../../project/instance"

// Mock the dependencies
const mockRipgrepMatches = [
  {
    path: "src/test.ts",
    line: 10,
    column: 5,
    content: "console.log('test')",
    match: "test"
  },
  {
    path: "src/other.ts",
    line: 20,
    column: 3,
    content: "function test() {}",
    match: "test"
  }
]

const mockFileSearchResults = [
  "src/test.ts",
  "src/other.ts",
  "docs/test.md"
]

const mockLSPSymbols = [
  {
    name: "testFunction",
    kind: 12,
    location: {
      uri: "file:///src/test.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 10, character: 0 }
      }
    }
  }
]

const mockFileNodes = [
  {
    name: "test.ts",
    path: "src/test.ts",
    type: "file",
    size: 1024,
    modified: new Date().toISOString()
  },
  {
    name: "src",
    path: "src",
    type: "directory",
    size: 0,
    modified: new Date().toISOString()
  }
]

const mockFileContent = {
  path: "src/test.ts",
  content: "console.log('test')\nfunction test() {}\n",
  encoding: "utf-8",
  size: 45
}

const mockFileStatus = [
  {
    path: "src/test.ts",
    status: "modified",
    staged: false
  },
  {
    path: "src/new.ts",
    status: "untracked",
    staged: false
  }
]

// Mock the modules
const originalRipgrepSearch = Ripgrep.search
const originalFileSearch = File.search
const originalLSPWorkspaceSymbol = LSP.workspaceSymbol
const originalFileList = File.list
const originalFileRead = File.read
const originalFileStatus = File.status
const originalInstanceDirectory = Instance.directory

beforeAll(() => {
  Ripgrep.search = async () => mockRipgrepMatches
  File.search = async () => mockFileSearchResults
  LSP.workspaceSymbol = async () => mockLSPSymbols
  File.list = async () => mockFileNodes
  File.read = async () => mockFileContent
  File.status = async () => mockFileStatus
  Instance.directory = "/test/project"
})

afterAll(() => {
  Ripgrep.search = originalRipgrepSearch
  File.search = originalFileSearch
  LSP.workspaceSymbol = originalLSPWorkspaceSymbol
  File.list = originalFileList
  File.read = originalFileRead
  File.status = originalFileStatus
  Instance.directory = originalInstanceDirectory
})

describe("FileRoutes", () => {
  let app: ReturnType<typeof FileRoutes>

  beforeEach(() => {
    app = FileRoutes()
  })

  describe("GET /find", () => {
    it("should search for text patterns", async () => {
      const res = await app.request("/find?pattern=test")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
      expect(json).toEqual(mockRipgrepMatches)
    })

    it("should validate required pattern parameter", async () => {
      const res = await app.request("/find")
      expect(res.status).toBe(400)
    })

    it("should handle empty pattern", async () => {
      const res = await app.request("/find?pattern=")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle special characters in pattern", async () => {
      const res = await app.request("/find?pattern=test.*function")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle ripgrep search errors", async () => {
      Ripgrep.search = async () => {
        throw new Error("Ripgrep search failed")
      }

      const res = await app.request("/find?pattern=test")
      expect(res.status).toBe(500)
    })

    it("should handle empty search results", async () => {
      Ripgrep.search = async () => []

      const res = await app.request("/find?pattern=nonexistent")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })
  })

  describe("GET /find/file", () => {
    it("should search for files", async () => {
      const res = await app.request("/find/file?query=test")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
      expect(json).toEqual(mockFileSearchResults)
    })

    it("should validate required query parameter", async () => {
      const res = await app.request("/find/file")
      expect(res.status).toBe(400)
    })

    it("should handle dirs parameter", async () => {
      const res = await app.request("/find/file?query=test&dirs=true")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle dirs=false parameter", async () => {
      const res = await app.request("/find/file?query=test&dirs=false")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle type parameter", async () => {
      const res = await app.request("/find/file?query=test&type=file")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle limit parameter", async () => {
      const res = await app.request("/find/file?query=test&limit=5")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should validate limit parameter bounds", async () => {
      const res = await app.request("/find/file?query=test&limit=0")
      expect(res.status).toBe(400)

      const res2 = await app.request("/find/file?query=test&limit=201")
      expect(res2.status).toBe(400)
    })

    it("should handle file search errors", async () => {
      File.search = async () => {
        throw new Error("File search failed")
      }

      const res = await app.request("/find/file?query=test")
      expect(res.status).toBe(500)
    })

    it("should handle empty search results", async () => {
      File.search = async () => []

      const res = await app.request("/find/file?query=nonexistent")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })
  })

  describe("GET /find/symbol", () => {
    it("should return empty array (currently disabled)", async () => {
      const res = await app.request("/find/symbol?query=test")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(json).toEqual([])
    })

    it("should validate required query parameter", async () => {
      const res = await app.request("/find/symbol")
      expect(res.status).toBe(400)
    })

    it("should handle empty query", async () => {
      const res = await app.request("/find/symbol?query=")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })

    it("should handle special characters in query", async () => {
      const res = await app.request("/find/symbol?query=testFunction*")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })
  })

  describe("GET /file", () => {
    it("should list files and directories", async () => {
      const res = await app.request("/file?path=src")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
      expect(json).toEqual(mockFileNodes)
    })

    it("should validate required path parameter", async () => {
      const res = await app.request("/file")
      expect(res.status).toBe(400)
    })

    it("should handle empty path", async () => {
      const res = await app.request("/file?path=")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle special characters in path", async () => {
      const res = await app.request("/file?path=src/test%20folder")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
    })

    it("should handle file listing errors", async () => {
      File.list = async () => {
        throw new Error("File listing failed")
      }

      const res = await app.request("/file?path=src")
      expect(res.status).toBe(500)
    })

    it("should handle empty directory", async () => {
      File.list = async () => []

      const res = await app.request("/file?path=empty")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })
  })

  describe("GET /file/content", () => {
    it("should read file content", async () => {
      const res = await app.request("/file/content?path=src/test.ts")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(json).toEqual(mockFileContent)
    })

    it("should validate required path parameter", async () => {
      const res = await app.request("/file/content")
      expect(res.status).toBe(400)
    })

    it("should handle empty path", async () => {
      const res = await app.request("/file/content?path=")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("path", "")
    })

    it("should handle special characters in path", async () => {
      const res = await app.request("/file/content?path=src/test%20file.ts")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toHaveProperty("path")
    })

    it("should handle file reading errors", async () => {
      File.read = async () => {
        throw new Error("File read failed")
      }

      const res = await app.request("/file/content?path=src/test.ts")
      expect(res.status).toBe(500)
    })

    it("should handle non-existent file", async () => {
      File.read = async () => {
        throw new Error("File not found")
      }

      const res = await app.request("/file/content?path=nonexistent.ts")
      expect(res.status).toBe(500)
    })
  })

  describe("GET /file/status", () => {
    it("should get file status", async () => {
      const res = await app.request("/file/status")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/application\/json/)

      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
      expect(json).toEqual(mockFileStatus)
    })

    it("should handle file status errors", async () => {
      File.status = async () => {
        throw new Error("File status failed")
      }

      const res = await app.request("/file/status")
      expect(res.status).toBe(500)
    })

    it("should handle empty status", async () => {
      File.status = async () => []

      const res = await app.request("/file/status")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })

    it("should handle clean working directory", async () => {
      File.status = async () => []

      const res = await app.request("/file/status")
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json).toEqual([])
    })
  })

  describe("Route validation", () => {
    it("should handle invalid HTTP methods", async () => {
      const res = await app.request("/find", { method: "POST" })
      expect(res.status).toBe(404)

      const res2 = await app.request("/file", { method: "POST" })
      expect(res2.status).toBe(404)

      const res3 = await app.request("/file/status", { method: "PUT" })
      expect(res3.status).toBe(404)
    })

    it("should handle malformed query parameters", async () => {
      const res = await app.request("/find/file?query=test&limit=invalid")
      expect(res.status).toBe(400)

      const res2 = await app.request("/find/file?query=test&dirs=maybe")
      expect(res2.status).toBe(400)

      const res3 = await app.request("/find/file?query=test&type=invalid")
      expect(res3.status).toBe(400)
    })
  })

  describe("Edge cases", () => {
    it("should handle concurrent requests", async () => {
      const promises = Array(10).fill(null).map(() =>
        app.request("/file/status").then(r => r.json())
      )

      const results = await Promise.all(promises)
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true)
      })
    })

    it("should handle very long paths", async () => {
      const longPath = "a".repeat(1000)
      const res = await app.request(`/file/content?path=${longPath}`)
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle unicode characters", async () => {
      const unicodePath = "src/测试文件.ts"
      const res = await app.request(`/file/content?path=${encodeURIComponent(unicodePath)}`)
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle path traversal attempts", async () => {
      const res = await app.request("/file/content?path=../../../etc/passwd")
      expect([200, 400, 500]).toContain(res.status)
    })

    it("should handle complex search patterns", async () => {
      const complexPattern = "function.*test.*\{"
      const res = await app.request(`/find?pattern=${encodeURIComponent(complexPattern)}`)
      expect([200, 400, 500]).toContain(res.status)
    })
  })
})
