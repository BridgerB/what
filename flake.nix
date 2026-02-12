{
  description = "A custom what binary for scanning and copying file contents";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      # Fetch Deno dependencies in a separate derivation
      denoDeps = pkgs.stdenvNoCC.mkDerivation {
        name = "what-deno-deps";
        src = self;
        nativeBuildInputs = [pkgs.deno];

        buildPhase = ''
          export DENO_DIR=$out
          deno cache main.ts
        '';

        installPhase = ''
          echo "Dependencies cached in $DENO_DIR"
        '';

        outputHashMode = "recursive";
        outputHashAlgo = "sha256";
        outputHash = "sha256-IIPMV6L3wAaX9+L12IgwEbM/QWoFwySZqdDJa7fjRy8=";
      };

      # Fetch the denort runtime binary needed for deno compile
      denort = pkgs.stdenvNoCC.mkDerivation {
        name = "denort-${pkgs.deno.version}";
        src = pkgs.fetchurl {
          url = "https://dl.deno.land/release/v${pkgs.deno.version}/denort-x86_64-unknown-linux-gnu.zip";
          hash = "sha256-qCuGkPfCb23wgFoRReAhCPQ3o6GtagWnIyuuAdqw7Ns=";
        };

        nativeBuildInputs = [pkgs.unzip];

        unpackPhase = ''
          unzip $src
        '';

        installPhase = ''
          mkdir -p $out/bin
          cp denort $out/bin/denort
          chmod +x $out/bin/denort
        '';
      };
    in {
      packages.default = pkgs.stdenv.mkDerivation {
        pname = "what";
        version = "0.1.0";
        src = self;

        nativeBuildInputs = with pkgs; [
          deno
          makeWrapper
        ];

        buildInputs = with pkgs; [
          tree
          xsel
          xclip
        ];

        # Prevent Nix from corrupting the deno-compiled binary
        dontAutoPatchELF = true;
        dontStrip = true;

        buildPhase = ''
          # Use pre-fetched dependencies
          export DENO_DIR="${denoDeps}"

          # Point deno compile to the pre-fetched denort binary
          export DENORT_BIN="${denort}/bin/denort"

          # Compile to standalone binary with cached dependencies
          deno compile --allow-read --allow-run --cached-only --lock=./deno.lock --quiet -o what ./main.ts
        '';

        installPhase = ''
          mkdir -p $out/bin
          mv what $out/bin/what
        '';

        # Add external tools to PATH for the compiled binary
        postInstall = ''
          wrapProgram $out/bin/what \
            --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.tree pkgs.xsel pkgs.xclip]}
        '';

        meta = with pkgs.lib; {
          description = "A custom what binary for scanning and copying file contents to the clipboard";
          homepage = "https://github.com/BridgerB/what";
          license = licenses.mit;
          maintainers = [];
          mainProgram = "what";
        };
      };

      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          deno
          tree
        ];
        shellHook = ''
          echo "Welcome to the what development shell!"
          echo "Deno version: $(deno --version | head -n 1)"
        '';
      };

      # Add apps output for user-friendly running
      apps.default = {
        type = "app";
        program = "${self.packages.${system}.default}/bin/what";
      };
    });
}
