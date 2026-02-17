import { levenshtein, getLevenshteinStats, resetLevenshteinStats } from "./levenshtein"

// Debug test for sliding window algorithm
resetLevenshteinStats()

console.log("=== DEBUGGING SLIDING WINDOW ALGORITHM ===")

// Test case 1: Large strings with one character difference
const a = "a".repeat(2000)
const b = "a".repeat(1999) + "b"

console.log(`Test 1: a.length=${a.length}, b.length=${b.length}`)
const distance1 = levenshtein(a, b)
console.log(`Distance: ${distance1}`)
console.log(`Stats:`, getLevenshteinStats())

resetLevenshteinStats()

// Test case 2: Different large strings
const a2 = "a".repeat(1500) + "x".repeat(500)
const b2 = "a".repeat(1499) + "y".repeat(500) + "z"

console.log(`\nTest 2: a2.length=${a2.length}, b2.length=${b2.length}`)
const distance2 = levenshtein(a2, b2)
console.log(`Distance: ${distance2}`)
console.log(`Stats:`, getLevenshteinStats())

// Test case 3: Smaller strings that should use exact algorithm
resetLevenshteinStats()
const a3 = "a".repeat(800)
const b3 = "a".repeat(799) + "b"

console.log(`\nTest 3: a3.length=${a3.length}, b3.length=${b3.length}`)
const distance3 = levenshtein(a3, b3)
console.log(`Distance: ${distance3}`)
console.log(`Stats:`, getLevenshteinStats())
