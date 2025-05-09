// src/tools/ls.js
import fs from "fs/promises";
import path from "path";

export const execute = async (params, projectPath) => {
  const dirPath = params.dirPath || ".";
  const fullPath = path.resolve(projectPath, dirPath);

  if (!fullPath.startsWith(path.resolve(projectPath))) {
    return {
      status: "error",
      output: "LS tool error: dirPath is outside the project directory.",
    };
  }

  try {
    const items = await fs.readdir(fullPath, { withFileTypes: true });
    const output = items.map((item) => ({
      name: item.name,
      type: item.isDirectory() ? "directory" : item.isFile() ? "file" : "other",
    }));
    return { status: "success", output };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        status: "error",
        output: `LS error: Directory not found at '${dirPath}'.`,
      };
    }
    return { status: "error", output: `LS error: ${error.message}` };
  }
};
