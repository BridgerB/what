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

        buildPhase = ''
          # No build needed - we run directly with deno
        '';

        installPhase = ''
          mkdir -p $out/bin $out/share/what

          # Copy source files
          cp -r main.ts src $out/share/what/

          # Create wrapper script that runs deno
          makeWrapper ${pkgs.deno}/bin/deno $out/bin/what \
            --add-flags "run" \
            --add-flags "--allow-read" \
            --add-flags "--allow-run" \
            --add-flags "--no-lock" \
            --add-flags "--quiet" \
            --add-flags "$out/share/what/main.ts" \
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
