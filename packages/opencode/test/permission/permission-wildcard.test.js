const PermissionNext = {
  evaluate: (permission, pattern, ruleset) => {
    console.log(`Evaluating permission="${permission}" pattern="${pattern}"`);
    console.log(`Ruleset: ${JSON.stringify(ruleset, null, 2)}`);
   
    const merged = ruleset.flat();
    const match = merged.findLast(
      (rule) => {
        const permMatch = Wildcard.match(permission, rule.permission);
        const patMatch = Wildcard.match(pattern, rule.pattern);
        console.log(`  Rule: ${JSON.stringify(rule)} -> permMatch: ${permMatch}, patMatch: ${patMatch}`);
        return permMatch && patMatch;
      }
    );
    console.log(`  Final match: ${JSON.stringify(match)}`);
    return match ?? { action: "ask", permission, pattern: "*" };
  }
}

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
    );
    return regex.test(str);
  }
}

// Test the permission evaluation
const ruleset = [
  [
    {"permission":"*","action":"allow","pattern":"*"},
    {"permission":"doom_loop","action":"ask","pattern":"*"},
    {"permission":"external_directory","pattern":"*","action":"ask"},
    {"permission":"external_directory","pattern":"C:\\Users\\user\\.local\\share\\opencode\\tool-output","action":"allow"},
    {"permission":"question","action":"deny","pattern":"*"},
    {"permission":"read","pattern":"*","action":"allow"},
    {"permission":"read","pattern":"*.env","action":"deny"},
    {"permission":"read","pattern":"*.env.*","action":"deny"},
    {"permission":"read","pattern":"*.env.example","action":"allow"},
    {"permission":"question","action":"allow","pattern":"*"},
    {"permission":"edit","pattern":"*","action":"deny"},
    {"permission":"edit","pattern":".opencode/plan/*.md","action":"allow"},
    {"permission":"bash","action":"allow","pattern":"*"},
    {"permission":"edit","action":"allow","pattern":"*"},
    {"permission":"read","action":"allow","pattern":"*"},
    {"permission":"grep","action":"allow","pattern":"*"},
    {"permission":"glob","action":"allow","pattern":"*"},
    {"permission":"list","action":"allow","pattern":"*"},
    {"permission":"skill","action":"allow","pattern":"*"},
    {"permission":"todowrite","action":"allow","pattern":"*"},
    {"permission":"todoread","action":"allow","pattern":"*"},
    {"permission":"webfetch","action":"allow","pattern":"*"},
    {"permission":"lsp","action":"allow","pattern":"*"},
    {"permission":"external_directory","pattern":"C:\\Users\\user\\.local\\share\\opencode\\tool-output","action":"allow"}
  ]
];

console.log("=== Testing .env.local ===");
const result1 = PermissionNext.evaluate("read", ".env.local", ruleset);
console.log(`Result: ${result1.action}\n`);

console.log("=== Testing .env.production ===");
const result2 = PermissionNext.evaluate("read", ".env.production", ruleset);
console.log(`Result: ${result2.action}\n`);

console.log("=== Testing .env.development.local ===");
const result3 = PermissionNext.evaluate("read", ".env.development.local", ruleset);
console.log(`Result: ${result3.action}\n`);

console.log("=== Testing .env.example ===");
const result4 = PermissionNext.evaluate("read", ".env.example", ruleset);
console.log(`Result: ${result4.action}\n`);