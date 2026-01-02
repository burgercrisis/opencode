#!/usr/bin/env bun

/**
 * Cross-platform Nix hash update script
 * Replaces nix/scripts/update-hashes.sh for Windows/macOS/Linux compatibility
 */

import { $ } from "bun";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Skip on Windows as Nix doesn't run natively on Windows
if (process.platform === "win32") {
  console.log("Skipping Nix hash update on Windows as Nix is not natively supported.");
  process.exit(0);
}

const DUMMY = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const SYSTEM = process.env.SYSTEM || "x86_64-linux";
const DEFAULT_HASH_FILE = process.env.MODULES_HASH_FILE || "nix/hashes.json";
const HASH_FILE = process.env.HASH_FILE || DEFAULT_HASH_FILE;

// Initialize hash file if it doesn't exist
if (!existsSync(HASH_FILE)) {
    writeFileSync(HASH_FILE, JSON.stringify({
        nodeModules: DUMMY
    }, null, 2));
}

// Check if we're in a git repository and handle git tracking
try {
    const gitCheck = await $`git rev-parse --is-inside-work-tree`.quiet();
    if (gitCheck.exitCode === 0) {
        // Check if file is tracked by git
        const gitLsCheck = await $`git ls-files --error-unmatch ${HASH_FILE}`.quiet();
        if (gitLsCheck.exitCode !== 0) {
            // Add file to git if not tracked
            await $`git add -N ${HASH_FILE}`.quiet();
        }
    }
} catch (error) {
    // Not in git repo, continue
}

// Set environment variables
process.env.DUMMY = DUMMY;
process.env.NIX_KEEP_OUTPUTS = "1";
process.env.NIX_KEEP_DERIVATIONS = "1";

// Create temp directory for cleanup
const tempDir = mkdtempSync(join(tmpdir(), 'nix-hash-'));
const cleanup = () => {
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
        // Ignore cleanup errors
    }
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

// Helper function to update node_modules hash
function writeNodeModulesHash(value: string) {
    const currentContent = JSON.parse(readFileSync(HASH_FILE, 'utf8'));
    currentContent.nodeModules = value;
    writeFileSync(HASH_FILE, JSON.stringify(currentContent, null, 2));
}

const TARGET = `packages.${SYSTEM}.default`;
const MODULES_ATTR = `.#packages.${SYSTEM}.default.node_modules`;
let CORRECT_HASH = "";

console.log(`Setting dummy node_modules outputHash for ${SYSTEM}...`);
writeNodeModulesHash(DUMMY);

const buildLogFile = join(tempDir, 'build.log');
const jsonOutputFile = join(tempDir, 'output.json');

console.log(`Building node_modules for ${SYSTEM} to discover correct outputHash...`);
console.log(`Attempting to realize derivation: ${MODULES_ATTR}`);

try {
    // Run nix evaluation and build
    const drvPathResult = await $`nix eval --raw ${MODULES_ATTR}.drvPath`.quiet();
    const DRV_PATH = drvPathResult.stdout.trim();

    const realiseResult = await $`nix-store --realise ${DRV_PATH} --keep-failed`.quiet()
        .pipe($`tee ${buildLogFile}`)
        .quiet();

    const REALISE_OUT = realiseResult.stdout.trim();

    // Extract build path from output
    const buildPathMatch = REALISE_OUT.match(/^\/nix\/store\/.+/m);
    const BUILD_PATH = buildPathMatch ? buildPathMatch[0] : "";

    if (BUILD_PATH && existsSync(BUILD_PATH)) {
        console.log(`Realized node_modules output: ${BUILD_PATH}`);
        const hashResult = await $`nix hash path --sri ${BUILD_PATH}`.quiet();
        CORRECT_HASH = hashResult.stdout.trim();
    }

    // If hash not found, try to extract from build log
    if (!CORRECT_HASH) {
        const buildLogContent = readFileSync(buildLogFile, 'utf8');

        // Try multiple patterns to find the hash
        const patterns = [
            /got:\s+sha256-[A-Za-z0-9+/=]+/g,
            /hash mismatch.*?got:\s+(sha256-[A-Za-z0-9+/=]+)/s,
            /output hash changed.*?got:\s+(sha256-[A-Za-z0-9+/=]+)/s
        ];

        for (const pattern of patterns) {
            const match = buildLogContent.match(pattern);
            if (match) {
                const hashMatch = match[0].match(/sha256-[A-Za-z0-9+/=]+/);
                if (hashMatch) {
                    CORRECT_HASH = hashMatch[0];
                    break;
                }
            }
        }

        // If still not found, try to find kept build directory
        if (!CORRECT_HASH) {
            const keptDirPatterns = [
                /build directory.*'([^']+)'/,
                /\/nix\/var\/nix\/builds\/[^\\s]+/
            ];

            for (const pattern of keptDirPatterns) {
                const match = buildLogContent.match(pattern);
                if (match) {
                    const KEPT_DIR = match[1];
                    if (existsSync(KEPT_DIR)) {
                        console.log(`Found kept build directory: ${KEPT_DIR}`);
                        const HASH_PATH = join(KEPT_DIR, 'build').existsSync()
                            ? join(KEPT_DIR, 'build')
                            : KEPT_DIR;

                        console.log(`Attempting to hash: ${HASH_PATH}`);

                        if (existsSync(join(HASH_PATH, 'node_modules'))) {
                            const hashResult = await $`nix hash path --sri ${HASH_PATH}`.quiet();
                            CORRECT_HASH = hashResult.stdout.trim();
                            console.log(`Computed hash from kept build: ${CORRECT_HASH}`);
                            break;
                        }
                    }
                }
            }
        }
    }
} catch (error) {
    console.error('Error during nix build process:', error);
}

if (!CORRECT_HASH) {
    console.error(`Failed to determine correct node_modules hash for ${SYSTEM}.`);
    console.error('Build log:');
    console.error(readFileSync(buildLogFile, 'utf8'));
    process.exit(1);
}

writeNodeModulesHash(CORRECT_HASH);

// Verify the hash was written correctly
const hashFileContent = JSON.parse(readFileSync(HASH_FILE, 'utf8'));
if (hashFileContent.nodeModules !== CORRECT_HASH) {
    console.error('Hash verification failed');
    process.exit(1);
}

console.log(`node_modules hash updated for ${SYSTEM}: ${CORRECT_HASH}`);

cleanup();
