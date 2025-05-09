// src/tools/tree.js
import fs from "fs/promises";
import path from "path";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_IGNORE_DIRS = [
  "node_modules",
  ".git",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "__pycache__",
];

async function buildTree(
  currentDirName, // Name of the current directory being processed
  projectRoot, // Absolute path to the project root
  relativePath, // Relative path from projectRoot to currentDir
  indent = "",
  currentDepth = 0,
  maxDepth,
  ignoreDirs
) {
  let structure = "";
  const fullCurrentDir = path.resolve(projectRoot, relativePath);

  if (currentDepth >= maxDepth) {
    structure += `${indent}└── [Max depth reached]\n`;
    return structure;
  }

  try {
    const items = await fs.readdir(fullCurrentDir, { withFileTypes: true });
    // Filter out ignored directories
    const filteredItems = items.filter((item) => {
      if (item.isDirectory() && ignoreDirs.includes(item.name)) {
        return false;
      }
      return true;
    });

    filteredItems.sort((a, b) => a.name.localeCompare(b.name)); // Sort for consistent output

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const isLastItem = i === filteredItems.length - 1;
      structure += `${indent}${isLastItem ? "└── " : "├── "}${item.name}`;
      if (item.isDirectory()) {
        structure += "/\n"; // Indicate it's a directory
        const newRelativePath = path.join(relativePath, item.name);
        structure += await buildTree(
          item.name,
          projectRoot,
          newRelativePath,
          `${indent}${isLastItem ? "    " : "│   "}`,
          currentDepth + 1,
          maxDepth,
          ignoreDirs
        );
      } else {
        structure += "\n";
      }
    }
  } catch (error) {
    // Don't break the whole tree if one dir is unreadable, just note it
    return `${indent}└── [Error reading directory ${currentDirName}: ${error.message}]\n`;
  }
  return structure;
}

export const execute = async (params, projectPath) => {
  const dirPath = params.dirPath || "."; // Relative path from project root
  const maxDepth =
    params.maxDepth === undefined ? DEFAULT_MAX_DEPTH : Number(params.maxDepth);
  const ignoreDirsInput = params.ignoreDirs || [];
  // Combine default ignore list with user-provided list, removing duplicates
  const ignoreDirs = [...new Set([...DEFAULT_IGNORE_DIRS, ...ignoreDirsInput])];

  const resolvedStartDirPath = path.resolve(projectPath, dirPath);

  if (!resolvedStartDirPath.startsWith(path.resolve(projectPath))) {
    return {
      status: "error",
      output: "Tree tool error: dirPath is outside the project directory.",
    };
  }

  try {
    const stats = await fs.stat(resolvedStartDirPath);
    if (!stats.isDirectory()) {
      return {
        status: "error",
        output: `Tree tool error: '${dirPath}' is not a directory.`,
      };
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        status: "error",
        output: `Tree error: Directory not found at '${dirPath}'.`,
      };
    }
    return { status: "error", output: `Tree error: ${error.message}` };
  }

  try {
    const baseName =
      dirPath === "."
        ? path.basename(projectPath) + ` (project root, depth ${maxDepth})`
        : path.basename(dirPath) + ` (depth ${maxDepth})`;
    let output = `${baseName}/\n`; // Add trailing slash to indicate it's a directory
    output += await buildTree(
      path.basename(resolvedStartDirPath), // Name of the starting directory
      projectPath, // Project root
      dirPath, // Relative path to start from
      "", // Initial indent
      0, // Initial depth
      maxDepth,
      ignoreDirs
    );
    return { status: "success", output: output.trim() };
  } catch (error) {
    return { status: "error", output: `Tree error: ${error.message}` };
  }
};
