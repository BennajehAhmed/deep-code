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
  const { pattern, ignore: userIgnorePatterns } = params; // Destructure userIgnorePatterns
  if (!pattern) {
    return {
      status: "error",
      output: 'Glob tool error: "pattern" parameter is required.',
    };
  }

  let combinedIgnorePatterns = [...DEFAULT_IGNORE_PATTERNS];

  // Merge user-provided ignore patterns with defaults, ensuring no duplicates
  if (Array.isArray(userIgnorePatterns) && userIgnorePatterns.length > 0) {
    const uniqueIgnores = new Set([
      ...DEFAULT_IGNORE_PATTERNS,
      ...userIgnorePatterns,
    ]);
    combinedIgnorePatterns = [...uniqueIgnores];
  }

  try {
    const files = await glob(pattern, {
      cwd: projectPath,
      dot: true, // Include dotfiles (e.g., .env, .eslintrc)
      nodir: false, // Allows matching directories as well as files. You might need to filter results or use LS if you only want files from a matched directory.
      ignore: combinedIgnorePatterns, // Use combined ignore patterns
    });
    return { status: "success", output: files };
  } catch (error) {
    return { status: "error", output: `Glob error: ${error.message}` };
  }
};
