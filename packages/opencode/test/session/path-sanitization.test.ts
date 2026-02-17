import { describe, it, expect } from 'bun:test'
import { sanitizePath } from '@/session/prompt'

describe('Path Sanitization', () => {
  it('should sanitize Windows paths with drive letters', () => {
    const input = 'Error reading file C:\\Users\\test\\config.json: Permission denied'
    const result = sanitizePath(input)
    expect(result).toBe('Error reading file [path]: Permission denied')
    expect(result).not.toContain('C:')
    expect(result).not.toContain('Users')
    expect(result).not.toContain('config.json')
  })

  it('should sanitize Unix absolute paths', () => {
    const input = 'Failed to access /home/user/.ssh/id_rsa: No such file'
    const result = sanitizePath(input)
    expect(result).toBe('Failed to access [path]: No such file')
    expect(result).not.toContain('/home')
    expect(result).not.toContain('.ssh')
    expect(result).not.toContain('id_rsa')
  })

  it('should sanitize UNC paths', () => {
    const input = 'Cannot read \\\\server\\share\\file.txt: Access denied'
    const result = sanitizePath(input)
    expect(result).toBe('Cannot read [path]: Access denied')
    expect(result).not.toContain('\\\\server')
    expect(result).not.toContain('share')
    expect(result).not.toContain('file.txt')
  })

  it('should sanitize relative paths with traversal', () => {
    const input = 'Error reading ../../../../../etc/passwd: Permission denied'
    const result = sanitizePath(input)
    expect(result).toBe('Error reading [path]: Permission denied')
    expect(result).not.toContain('../')
    expect(result).not.toContain('etc')
    expect(result).not.toContain('passwd')
  })

  it('should sanitize quoted paths', () => {
    const input = 'Failed to open "C:\\Program Files\\app\\config.ini": File not found'
    const result = sanitizePath(input)
    expect(result).toBe('Failed to open [path]: File not found')
    expect(result).not.toContain('Program Files')
    expect(result).not.toContain('config.ini')
  })

  it('should sanitize URL-encoded paths', () => {
    const input = 'Error accessing %5C%5Cserver%5Cshare%5Cfile.txt: Access denied'
    const result = sanitizePath(input)
    expect(result).toBe('Error accessing [path]: Access denied')
    expect(result).not.toContain('%5C')
    expect(result).not.toContain('server')
    expect(result).not.toContain('file.txt')
  })

  it('should sanitize double-encoded paths', () => {
    const input = 'Failed to read %255C%255Cserver%255Cshare%255Cfile.txt: Permission denied'
    const result = sanitizePath(input)
    expect(result).toBe('Failed to read [path]: Permission denied')
    expect(result).not.toContain('%255C')
    expect(result).not.toContain('server')
  })

  it('should sanitize sensitive file extensions', () => {
    const input = 'Error reading /path/to/secret.key: File not found'
    const result = sanitizePath(input)
    expect(result).toBe('Error reading [file]: File not found')
    expect(result).not.toContain('secret.key')
  })

  it('should sanitize certificate files', () => {
    const input = 'Failed to load C:\\certs\\server.crt: Invalid certificate'
    const result = sanitizePath(input)
    expect(result).toBe('Failed to load [file]: Invalid certificate')
    expect(result).not.toContain('server.crt')
  })

  it('should sanitize environment files', () => {
    const input = 'Error reading .env: Permission denied'
    const result = sanitizePath(input)
    expect(result).toBe('Error reading [file]: Permission denied')
    expect(result).not.toContain('.env')
  })

  it('should handle Unicode paths', () => {
    const input = 'Error reading /用户/配置/设置.json: File not found'
    const result = sanitizePath(input)
    expect(result).toBe('Error reading [path]: File not found')
    expect(result).not.toContain('用户')
    expect(result).not.toContain('配置')
    expect(result).not.toContain('设置.json')
  })

  it('should clean up multiple consecutive path replacements', () => {
    const input = 'Error in [path][path][path]: Multiple issues'
    const result = sanitizePath(input)
    expect(result).toBe('Error in [path]: Multiple issues')
  })

  it('should handle mixed file and path replacements', () => {
    const input = 'Error in [path] and [file]: Mixed issues'
    const result = sanitizePath(input)
    expect(result).toBe('Error in [path] and [file]: Mixed issues')
  })

  it('should not sanitize non-path content', () => {
    const input = 'This is just a regular error message without any paths'
    const result = sanitizePath(input)
    expect(result).toBe(input)
  })

  it('should handle empty strings', () => {
    const input = ''
    const result = sanitizePath(input)
    expect(result).toBe('')
  })

  it('should handle complex obfuscated paths', () => {
    const input = 'Error reading /very/long/path/with/many/segments/config.backup: File not found'
    const result = sanitizePath(input)
    expect(result).toBe('Error reading [path]: File not found')
    expect(result).not.toContain('very')
    expect(result).not.toContain('long')
    expect(result).not.toContain('config.backup')
  })
})
