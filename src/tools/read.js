// src/tools/read.js
import fs from "fs/promises";
import path from "path";

export const execute = async (params, projectPath) => {
  const { filePath } = params;
  if (!filePath) {
    return {
      status: "error",
      output: 'Read tool error: "filePath" parameter is required.',
    };
  }

  const fullPath = path.resolve(projectPath, filePath);
  if (!fullPath.startsWith(path.resolve(projectPath))) {
    return {
      status: "error",
      output: "Read tool error: filePath is outside the project directory.",
    };
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    return { status: "success", output: content };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        status: "error",
        output: `Read error: File not found at '${filePath}'.`,
      };
    }
    return { status: "error", output: `Read error: ${error.message}` };
  }
};
