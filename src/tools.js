import chalk from "chalk";
import { exec } from "child_process";
import fs from "fs/promises";
import { glob } from "glob";
import fetch from "node-fetch";
import path from "path";

const BASH_TIMEOUT_MS = 30000;

function resolvePath(relativePath, projPath) {
  const intendedPath = path.resolve(projPath, relativePath);
  if (!intendedPath.startsWith(projPath)) {
    throw new Error(
      `Path traversal detected: ${relativePath} (resolves to ${intendedPath}, outside of ${projPath})`
    );
  }
  const normalizedRelative = path.normalize(relativePath);
  if (
    normalizedRelative.startsWith("..") ||
    path.isAbsolute(normalizedRelative)
  ) {
    // Allow absolute path if it's ALREADY within projectPath (e.g. internal tool logic)
    // but user-provided paths to tools should be relative.
    // This check is more for the initial user-provided relativePath.
    // For `tree`'s internal recursion, it might build absolute paths.
    // Let's refine this: initial tool call paths must be relative.
    // if (path.isAbsolute(normalizedRelative) && !normalizedRelative.startsWith(projPath)) {
    // throw new Error(`Absolute path provided is outside project: ${relativePath}`);
    // }
    // The existing check `!intendedPath.startsWith(projPath)` covers the security aspect well.
    // The `normalizedRelative.startsWith("..") || path.isAbsolute(normalizedRelative)`
    // is more about enforcing a convention for tool inputs.
  }
  return intendedPath;
}

async function buildTreeRecursive(
  currentAbsolutePath,
  projectPath,
  currentDepth,
  maxDepth,
  ignoreNames,
  prefix
) {
  if (currentDepth > maxDepth) {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
  } catch (error) {
    // If we can't read a directory (e.g., permissions), stop for this branch
    return [`${prefix}└── Error reading directory: ${error.message}`];
  }

  // Filter out ignored names
  entries = entries.filter((entry) => !ignoreNames.includes(entry.name));

  // Sort entries: directories first, then files, then alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const lines = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const entryName = entry.isDirectory() ? `${entry.name}/` : entry.name;
    lines.push(`${prefix}${connector}${entryName}`);

    if (entry.isDirectory() && currentDepth < maxDepth) {
      const newPrefix = prefix + (isLast ? "    " : "│   ");
      const subTreeLines = await buildTreeRecursive(
        path.join(currentAbsolutePath, entry.name),
        projectPath,
        currentDepth + 1,
        maxDepth,
        ignoreNames,
        newPrefix
      );
      lines.push(...subTreeLines);
    }
  }
  return lines;
}

export const getTools = (projectPath) => ({
  task: async (params) => {
    if (!params.description) {
      return "Error: Missing 'description' parameter for task tool.";
    }
    console.log(
      chalk.magentaBright(`\n📝 Task Announced: ${params.description}`)
    );
    return `Task successfully announced: "${params.description}"`;
  },

  tree: async (params) => {
    const relativeStartPath = params.path || ".";
    const maxDepth = typeof params.maxDepth === "number" ? params.maxDepth : 3;
    const ignoreNames = Array.isArray(params.ignore)
      ? params.ignore
      : ["node_modules", ".git", ".DS_Store", "dist", "build", "coverage"];

    if (maxDepth <= 0 || maxDepth > 10) {
      return "Error: maxDepth must be between 1 and 10.";
    }

    try {
      const startAbsolutePath = resolvePath(relativeStartPath, projectPath);
      const stats = await fs.stat(startAbsolutePath);
      if (!stats.isDirectory()) {
        return `Error: Path "${relativeStartPath}" is not a directory.`;
      }

      const rootDisplayName =
        relativeStartPath === "." || relativeStartPath === ""
          ? "."
          : relativeStartPath.endsWith("/")
          ? relativeStartPath
          : `${relativeStartPath}/`;

      const treeLines = await buildTreeRecursive(
        startAbsolutePath,
        projectPath,
        1, // Start depth at 1 for the first level of children
        maxDepth,
        ignoreNames,
        "" // Initial prefix is empty for children of root
      );

      return `${rootDisplayName}\n${treeLines.join("\n")}`.trim();
    } catch (error) {
      console.error(
        chalk.red(
          `Tree error for path "${relativeStartPath}": ${error.message}`
        )
      );
      return `Error generating tree: ${error.message}`;
    }
  },

  bash: async (params) => {
    if (!params.command) {
      return "Error: Missing 'command' parameter.";
    }
    const timeoutSeconds = BASH_TIMEOUT_MS / 1000;
    console.warn(
      chalk.yellowBright(
        `🚨 Executing BASH: ${params.command} (Timeout: ${timeoutSeconds}s)`
      )
    );

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const childProcess = exec(params.command, {
        cwd: projectPath,
        shell: process.env.SHELL || true,
        timeout: BASH_TIMEOUT_MS,
        killSignal: "SIGTERM",
      });

      childProcess.stdout?.on("data", (data) => {
        stdout += data;
      });
      childProcess.stderr?.on("data", (data) => {
        stderr += data;
      });

      childProcess.on("close", (code, signal) => {
        let capturedOutput = "";
        if (stderr) {
          capturedOutput += `Stderr:\n${stderr.trim()}\n`;
          console.warn(chalk.yellow(`Bash stderr:\n${stderr.trim()}`));
        }
        if (stdout) {
          capturedOutput += `Stdout:\n${stdout.trim()}\n`;
        }

        if (signal === "SIGTERM") {
          const timeoutMessage = `Status: Command timed out after ${timeoutSeconds} seconds and was terminated.`;
          console.warn(chalk.yellow(timeoutMessage));
          resolve(
            `${timeoutMessage}\n\nCaptured Output Before Timeout:\n${
              capturedOutput || "(No output captured)"
            }`
          );
        } else if (code !== 0) {
          const exitMessage = `Error: Command exited with code ${code}.`;
          console.error(chalk.red(exitMessage));
          resolve(
            `${exitMessage}\n\nOutput:\n${capturedOutput || "(No output)"}`
          );
        } else {
          console.log(chalk.green(`Bash command completed successfully.`));
          resolve(
            capturedOutput.trim() ||
              "Command executed successfully (no output)."
          );
        }
      });

      childProcess.on("error", (error) => {
        let capturedOutput = "";
        if (stderr) capturedOutput += `Stderr:\n${stderr.trim()}\n`;
        if (stdout) capturedOutput += `Stdout:\n${stdout.trim()}\n`;

        console.error(
          chalk.red(
            `Bash failed to start "${params.command}": ${error.message}`
          )
        );
        if (error.code === "ETIMEDOUT" || error.signal === "SIGTERM") {
          const timeoutMessage = `Error: Command timed out after ${timeoutSeconds} seconds (during startup phase?).`;
          resolve(
            `${timeoutMessage}\nError message: ${
              error.message
            }\n\nCaptured Output:\n${capturedOutput || "(No output captured)"}`
          );
        } else {
          resolve(
            `Error starting command: ${error.message}\n\nCaptured Output:\n${
              capturedOutput || "(No output captured)"
            }`
          );
        }
      });
    });
  },
  batch: async (params) => {
    if (!params.toolCalls || !Array.isArray(params.toolCalls)) {
      return "Error: Missing or invalid 'toolCalls' array parameter.";
    }
    const tools = getTools(projectPath); // Re-get tools to ensure fresh scope
    const promises = params.toolCalls.map(async (call) => {
      if (!call.name || !tools[call.name]) {
        return {
          tool_name: call.name || "unknown",
          error: `Invalid tool name: ${call.name}`,
        };
      }
      const disallowed = ["bash", "batch"]; // Task and tree are safe, can be batched
      if (disallowed.includes(call.name)) {
        return {
          tool_name: call.name,
          error: `Tool "${call.name}" cannot be used within batch.`,
        };
      }
      console.log(chalk.blue(`[Batch] Executing: ${call.name}`));
      try {
        const result = await tools[call.name](call.parameters || {});
        return { tool_name: call.name, result };
      } catch (error) {
        console.error(
          chalk.red(`[Batch] Error in ${call.name}: ${error.message}`)
        );
        return { tool_name: call.name, error: error.message };
      }
    });
    const settledResults = await Promise.allSettled(promises);
    const formattedResults = settledResults.map((item, index) => {
      const originalCall = params.toolCalls[index];
      if (item.status === "fulfilled") {
        return {
          tool_name: originalCall.name,
          parameters: originalCall.parameters,
          outcome: item.value.error ? "Error" : "Success",
          content: item.value.error || item.value.result || item.value,
        };
      } else {
        console.error(
          chalk.red(
            `[Batch] Unexpected rejection for ${originalCall.name}: ${item.reason}`
          )
        );
        return {
          tool_name: originalCall.name,
          parameters: originalCall.parameters,
          outcome: "Error",
          content: `Tool execution failed unexpectedly: ${
            item.reason?.message || item.reason
          }`,
        };
      }
    });
    return `Batch execution completed. Results:\n${JSON.stringify(
      formattedResults,
      null,
      2
    )}`;
  },
  glob: async (params) => {
    if (!params.pattern) {
      return "Error: Missing 'pattern' parameter.";
    }
    try {
      const files = await glob(params.pattern, {
        cwd: projectPath,
        absolute: false,
        nodir: true,
      });
      return files.length > 0
        ? files.join("\n")
        : "No files found matching pattern.";
    } catch (error) {
      console.error(
        chalk.red(
          `Glob error for pattern "${params.pattern}": ${error.message}`
        )
      );
      return `Error executing glob: ${error.message}`;
    }
  },
  grep: async (params) => {
    if (!params.pattern || !params.paths || !Array.isArray(params.paths)) {
      return "Error: Missing 'pattern' or 'paths' (array) parameter.";
    }
    const results = [];
    let regex;
    try {
      regex = new RegExp(params.pattern, params.flags || "");
    } catch (e) {
      return `Error: Invalid regular expression pattern or flags: ${e.message}`;
    }
    for (const relativeP of params.paths) {
      try {
        const absoluteP = resolvePath(relativeP, projectPath);
        const content = await fs.readFile(absoluteP, "utf-8");
        const lines = content.split("\n");
        const matches = [];
        lines.forEach((line, index) => {
          if (regex.global) regex.lastIndex = 0;
          if (regex.test(line)) {
            matches.push({ lineNumber: index + 1, line: line.trim() });
          }
        });
        if (matches.length > 0) {
          results.push({ path: relativeP, matches: matches });
        } else {
          results.push({ path: relativeP, matches: [] });
        }
      } catch (error) {
        let errorMsg = `Error processing file: ${error.message}`;
        if (error.code === "ENOENT") errorMsg = "Error: File not found.";
        if (error.code === "EISDIR") errorMsg = "Error: Path is a directory.";
        results.push({ path: relativeP, error: errorMsg });
        console.warn(
          chalk.yellow(`Grep warning for "${relativeP}": ${errorMsg}`)
        );
      }
    }
    return results.length > 0
      ? JSON.stringify(results, null, 2)
      : "No files specified or files could not be processed.";
  },
  ls: async (params) => {
    if (typeof params.path !== "string") {
      return "Error: Missing or invalid 'path' parameter.";
    }
    const dirRelativePath = params.path === "" ? "." : params.path;
    try {
      const targetPath = resolvePath(dirRelativePath, projectPath);
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const listing = entries.map(
        (entry) => `[${entry.isDirectory() ? "D" : "F"}] ${entry.name}`
      );
      return listing.length > 0 ? listing.join("\n") : "Directory is empty.";
    } catch (error) {
      console.error(
        chalk.red(`LS error for path "${dirRelativePath}": ${error.message}`)
      );
      if (error.code === "ENOENT")
        return `Error: Directory not found: ${dirRelativePath}`;
      if (error.code === "ENOTDIR")
        return `Error: Path is not a directory: ${dirRelativePath}`;
      return `Error listing directory: ${error.message}`;
    }
  },
  read: async (params) => {
    if (!params.path) {
      return "Error: Missing 'path' parameter.";
    }
    try {
      const filePath = resolvePath(params.path, projectPath);
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      console.error(
        chalk.red(`Read error for path "${params.path}": ${error.message}`)
      );
      if (error.code === "ENOENT")
        return `Error: File not found: ${params.path}`;
      if (error.code === "EISDIR")
        return `Error: Path is a directory: ${params.path}`;
      return `Error reading file: ${error.message}`;
    }
  },
  edit: async (params) => {
    console.warn(
      chalk.yellowBright(
        `🚨 Attempting EDIT on: ${params.path} lines ${params.startLine}-${params.endLine}`
      )
    );
    if (
      !params.path ||
      typeof params.startLine !== "number" ||
      typeof params.endLine !== "number" ||
      typeof params.newContent !== "string"
    ) {
      return "Error: Missing required parameters: 'path' (string), 'startLine' (number), 'endLine' (number), 'newContent' (string).";
    }
    if (params.startLine <= 0 || params.endLine < params.startLine - 1) {
      return `Error: Invalid line numbers. Start line must be >= 1, end line must be >= start line - 1. Got start: ${params.startLine}, end: ${params.endLine}.`;
    }
    try {
      const filePath = resolvePath(params.path, projectPath);
      let content;
      try {
        content = await fs.readFile(filePath, "utf-8");
      } catch (readError) {
        if (readError.code === "ENOENT")
          return `Error: File not found, cannot edit: ${params.path}`;
        throw readError;
      }
      const lines = content.split("\n");
      const startIdx = params.startLine - 1;
      const endIdx = params.endLine - 1; // For insertion (endLine = startLine - 1), endIdx = startIdx - 1

      // Validate line numbers against actual file content
      if (startIdx < 0 || startIdx > lines.length) {
        // Allow insertion at the very end (startIdx === lines.length)
        return `Error: Start line number ${params.startLine} is out of bounds. File has ${lines.length} lines.`;
      }
      // For replacement, endIdx must be within bounds.
      // For insertion (deleteCount is 0), endIdx check is effectively skipped.
      const deleteCount = Math.max(0, endIdx - startIdx + 1);
      if (deleteCount > 0 && endIdx >= lines.length) {
        return `Error: End line number ${params.endLine} is out of bounds for replacement. File has ${lines.length} lines.`;
      }

      const newContentLines =
        params.newContent === "" ? [] : params.newContent.split("\n");
      lines.splice(startIdx, deleteCount, ...newContentLines);
      const newFileContent = lines.join("\n");
      await fs.writeFile(filePath, newFileContent, "utf-8");
      return `File '${params.path}' edited successfully. Lines ${params.startLine} through ${params.endLine} were affected.`;
    } catch (error) {
      console.error(
        chalk.red(`Edit error for path "${params.path}": ${error.message}`)
      );
      if (error.code === "EISDIR")
        return `Error: Path is a directory, cannot edit: ${params.path}`;
      return `Error editing file: ${error.message}`;
    }
  },
  write: async (params) => {
    console.warn(
      chalk.yellowBright(`🚨 Attempting WRITE/OVERWRITE on: ${params.path}`)
    );
    if (!params.path || typeof params.content !== "string") {
      return "Error: Missing required parameters: 'path' (string), 'content' (string).";
    }
    try {
      const filePath = resolvePath(params.path, projectPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, params.content, "utf-8");
      return `File '${params.path}' written successfully.`;
    } catch (error) {
      console.error(
        chalk.red(`Write error for path "${params.path}": ${error.message}`)
      );
      if (error.code === "EISDIR")
        return `Error: Path is a directory, cannot write file: ${params.path}`;
      return `Error writing file: ${error.message}`;
    }
  },
  webFetch: async (params) => {
    if (!params.url) {
      return "Error: Missing 'url' parameter.";
    }
    console.log(chalk.blue(`Fetching URL: ${params.url}`));
    try {
      new URL(params.url); // Basic validation
      const response = await fetch(params.url, {
        headers: { "User-Agent": "NodeJS-AIAssistant/1.0" },
        timeout: 15000, // 15 seconds timeout
      });
      if (!response.ok) {
        return `Error fetching URL: ${response.status} ${response.statusText}`;
      }
      const contentType = response.headers.get("content-type");
      if (
        contentType &&
        !contentType.includes("text") &&
        !contentType.includes("json") &&
        !contentType.includes("xml") &&
        !contentType.includes("javascript") &&
        !contentType.includes("css")
      ) {
        console.warn(
          chalk.yellow(
            `WebFetch: Skipping non-text content type (${contentType}) for URL ${params.url}`
          )
        );
        return `Error: Content type (${contentType}) is not text-based. Cannot process binary data.`;
      }
      const text = await response.text();
      const MAX_FETCH_LENGTH = 5000;
      if (text.length > MAX_FETCH_LENGTH) {
        return (
          text.substring(0, MAX_FETCH_LENGTH) + "\n... (content truncated)"
        );
      }
      return text || "(Empty response body)";
    } catch (error) {
      console.error(
        chalk.red(`WebFetch error for URL "${params.url}": ${error.message}`)
      );
      // Check if error is due to invalid URL structure before fetch even starts
      if (error instanceof TypeError && error.message.includes("Invalid URL")) {
        return `Error: Invalid URL format: ${params.url}`;
      }
      if (error.name === "AbortError" || error.type === "request-timeout") {
        // Check for AbortError (node-fetch timeout) or type
        return `Error: Request timed out while fetching URL: ${params.url}`;
      }
      return `Error fetching URL: ${error.message}`;
    }
  },
});
