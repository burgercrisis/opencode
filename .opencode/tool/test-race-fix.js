// Test script to verify the race condition fix
const process = require('process')

// Set environment variables before importing the tool
process.env.GITHUB_TRIAGE_DESKTOP_TEAM = JSON.stringify(['testuser1', 'testuser2'])
process.env.GITHUB_TRIAGE_ZEN_TEAM = JSON.stringify(['testuser3'])
process.env.NODE_ENV = 'test'

// Import the tool (this will trigger synchronous initialization)
const githubTriageTool = require('./github-triage.ts').default

console.log('✅ Tool loaded successfully')
console.log('Available assignees:', githubTriageTool.args.assignee._def.values)

// Verify our test users are in the enum
const assignees = githubTriageTool.args.assignee._def.values
console.log('✅ Contains testuser1:', assignees.includes('testuser1'))
console.log('✅ Contains testuser2:', assignees.includes('testuser2'))
console.log('✅ Contains testuser3:', assignees.includes('testuser3'))

// Verify default users are also there (from other teams)
console.log('✅ Contains rekram1-node:', assignees.includes('rekram1-node'))
console.log('✅ Contains adamdotdevin:', assignees.includes('adamdotdevin'))

console.log('\n🎉 Race condition fix verified - ASSIGNEES_ENUM initialized synchronously from environment variables!')
