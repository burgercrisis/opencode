#!/usr/bin/env bun

/**
 * Cross-platform OpenCode Installer
 * Replaces the bash install script for Windows/macOS/Linux compatibility
 * Usage: bun run install or bun scripts/install.ts
 */

import { $ } from "bun";
import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir, tmpdir, platform, arch } from "os";

const APP = "opencode";

// Colors for console output (cross-platform)
const colors = {
  muted: '\x1b[0;2m',
  red: '\x1b[0;31m',
  orange: '\x1b[38;5;214m',
  nc: '\x1b[0m', // No Color
};

function printMessage(level: 'info' | 'warning' | 'error', message: string) {
  const colorMap = {
    info: colors.nc,
    warning: colors.nc,
    error: colors.red,
  };
  console.log(`${colorMap[level]}${message}${colors.nc}`);
}

// Cross-platform platform detection
function detectPlatform(): { os: string; arch: string } {
  const rawOs = platform();
  let detectedOs = rawOs.toLowerCase();

  switch (rawOs) {
    case 'darwin':
      detectedOs = 'darwin';
      break;
    case 'linux':
      detectedOs = 'linux';
      break;
    case 'win32':
      detectedOs = 'windows';
      break;
    default:
      detectedOs = rawOs.toLowerCase();
      break;
  }

  let detectedArch = arch();
  if (detectedArch === 'aarch64') detectedArch = 'arm64';
  if (detectedArch === 'x64') detectedArch = 'x64';

  return { os: detectedOs, arch: detectedArch };
}

// Cross-platform directory creation
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// Cross-platform file permissions
function setExecutable(filePath: string): void {
  try {
    chmodSync(filePath, 0o755);
  } catch (error) {
    // Windows might not support chmod, ignore
  }
}

// Get installation directory (cross-platform)
function getInstallDir(): string {
  return join(homedir(), '.opencode', 'bin');
}

// Check if opencode is already installed
async function checkInstalledVersion(): Promise<string | null> {
  try {
    const result = await $`opencode --version`.quiet();
    if (result.exitCode === 0) {
      const output = result.stdout.toString().trim();
      const version = output.split(' ')[1] || output;
      return version;
    }
  } catch (error) {
    // Not installed or error
  }
  return null;
}

// Get latest version from GitHub
async function getLatestVersion(): Promise<string> {
  const repo = process.env.OPENCODE_REPO || 'sst/opencode';
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
  if (!response.ok) {
    throw new Error('Failed to fetch latest version');
  }

  const data = await response.json();
  const tag = data.tag_name;
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

// Verify version exists
async function verifyVersion(version: string): Promise<boolean> {
  const repo = process.env.OPENCODE_REPO || 'sst/opencode';
  const response = await fetch(`https://github.com/${repo}/releases/tag/v${version}`, { method: 'HEAD' });
  return response.ok;
}

// Windows-safe command execution
async function execCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await $`${command}`.quiet();
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode || 0
    };
  } catch (error: any) {
    return {
      stdout: '',
      stderr: (error as Error).toString(),
      exitCode: 1
    };
  }
}

// Main installation function
async function installOpenCode(requestedVersion?: string): Promise<void> {
  const { os: detectedOs, arch: detectedArch } = detectPlatform();

  // Validate platform
  const supportedCombos = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'windows-x64'];
  const combo = `${detectedOs}-${detectedArch}`;

  if (!supportedCombos.includes(combo)) {
    printMessage('error', `Unsupported OS/Arch: ${detectedOs}/${detectedArch}`);
    process.exit(1);
  }

  // Determine target
  let target = `${detectedOs}-${detectedArch}`;
  const archiveExt = detectedOs === 'linux' ? '.tar.gz' : '.zip';

  // Check for musl (Linux only)
  // Windows compatibility: Alpine check skipped on Windows as Alpine Linux is not relevant
  if (detectedOs === 'linux') {
    try {
      const alpineCheck = await execCommand('test -f /etc/alpine-release');
      if (alpineCheck.exitCode === 0) {
        target += '-musl';
      } else {
        const lddCheck = await execCommand('ldd --version');
        if (lddCheck.stdout.toLowerCase().includes('musl')) {
          target += '-musl';
        }
      }
    } catch (error) {
      // ldd not available, continue
    }
  }

  // Check for baseline (x64 only)
  // Windows compatibility: AVX2 detection skipped on Windows as it's not critical and Node.js APIs don't provide reliable CPU feature detection
  if (detectedArch === 'x64') {
    if (detectedOs === 'linux') {
      try {
        const avx2Check = await execCommand('grep -qi avx2 /proc/cpuinfo');
        if (avx2Check.exitCode !== 0) {
          target += '-baseline';
        }
      } catch (error) {
        target += '-baseline';
      }
    } else if (detectedOs === 'darwin') {
      try {
        const avx2Check = await execCommand('sysctl -n hw.optional.avx2_0');
        const stdout = avx2Check.stdout.trim();
        if (stdout !== '1') {
          target += '-baseline';
        }
      } catch (error) {
        target += '-baseline';
      }
    }
    // Windows: No AVX2 check, assume modern Windows x64 supports AVX2
  }

  const filename = `${APP}-${target}${archiveExt}`;

  // Determine version
  let version: string;
  if (requestedVersion) {
    version = requestedVersion.startsWith('v') ? requestedVersion.slice(1) : requestedVersion;

    const isValid = await verifyVersion(version);
    if (!isValid) {
      printMessage('error', `Error: Release v${version} not found`);
      printMessage('info', 'Available releases: https://github.com/sst/opencode/releases');
      process.exit(1);
    }
  } else {
    version = await getLatestVersion();
  }

  // Check if already installed
  const installedVersion = await checkInstalledVersion();
  if (installedVersion === version) {
    printMessage('info', `Version ${version} already installed`);
    return;
  } else if (installedVersion) {
    printMessage('info', `Installed version: ${installedVersion}`);
  }

  // Download and install
  printMessage('info', `\nInstalling opencode version: ${version}`);

  const installDir = getInstallDir();
  ensureDir(installDir);

  const tmpDir = join(tmpdir(), `opencode_install_${Date.now()}`);
  ensureDir(tmpDir);

  try {
    const repo = process.env.OPENCODE_REPO || 'sst/opencode';
    const url = requestedVersion
      ? `https://github.com/${repo}/releases/download/v${version}/${filename}`
      : `https://github.com/${repo}/releases/latest/download/${filename}`;

    printMessage('info', `Downloading: ${filename}`);

    // Download file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const archivePath = join(tmpDir, filename);
    const buffer = await response.arrayBuffer();
    await Bun.write(archivePath, buffer);

    printMessage('info', 'Extracting...');

    // Extract archive with Windows-compatible methods
    if (detectedOs === 'linux') {
      await execCommand(`tar -xzf ${archivePath} -C ${tmpDir}`);
    } else if (detectedOs === 'windows') {
      // Windows extraction with multiple fallbacks
      let extracted = false;

      // Method 1: PowerShell Expand-Archive (most reliable)
      try {
        await execCommand(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpDir}' -Force"`);
        extracted = true;
        printMessage('info', '✅ Extracted with PowerShell');
      } catch (error: any) {
        printMessage('warning', `PowerShell failed: ${(error as Error).message}`);
      }

      if (!extracted) {
        try {
          // Method 2: Windows built-in tar (Windows 10+)
          await execCommand(`tar -xf "${archivePath}" -C "${tmpDir}"`);
          extracted = true;
          printMessage('info', '✅ Extracted with Windows tar');
        } catch (error: any) {
          printMessage('warning', `Windows tar failed: ${(error as Error).message}`);
        }
      }

      if (!extracted) {
        try {
          // Method 3: Git Bash unzip
          await execCommand(`"C:\\Program Files\\Git\\bin\\unzip.exe" -q "${archivePath}" -d "${tmpDir}"`);
          extracted = true;
          printMessage('info', '✅ Extracted with Git Bash unzip');
        } catch (error: any) {
          printMessage('warning', `Git Bash unzip failed: ${(error as Error).message}`);
        }
      }

      if (!extracted) {
        try {
          // Method 4: 7-Zip if available
          await execCommand(`"C:\\Program Files\\7-Zip\\7z.exe" x "${archivePath}" -o"${tmpDir}" -y`);
          extracted = true;
          printMessage('info', '✅ Extracted with 7-Zip');
        } catch (error: any) {
          printMessage('warning', `7-Zip failed: ${(error as Error).message}`);
        }
      }

      if (!extracted) {
        try {
          // Method 5: System unzip if available
          await execCommand(`unzip -q "${archivePath}" -d "${tmpDir}"`);
          extracted = true;
          printMessage('info', '✅ Extracted with system unzip');
        } catch (error: any) {
          printMessage('warning', `System unzip failed: ${(error as Error).message}`);
          throw new Error('All extraction methods failed');
        }
      }
    } else {
      await execCommand(`unzip -q ${archivePath} -d ${tmpDir}`);
    }

    // Move binary to install directory
    const binaryPath = join(tmpDir, 'opencode');
    const installPath = join(installDir, 'opencode');

    // Use cross-platform move command
    if (detectedOs === 'windows') {
      await execCommand(`powershell -Command "Move-Item -Path '${binaryPath}' -Destination '${installPath}' -Force"`);
    } else {
      await execCommand(`mv ${binaryPath} ${installPath}`);
    }

    setExecutable(installPath);

    printMessage('info', `Installed to: ${installPath}`);

    // Print success message
    console.log('');
    console.log(`${colors.muted}                   ${colors.nc}             ▄     `);
    console.log(`${colors.muted}█▀▀█ █▀▀█ █▀▀█ █▀▀▄ ${colors.nc}█▀▀▀ █▀▀█ █▀▀█ █▀▀█`);
    console.log(`${colors.muted}█░░█ █░░█ █▀▀▀ █░░█ ${colors.nc}█░░░ █░░█ █░░█ █▀▀▀`);
    console.log(`${colors.muted}▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀ ${colors.nc}▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀`);
    console.log('');
    console.log('');
    console.log(`${colors.muted}OpenCode includes free models, to start:${colors.nc}`);
    console.log('');
    console.log('cd <project>  # Open directory');
    console.log('opencode      # Run command');
    console.log('');
    console.log(`${colors.muted}For more information visit ${colors.nc}https://opencode.ai/docs`);
    console.log('');

  } finally {
    // Cleanup with cross-platform commands
    if (detectedOs === 'windows') {
      await execCommand(`powershell -Command "Remove-Item -Path '${tmpDir}' -Recurse -Force"`);
    } else {
      await execCommand(`rm -rf ${tmpDir}`);
    }
  }
}

// CLI argument parsing
async function main() {
  const args = process.argv.slice(2);
  let requestedVersion: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h':
      case '--help':
        console.log(`OpenCode Installer

Usage: bun run install [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 1.0.180)

Examples:
    bun run install
    bun run install --version 1.0.180`);
        return;
      case '-v':
      case '--version':
        requestedVersion = args[++i];
        if (!requestedVersion) {
          printMessage('error', 'Error: --version requires a version argument');
          process.exit(1);
        }
        break;
      default:
        printMessage('warning', `Warning: Unknown option '${arg}'`);
        break;
    }
  }

  try {
    await installOpenCode(requestedVersion);
  } catch (error: any) {
    printMessage('error', `Installation failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}
