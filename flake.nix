{
  description = "OpenCode development flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    {
      nixpkgs,
      ...
    }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-windows"
        "x86_64-windows"
      ];
      inherit (nixpkgs) lib;
      forEachSystem = lib.genAttrs systems;
      pkgsFor = system: nixpkgs.legacyPackages.${system};
      packageJson = builtins.fromJSON (builtins.readFile ./packages/opencode/package.json);
      bunTarget = {
        "aarch64-linux" = "bun-linux-arm64";
        "x86_64-linux" = "bun-linux-x64";
        "aarch64-darwin" = "bun-darwin-arm64";
        "x86_64-darwin" = "bun-darwin-x64";
        "aarch64-windows" = "bun-windows-arm64";
        "x86_64-windows" = "bun-windows-x64";
      };
      defaultNodeModules = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      hashesFile = "${./nix}/hashes.json";
      hashesData =
        if builtins.pathExists hashesFile then builtins.fromJSON (builtins.readFile hashesFile) else { };
      nodeModulesHash = hashesData.nodeModules or defaultNodeModules;
      modelsDev = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        pkgs."models-dev"
      );
    in
    {
      devShells = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs_20
              pkg-config
              openssl
              git
            ] ++ lib.optionals stdenv.isWindows [
              # Windows-specific packages
              msys2
              windows.powershell
            ] ++ lib.optionals stdenv.isLinux [
              # Linux-specific packages
              glibc
              systemd
            ] ++ lib.optionals stdenv.isDarwin [
              # macOS-specific packages
              darwin.apple_sdk.frameworks.Security
              darwin.apple_sdk.frameworks.CoreFoundation
            ];
          };
        }
      );

      packages = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
          mkNodeModules = pkgs.callPackage ./nix/node-modules.nix {
            hash = nodeModulesHash;
          };
          mkPackage = pkgs.callPackage ./nix/opencode.nix { };
        in
        {
          default = mkPackage {
            inherit (packageJson) version;
            src = ./.;
            scripts = ./nix/scripts;
            target = bunTarget.${system};
            modelsDev = "${modelsDev.${system}}/dist/_api.json";
            inherit mkNodeModules;
          };
        }
      );

      apps = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          opencode-dev = {
            type = "app";
            meta = {
              description = "Nix devshell shell for OpenCode";
              runtimeInputs = [ pkgs.bun ];
            };
            program = "${
              pkgs.writeShellApplication {
                name = "opencode-dev";
                text = ''
                  exec bun run dev "$@"
                '';
              }
            }/bin/opencode-dev";
          };
        }
      );
    };
}
