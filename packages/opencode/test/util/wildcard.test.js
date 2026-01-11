const Wildcard = { 
  match: (str, pattern) => {
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
      's'
    )
    console.log(`Pattern: ${pattern} -> Regex: ${regex}`)
    console.log(`Testing: "${str}" -> ${regex.test(str)}`)
    return regex.test(str)
  } 
}

console.log('Testing .env patterns:')
console.log('=== .env ===')
Wildcard.match('.env', '*.env')
console.log('=== .env.local ===')
Wildcard.match('.env.local', '*.env.*')
console.log('=== .env.production ===')
Wildcard.match('.env.production', '*.env.*')
console.log('=== .env.development.local ===')
Wildcard.match('.env.development.local', '*.env.*')
console.log('=== .env.example ===')
Wildcard.match('.env.example', '*.env.example')