// src/tools/write.js
import fs from "fs/promises";
import path from "path";

export const execute = async (params, projectPath) => {
  const { filePath, content } = params;
  if (filePath === undefined) {
    return {
      status: "error",
      output: 'Write tool error: "filePath" parameter is required.',
    };
  }
  if (content === undefined) {
    return {
      status: "error",
      output: 'Write tool error: "content" parameter is required.',
    };
  }

  const fullPath = path.resolve(projectPath, filePath);
  if (!fullPath.startsWith(path.resolve(projectPath))) {
    return {
      status: "error",
      output: "Write tool error: filePath is outside the project directory.",
    };
  }

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return {
      status: "success",
      output: `File '${filePath}' written successfully.`,
    };
  } catch (error) {
    return { status: "error", output: `Write error: ${error.message}` };
  }
};
