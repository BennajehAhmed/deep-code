// src/tools/glob.js
import { glob } from "glob";
import path from "path";

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
    }); // nodir: false to include directories
    return { status: "success", output: files };
  } catch (error) {
    return { status: "error", output: `Glob error: ${error.message}` };
  }
};
