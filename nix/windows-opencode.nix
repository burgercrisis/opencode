{ lib, stdenv, bun, ripgrep, makeBinaryWrapper, powershell }:
args:
let
  inherit (args) scripts;
  mkModules =
    attrs:
    args.mkNodeModules (
      attrs
      // {
        canonicalizeScript = scripts + "/canonicalize-node-modules.ts";
        normalizeBinsScript = scripts + "/normalize-bun-binaries.ts";
      }
    );
in
stdenv.mkDerivation (finalAttrs: {
  pname = "opencode";
  inherit (args) version src;

  node_modules = mkModules {
    inherit (finalAttrs) version src;
  };

  nativeBuildInputs = [
    bun
    makeBinaryWrapper
    powershell
  ];

  env.MODELS_DEV_API_JSON = args.modelsDev;
  env.OPENCODE_VERSION = args.version;
  env.OPENCODE_CHANNEL = "stable";
  dontConfigure = true;

  buildPhase = ''
    runHook preBuild

    # Use Windows-style path separators and PowerShell commands
    $nodeModulesPath = "$PWD\\$(${finalAttrs.node_modules}/node_modules)"
    $packagesPath = "$PWD\\$(${finalAttrs.node_modules}/packages)"
    
    # Copy node_modules and packages using PowerShell
    Copy-Item -Recurse -Force "$(${finalAttrs.node_modules})\\node_modules" -Destination "."
    Copy-Item -Recurse -Force "$(${finalAttrs.node_modules})\\packages" -Destination "."

    Set-Location "packages\\opencode"

    # Set Windows permissions using icacls equivalent
    Get-ChildItem -Path ".\\node_modules" -Recurse | ForEach-Object {
      $_.Attributes = $_.Attributes -bor [System.IO.FileAttributes]::Archive
    }
    
    New-Item -ItemType Directory -Force -Path ".\\node_modules\\@opencode-ai"

    # Remove existing symlinks and create Windows junctions
    Remove-Item -Recurse -Force ".\\node_modules\\@opencode-ai\\script" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force ".\\node_modules\\@opencode-ai\\sdk" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force ".\\node_modules\\@opencode-ai\\plugin" -ErrorAction SilentlyContinue

    # Create Windows junctions instead of Unix symlinks
    $scriptPath = Resolve-Path -Path "$(Get-Location)\\..\\..\\packages\\script"
    $sdkPath = Resolve-Path -Path "$(Get-Location)\\..\\..\\packages\\sdk\\js"
    $pluginPath = Resolve-Path -Path "$(Get-Location)\\..\\..\\packages\\plugin" -ErrorAction SilentlyContinue

    cmd /c "mklink /J \"$PWD\\node_modules\\@opencode-ai\\script\" \"$scriptPath\""
    cmd /c "mklink /J \"$PWD\\node_modules\\@opencode-ai\\sdk\" \"$sdkPath\""
    if ($pluginPath) {
      cmd /c "mklink /J \"$PWD\\node_modules\\@opencode-ai\\plugin\" \"$pluginPath\""
    }

    # Copy and make bundle.ts executable
    Copy-Item "${./bundle.ts}" -Destination ".\\bundle.ts"
    # Note: In Windows, we'll handle executable permissions differently
    # chmod +x equivalent: Set-ItemProperty -Path ".\bundle.ts" -Name IsReadOnly -Value $false

    # Run bundle with Bun
    bun run .\bundle.ts

    Set-Location "..\\.."
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    Set-Location "packages\\opencode"
    if (-not (Test-Path "dist")) {
      Write-Error "ERROR: dist directory missing after bundle step"
      exit 1
    }

    # Create output directory with Windows paths
    $outLibPath = "$out\\lib\\opencode"
    New-Item -ItemType Directory -Force -Path $outLibPath

    # Copy dist directory
    Copy-Item -Recurse -Force "dist" -Destination $outLibPath

    # Set Windows permissions
    Get-ChildItem -Path "$outLibPath\\dist" -Recurse | ForEach-Object {
      $_.Attributes = $_.Attributes -bor [System.IO.FileAttributes]::Archive
    }

    # Find worker files using PowerShell (equivalent to find command)
    $workerFiles = Get-ChildItem -Path "$outLibPath\\dist" -Recurse -Include "*worker*" | Sort-Object Name
    $workerFile = $workerFiles | Where-Object { $_.Name -like "*tui*worker*" -or $_.Name -eq "worker.*" } | Select-Object -First 1
    $parserWorkerFile = $workerFiles | Where-Object { $_.Name -like "*parser*worker*" } | Select-Object -First 1

    if (-not $workerFile) {
      Write-Error "ERROR: bundled worker not found"
      exit 1
    }

    # Find WASM files
    $wasmFiles = Get-ChildItem -Path "$outLibPath\\dist" -MaxDepth 1 -Include "tree-sitter-*.wasm" | Sort-Object Name
    $mainWasm = $wasmFiles | Select-Object -First 1

    if ($mainWasm -and $workerFile) {
      $wasmList = $wasmFiles | ForEach-Object { $_.FullName } -Join " "
      
      # Run patch-wasm script with Windows paths
      $patchScript = "${scripts}\\patch-wasm.ts"
      & $env:BUN_ROOT\\bin\\bun $patchScript $workerFile.FullName $mainWasm.FullName $wasmList
    }

    # Copy .bun directory
    New-Item -ItemType Directory -Force -Path "$out\\lib\\opencode\\node_modules"
    Copy-Item -Recurse -Force "..\\..\\node_modules\\.bun" -Destination "$out\\lib\\opencode\\node_modules\\"

    # Create @opentui directory and handle symlinks
    New-Item -ItemType Directory -Force -Path "$out\\lib\\opencode\\node_modules\\@opentui"

    # Handle @opentui symlinks (PowerShell equivalent of ln -sf)
    Get-ChildItem -Path "$out\\lib\\opencode\\node_modules\\.bun" -Directory | Where-Object {
      $_.Name -match "@opentui\+core|@opentui\+solid"
    } | ForEach-Object {
      $pkgName = $_.Name -replace "@opentui\+([^@]*)@.*", '$1'
      $linkPath = "$out\\lib\\opencode\\node_modules\\@opentui\\$pkgName"
      $targetPath = "..\\.bun\\" + $_.Name + "\\node_modules\\@opentui\\$pkgName"
      
      if (Test-Path $linkPath) {
        Remove-Item -Recurse -Force $linkPath
      }
      cmd /c "mklink /J `"$linkPath`" `"$targetPath`""
    }

    # Create binary wrapper
    New-Item -ItemType Directory -Force -Path "$out\\bin"
    makeWrapper "${bun}/bin/bun" "$out/bin/opencode" `
      --add-flags "run" `
      --add-flags "$out/lib/opencode/dist/src/index.js" `
      --prefix PATH : ${lib.makeBinPath [ ripgrep ]} `
      --argv0 opencode

    runHook postInstall
  '';

  dontFixup = true;

  meta = {
    description = "AI coding agent built for the terminal (Windows)";
    longDescription = ''
      OpenCode is a terminal-based agent that can build anything.
      It combines a TypeScript/JavaScript core with a Go-based TUI
      to provide an interactive AI coding experience.
      This is the Windows-specific build.
    '';
    homepage = "https://github.com/sst/opencode";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-windows"
      "aarch64-windows"
    ];
    mainProgram = "opencode";
  };
})