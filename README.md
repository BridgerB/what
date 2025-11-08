# what

A CLI tool that scans your project directory and copies its structure and file
contents to the clipboard.

## Build

```bash
nix run github:BridgerB/what
```

## Usage

Run `what` in any project directory. It will:

- Generate a tree structure
- Copy all non-binary source files
- Output scan summary

The tool respects `.gitignore` and excludes common build artifacts, lock files,
and configuration files.

## Requirements (via Nix)

- Deno
- tree
- xsel or xclip

## Why

Fast way to give AI context
