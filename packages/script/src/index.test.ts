import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Script } from './index'

// Mock external dependencies
const mockBun = {
  file: jest.fn(),
  spawn: jest.fn()
}

const mockSemver = {
  satisfies: jest.fn()
}

const mockFetch = jest.fn()

// Mock the modules
jest.mock('bun', () => mockBun)
jest.mock('semver', () => mockSemver)

// Mock global fetch
global.fetch = mockFetch

describe('Script', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup default mocks
    mockBun.file.mockReturnValue({
      json: jest.fn().mockResolvedValue({
        packageManager: '@bun@1.3.0'
      })
    })
    
    mockSemver.satisfies.mockReturnValue(true)
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        version: '1.2.3'
      })
    })
    
    // Mock $ command for git branch
    global.$ = {
      text: jest.fn().mockResolvedValue('main')
    } as any
    
    // Setup default environment variables
    delete process.env.OPENCODE_CHANNEL
    delete process.env.OPENCODE_BUMP
    delete process.env.OPENCODE_VERSION
    delete process.env.OPENCODE_RELEASE
    
    // Mock process.versions.bun
    Object.defineProperty(process, 'versions', {
      value: { bun: '1.3.0' },
      writable: true
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('package.json validation', () => {
    it('should throw error when packageManager field not found', async () => {
      mockBun.file.mockReturnValue({
        json: jest.fn().mockResolvedValue({})
      })

      await expect(Script.channel).rejects.toThrow('packageManager field not found in root package.json')
    })

    it('should extract bun version from packageManager field', async () => {
      mockBun.file.mockReturnValue({
        json: jest.fn().mockResolvedValue({
          packageManager: '@bun@1.3.5'
        })
      })

      // Should not throw
      await expect(Script.channel).resolves.toBeDefined()
    })

    it('should handle malformed packageManager field', async () => {
      mockBun.file.mockReturnValue({
        json: jest.fn().mockResolvedValue({
          packageManager: 'invalid-format'
        })
      })

      // Should still work as we use hardcoded range
      await expect(Script.channel).resolves.toBeDefined()
    })
  })

  describe('bun version validation', () => {
    it('should throw error when bun version does not satisfy requirement', async () => {
      mockSemver.satisfies.mockReturnValue(false)

      await expect(Script.channel).rejects.toThrow('This script requires bun@^1.3.0, but you are using bun@1.3.0')
    })

    it('should proceed when bun version satisfies requirement', async () => {
      mockSemver.satisfies.mockReturnValue(true)

      await expect(Script.channel).resolves.toBeDefined()
    })

    it('should handle missing process.versions.bun', async () => {
      Object.defineProperty(process, 'versions', {
        value: {},
        writable: true
      })

      await expect(Script.channel).rejects.toThrow('This script requires bun@^1.3.0, but you are using bun@undefined')
    })
  })

  describe('channel detection', () => {
    it('should use OPENCODE_CHANNEL environment variable when set', async () => {
      process.env.OPENCODE_CHANNEL = 'beta'

      expect(await Script.channel).toBe('beta')
    })

    it('should use latest channel when OPENCODE_BUMP is set', async () => {
      process.env.OPENCODE_BUMP = 'minor'

      expect(await Script.channel).toBe('latest')
    })

    it('should use latest channel when OPENCODE_VERSION is set and does not start with 0.0.0-', async () => {
      process.env.OPENCODE_VERSION = '1.0.0'

      expect(await Script.channel).toBe('latest')
    })

    it('should use git branch when no environment variables are set', async () => {
      const mockGit = {
        text: jest.fn().mockResolvedValue('feature-branch')
      }
      global.$ = mockGit as any

      expect(await Script.channel).toBe('feature-branch')
      expect(mockGit.text).toHaveBeenCalledWith('git branch --show-current')
    })

    it('should use git branch when OPENCODE_VERSION starts with 0.0.0-', async () => {
      process.env.OPENCODE_VERSION = '0.0.0-preview'
      const mockGit = {
        text: jest.fn().mockResolvedValue('develop')
      }
      global.$ = mockGit as any

      expect(await Script.channel).toBe('develop')
    })

    it('should trim whitespace from git branch output', async () => {
      const mockGit = {
        text: jest.fn().mockResolvedValue('  main  \n')
      }
      global.$ = mockGit as any

      expect(await Script.channel).toBe('main')
    })

    it('should handle git command errors', async () => {
      const mockGit = {
        text: jest.fn().mockRejectedValue(new Error('Git not found'))
      }
      global.$ = mockGit as any

      await expect(Script.channel).rejects.toThrow('Git not found')
    })
  })

  describe('version detection', () => {
    it('should use OPENCODE_VERSION environment variable when set', async () => {
      process.env.OPENCODE_VERSION = '2.0.0'

      expect(await Script.version).toBe('2.0.0')
    })

    it('should generate preview version for non-latest channels', async () => {
      process.env.OPENCODE_CHANNEL = 'feature-branch'
      const mockDate = new Date('2023-01-15T10:30:00')
      const originalDate = global.Date
      global.Date = jest.fn(() => mockDate) as any
      global.Date.now = jest.fn(() => mockDate.getTime())

      const version = await Script.version

      expect(version).toMatch(/^0\.0\.0-feature-branch-\d{14}$/)
      expect(version).toContain('20230115103000')

      global.Date = originalDate
    })

    it('should fetch latest version from npm for latest channel', async () => {
      // No environment variables set, defaults to latest via git branch
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/opencode-ai/latest')
      expect(version).toBe('1.2.4') // patch increment
    })

    it('should handle major version bump', async () => {
      process.env.OPENCODE_BUMP = 'major'
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(version).toBe('2.0.0')
    })

    it('should handle minor version bump', async () => {
      process.env.OPENCODE_BUMP = 'minor'
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(version).toBe('1.3.0')
    })

    it('should handle patch version bump (default)', async () => {
      process.env.OPENCODE_BUMP = 'patch'
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(version).toBe('1.2.4')
    })

    it('should handle case-insensitive bump type', async () => {
      process.env.OPENCODE_BUMP = 'MAJOR'
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(version).toBe('2.0.0')
    })

    it('should handle invalid version numbers from npm', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          version: 'invalid.version'
        })
      })
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(version).toBe('0.0.1') // defaults to 0.0.1 when parsing fails
    })

    it('should handle npm fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      await expect(Script.version).rejects.toThrow('Network error')
    })

    it('should handle npm non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      })
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      await expect(Script.version).rejects.toThrow('Not Found')
    })

    it('should handle complex version numbers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          version: '10.20.30-beta.1+build.123'
        })
      })
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      const version = await Script.version

      expect(version).toBe('10.20.31') // patch increment
    })
  })

  describe('preview detection', () => {
    it('should return false for latest channel', async () => {
      process.env.OPENCODE_CHANNEL = 'latest'

      expect(await Script.preview).toBe(false)
    })

    it('should return true for non-latest channels', async () => {
      process.env.OPENCODE_CHANNEL = 'beta'

      expect(await Script.preview).toBe(true)
    })

    it('should return true for feature branches', async () => {
      const mockGit = {
        text: jest.fn().mockResolvedValue('feature-test')
      }
      global.$ = mockGit as any

      expect(await Script.preview).toBe(true)
    })
  })

  describe('release detection', () => {
    it('should return false when OPENCODE_RELEASE is not set', async () => {
      expect(await Script.release).toBe(false)
    })

    it('should return true when OPENCODE_RELEASE is set', async () => {
      process.env.OPENCODE_RELEASE = 'true'

      expect(await Script.release).toBe(true)
    })

    it('should return true for any truthy OPENCODE_RELEASE value', async () => {
      process.env.OPENCODE_RELEASE = '1'

      expect(await Script.release).toBe(true)
    })
  })

  describe('team property', () => {
    it('should return the complete team array', () => {
      const team = Script.team

      expect(Array.isArray(team)).toBe(true)
      expect(team.length).toBeGreaterThan(0)
      expect(team).toContain('actions-user')
      expect(team).toContain('opencode')
      expect(team).toContain('thdxr')
      expect(team).toContain('opencode-agent[bot]')
    })

    it('should return the same array reference', () => {
      const team1 = Script.team
      const team2 = Script.team

      expect(team1).toBe(team2)
    })

    it('should contain all expected team members', () => {
      const expectedMembers = [
        "actions-user",
        "opencode",
        "rekram1-node",
        "thdxr",
        "kommander",
        "jayair",
        "fwang",
        "MrMushrooooom",
        "adamdotdevin",
        "iamdavidhill",
        "Brendonovich",
        "nexxeln",
        "Hona",
        "jlongster",
        "opencode-agent[bot]",
        "R44VC0RP",
      ]

      expect(Script.team).toEqual(expectedMembers)
    })
  })

  describe('integration scenarios', () => {
    it('should handle production release scenario', async () => {
      process.env.OPENCODE_CHANNEL = 'latest'
      process.env.OPENCODE_VERSION = '2.0.0'
      process.env.OPENCODE_RELEASE = 'true'

      expect(await Script.channel).toBe('latest')
      expect(await Script.version).toBe('2.0.0')
      expect(await Script.preview).toBe(false)
      expect(await Script.release).toBe(true)
    })

    it('should handle development preview scenario', async () => {
      const mockGit = {
        text: jest.fn().mockResolvedValue('feature-new-api')
      }
      global.$ = mockGit as any
      const mockDate = new Date('2023-01-15T10:30:00')
      const originalDate = global.Date
      global.Date = jest.fn(() => mockDate) as any
      global.Date.now = jest.fn(() => mockDate.getTime())

      expect(await Script.channel).toBe('feature-new-api')
      expect(await Script.version).toBe('0.0.0-feature-new-api-20230115103000')
      expect(await Script.preview).toBe(true)
      expect(await Script.release).toBe(false)

      global.Date = originalDate
    })

    it('should handle automated bump scenario', async () => {
      process.env.OPENCODE_BUMP = 'minor'
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      expect(await Script.channel).toBe('latest')
      expect(await Script.version).toBe('1.3.0')
      expect(await Script.preview).toBe(false)
    })

    it('should handle version override with bump', async () => {
      process.env.OPENCODE_VERSION = '3.0.0'
      process.env.OPENCODE_BUMP = 'major'

      expect(await Script.channel).toBe('latest')
      expect(await Script.version).toBe('3.0.0') // version takes precedence
    })
  })

  describe('error handling', () => {
    it('should handle package.json read errors', async () => {
      mockBun.file.mockReturnValue({
        json: jest.fn().mockRejectedValue(new Error('File not found'))
      })

      await expect(Script.channel).rejects.toThrow('File not found')
    })

    it('should handle invalid JSON in package.json', async () => {
      mockBun.file.mockReturnValue({
        json: jest.fn().mockRejectedValue(new SyntaxError('Invalid JSON'))
      })

      await expect(Script.channel).rejects.toThrow('Invalid JSON')
    })

    it('should handle network timeouts during version fetch', async () => {
      mockFetch.mockImplementation(() => new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 100)
      ))
      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      await expect(Script.version).rejects.toThrow('Timeout')
    })
  })

  describe('edge cases', () => {
    it('should handle empty environment variables', async () => {
      process.env.OPENCODE_CHANNEL = ''
      process.env.OPENCODE_VERSION = ''
      process.env.OPENCODE_BUMP = ''

      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      expect(await Script.channel).toBe('main')
      expect(await Script.version).toBe('1.2.4')
    })

    it('should handle whitespace-only environment variables', async () => {
      process.env.OPENCODE_CHANNEL = '   '
      process.env.OPENCODE_VERSION = '  '

      const mockGit = {
        text: jest.fn().mockResolvedValue('main')
      }
      global.$ = mockGit as any

      expect(await Script.channel).toBe('main')
      expect(await Script.version).toBe('1.2.4')
    })

    it('should handle very long branch names', async () => {
      const longBranchName = 'feature/very-long-branch-name-with-many-segments-and-numbers-12345'
      const mockGit = {
        text: jest.fn().mockResolvedValue(longBranchName)
      }
      global.$ = mockGit as any
      const mockDate = new Date('2023-01-15T10:30:00')
      const originalDate = global.Date
      global.Date = jest.fn(() => mockDate) as any
      global.Date.now = jest.fn(() => mockDate.getTime())

      const version = await Script.version

      expect(version).toContain(longBranchName)
      expect(version).toMatch(/^0\.0\.0-feature\/very-long-branch-name-with-many-segments-and-numbers-12345-\d{14}$/)

      global.Date = originalDate
    })
  })
})
