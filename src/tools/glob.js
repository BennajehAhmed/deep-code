// src/tools/glob.js
import { glob } from "glob";

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules/**",
  ".git/**",
  "dist/**", // Common build output directory
  "build/**", // Another common build output directory
  "coverage/**", // Common test coverage directory
  ".vscode/**", // VS Code specific files
  ".idea/**", // JetBrains IDE specific files
  // Add any other common directories/files you want to ignore by default
];

export const execute = async (params, projectPath) => {
  const { pattern } = params;
  if (!pattern) {
    return {
      status: "error",
      output: 'Glob tool error: "pattern" parameter is required.',
    };
  }
  try {
    const files = await glob(pattern, {
      cwd: projectPath,
      dot: true,
      nodir: false,
      ignore: DEFAULT_IGNORE_PATTERNS,
    }); // nodir: false to include directories
    return { status: "success", output: files };
  } catch (error) {
    return { status: "error", output: `Glob error: ${error.message}` };
  }
};
