import { extname, relative, resolve, SEPARATOR } from "jsr:@std/path@^1.0.0";
import { walk } from "jsr:@std/fs@^1.0.0/walk";
import { copyToClipboard } from "./src/clipboard.ts";
import { isBinaryFile } from "./src/fileutils.ts";

interface TreeSummary {
  dirs: number;
  files: number;
}

interface ProcessResult {
  output: string;
  processedFiles: number;
  processedLines: number;
}

function formatWithCommas(n: number): string {
  return n.toLocaleString("en-US");
}

function trimTrailingEmptyLines(content: string): string {
  const lines = content.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function parseTreeSummary(treeOutput: string): TreeSummary {
  const lines = treeOutput.trim().split("\n");
  if (lines.length < 2) {
    return { dirs: 0, files: 0 };
  }

  let summaryLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== "") {
      summaryLine = lines[i];
      break;
    }
  }

  if (summaryLine === "") {
    return { dirs: 0, files: 0 };
  }

  const parts = summaryLine.split(/\s+/);
  if (parts.length < 4) {
    return { dirs: 0, files: 0 };
  }

  const dirs = parseInt(parts[0]) || 0;
  const files = parseInt(parts[2]) || 0;

  return { dirs, files };
}

function matchesPattern(path: string, pattern: string): boolean {
  // Handle exact matches
  if (path === pattern) {
    return true;
  }

  // Handle directory patterns (must be complete path components)
  const pathParts = path.split(SEPARATOR);
  for (const part of pathParts) {
    if (part === pattern) {
      return true;
    }
  }

  // Handle file extension patterns
  if (pattern.startsWith(".")) {
    return path.endsWith(pattern);
  }

  return false;
}

function isCodeExtension(extension: string): boolean {
  const codeExtensions = new Set([
    "js",
    "css",
    "svelte",
    "json",
    "html",
    "py",
    "ts",
    "tsx",
    "nix",
    "rb",
    "php",
    "c",
    "cpp",
    "h",
    "java",
    "go",
    "rs",
    "kt",
    "sh",
    "yaml",
    "yml",
    "xml",
    "toml",
    "ini",
    "sql",
    "dart",
    "swift",
    "r",
    "pl",
    "lua",
    "scala",
  ]);
  return codeExtensions.has(extension);
}

async function readGitignorePatterns(gitignorePath: string): Promise<string[]> {
  try {
    const content = await Deno.readTextFile(gitignorePath);
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.error(
        "Warning: .gitignore file not found, proceeding without it.",
      );
      return [];
    }
    throw error;
  }
}

async function processFiles(
  path: string,
  excludedFiles: string[],
): Promise<ProcessResult> {
  const lines: string[] = [];
  let processedFiles = 0;
  let processedLines = 0;

  for await (const entry of walk(path, { includeDirs: false })) {
    // Get relative path from the root for pattern matching
    const relPath = relative(path, entry.path);

    // Check exclusion patterns against relative path and filename
    let excluded = false;
    for (const pattern of excludedFiles) {
      if (
        matchesPattern(relPath, pattern) || matchesPattern(entry.name, pattern)
      ) {
        excluded = true;
        break;
      }
    }
    if (excluded) {
      continue;
    }

    if (entry.name.includes(".env")) {
      continue;
    }

    if (!entry.isFile) {
      continue;
    }

    const fullPath = resolve(entry.path);
    let extension = extname(entry.path).toLowerCase();
    if (extension !== "") {
      extension = extension.substring(1); // Remove leading dot
    }

    const isBinary = await isBinaryFile(entry.path);
    if (isBinary) {
      continue;
    }

    processedFiles++;
    lines.push(`\n## ${fullPath}\n\n`);

    const content = await Deno.readTextFile(entry.path);
    const trimmedContent = trimTrailingEmptyLines(content);
    const contentLines = content.split("\n").length;
    processedLines += contentLines;

    if (extension === "md") {
      const escapedContent = trimmedContent.replaceAll("```", "\\```");
      lines.push(`\`\`\`md\n${escapedContent}\n\`\`\`\n`);
    } else if (isCodeExtension(extension)) {
      lines.push(`\`\`\`${extension}\n${trimmedContent}\n\`\`\`\n`);
    } else {
      lines.push(`\`\`\`\n${trimmedContent}\n\`\`\`\n`);
    }
  }

  return {
    output: lines.join(""),
    processedFiles,
    processedLines,
  };
}

async function run(): Promise<void> {
  const excludedFiles = await readGitignorePatterns(".gitignore");

  excludedFiles.push(
    "target/release",
    ".git",
    ".claude",
    ".gitignore",
    "Cargo.lock",
    "package-lock.json",
    "hardware-configuration.nix",
    "README.md",
    "CLAUDE.md",
    "flake.lock",
    "rustc_info.json",
    ".zip",
    "node_modules",
    "build",
  );

  const treePatterns = excludedFiles.map((pattern) =>
    pattern.replaceAll("/", "\\/")
  );

  const currentDir = Deno.cwd();
  const excludedPatterns = treePatterns.join("|");

  const cmd = new Deno.Command("tree", {
    args: ["-I", excludedPatterns, currentDir],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await cmd.output();

  let treeOutput = new TextDecoder().decode(stdout);
  if (code !== 0) {
    if (treeOutput.length === 0) {
      treeOutput = `${currentDir}\n0 directories, 0 files`;
    } else {
      const errorOutput = new TextDecoder().decode(stderr);
      throw new Error(
        `failed to run tree command: ${code}\nOutput: ${errorOutput}`,
      );
    }
  }

  const treeLines = treeOutput.split("\n");
  const { dirs: treeDirs, files: treeFiles } = parseTreeSummary(treeOutput);

  const { output: filesOutput, processedFiles, processedLines } =
    await processFiles(currentDir, excludedFiles);

  const output = "## File Structure\n\n```\n" + treeOutput + "```\n" +
    filesOutput;

  const outputSizeKB = output.length / 1024.0;
  const outputChars = output.length;

  await copyToClipboard(output);

  console.log(
    `Scanned: ${formatWithCommas(treeDirs)} dir, ${
      formatWithCommas(
        treeFiles,
      )
    } files`,
  );

  if (outputChars > 390000) {
    console.log(
      `Copied: ${formatWithCommas(processedFiles)} files, ${
        formatWithCommas(
          treeLines.length + processedLines,
        )
      } lines, ${outputSizeKB.toFixed(2)} kb, \x1b[31m${
        formatWithCommas(
          outputChars,
        )
      } chars (Character Limit Exceeded: ${
        formatWithCommas(
          outputChars,
        )
      }/390,000)\x1b[0m`,
    );
  } else {
    console.log(
      `Copied: ${formatWithCommas(processedFiles)} files, ${
        formatWithCommas(
          treeLines.length + processedLines,
        )
      } lines, ${outputSizeKB.toFixed(2)} kb, ${
        formatWithCommas(
          outputChars,
        )
      } chars`,
    );
  }
}

if (import.meta.main) {
  try {
    await run();
  } catch (err) {
    console.error(`Error: ${err}`);
    Deno.exit(1);
  }
}
