import { describe, it, expect, beforeEach } from 'bun:test'
import { EditTool } from '@/tool/edit'
import { MultiEditTool } from '@/tool/multiedit'
import { Instance } from '@/project/instance'
import { FileTime } from '@/file/time'
import { Bus } from '@/bus'
import { File } from '@/file'
import { FileWatcher } from '@/file/watcher'
import path from 'path'

// Mock dependencies
const mockCtx = {
  sessionID: 'test-session',
  ask: async () => Promise.resolve(),
  metadata: async () => Promise.resolve(),
}

const mockFilePath = path.join(Instance.directory, 'test-file.txt')

describe('Edit Tool Fixes', () => {
  beforeEach(async () => {
    // Clean up test file
    try {
      await Bun.write(mockFilePath, 'original content')
    } catch {
      // File might not exist, that's ok
    }
  })

  it('should reject empty oldString', async () => {
    const tool = await EditTool.init()
    
    await expect(tool.execute({
      filePath: mockFilePath,
      oldString: '',
      newString: 'new content'
    }, mockCtx)).rejects.toThrow('oldString is required and cannot be empty')
  })

  it('should reject empty newString', async () => {
    const tool = await EditTool.init()
    
    await expect(tool.execute({
      filePath: mockFilePath,
      oldString: 'original',
      newString: ''
    }, mockCtx)).rejects.toThrow('newString is required and cannot be empty')
  })

  it('should reject identical strings', async () => {
    const tool = await EditTool.init()
    
    await expect(tool.execute({
      filePath: mockFilePath,
      oldString: 'same',
      newString: 'same'
    }, mockCtx)).rejects.toThrow('No changes to apply: oldString and newString are identical')
  })

  it('should reject strings with null bytes', async () => {
    const tool = await EditTool.init()
    
    await expect(tool.execute({
      filePath: mockFilePath,
      oldString: 'test\0malicious',
      newString: 'replacement'
    }, mockCtx)).rejects.toThrow('String parameters cannot contain null bytes')
  })

  it('should reject oversized strings', async () => {
    const tool = await EditTool.init()
    const longString = 'a'.repeat(2000) // Assuming MAX_LENGTH is less than this
    
    await expect(tool.execute({
      filePath: mockFilePath,
      oldString: longString,
      newString: 'replacement'
    }, mockCtx)).rejects.toThrow('String parameters too long')
  })

  it('should successfully apply valid edits', async () => {
    const tool = await EditTool.init()
    
    // Write initial content
    await Bun.write(mockFilePath, 'Hello world!')
    
    const result = await tool.execute({
      filePath: mockFilePath,
      oldString: 'world',
      newString: 'universe'
    }, mockCtx)
    
    expect(result).toBeDefined()
    expect(result.output).toContain('successfully')
    
    // Verify the change was applied
    const finalContent = await Bun.file(mockFilePath).text()
    expect(finalContent).toContain('Hello universe!')
  })
})

describe('MultiEdit Tool Fixes', () => {
  beforeEach(async () => {
    // Clean up test file
    try {
      await Bun.write(mockFilePath, 'line1\nline2\nline3\nline4\nline5')
    } catch {
      // File might not exist, that's ok
    }
  })

  it('should handle empty edits array', async () => {
    const tool = await MultiEditTool.init()
    
    const result = await tool.execute({
      filePath: mockFilePath,
      edits: []
    }, mockCtx)
    
    expect(result).toBeDefined()
    expect(result.metadata.editCount).toBe(0)
    expect(result.output).toBe('No edits to apply')
  })

  it('should apply multiple edits sequentially', async () => {
    const tool = await MultiEditTool.init()
    
    const result = await tool.execute({
      filePath: mockFilePath,
      edits: [
        {
          oldString: 'line1',
          newString: 'modified1'
        },
        {
          oldString: 'line3',
          newString: 'modified3'
        },
        {
          oldString: 'line5',
          newString: 'modified5'
        }
      ]
    }, mockCtx)
    
    expect(result).toBeDefined()
    expect(result.metadata.editCount).toBe(3)
    expect(result.metadata.results).toHaveLength(3)
    
    // Verify all changes were applied
    const finalContent = await Bun.file(mockFilePath).text()
    expect(finalContent).toContain('modified1')
    expect(finalContent).toContain('modified3')
    expect(finalContent).toContain('modified5')
    expect(finalContent).not.toContain('line1')
    expect(finalContent).not.toContain('line3')
    expect(finalContent).not.toContain('line5')
  })

  it('should skip no-op edits', async () => {
    const tool = await MultiEditTool.init()
    
    const result = await tool.execute({
      filePath: mockFilePath,
      edits: [
        {
          oldString: 'line1',
          newString: 'line1' // Same as oldString
        },
        {
          oldString: 'line2',
          newString: 'modified2'
        }
      ]
    }, mockCtx)
    
    expect(result).toBeDefined()
    expect(result.metadata.editCount).toBe(2) // Still counts total edits provided
    
    // Verify only the real change was applied
    const finalContent = await Bun.file(mockFilePath).text()
    expect(finalContent).toContain('line1') // Should remain unchanged
    expect(finalContent).toContain('modified2') // Should be changed
  })

  it('should handle edit failures gracefully', async () => {
    const tool = await MultiEditTool.init()
    
    await expect(tool.execute({
      filePath: mockFilePath,
      edits: [
        {
          oldString: 'nonexistent',
          newString: 'replacement'
        }
      ]
    }, mockCtx)).rejects.toThrow('Failed to apply edit')
  })

  it('should validate all required imports are available', () => {
    // Verify all imports are working
    expect(FileTime).toBeDefined()
    expect(Bus).toBeDefined()
    expect(File).toBeDefined()
    expect(FileWatcher).toBeDefined()
    expect(Instance).toBeDefined()
  })
})
