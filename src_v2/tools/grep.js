// src/tools/grep.js
import fs from "fs/promises";
import path from "path";

export const execute = async (params, projectPath) => {
  const { filePath, regex, flags = "" } = params;
  if (!filePath) {
    return {
      status: "error",
      output: 'Grep tool error: "filePath" parameter is required.',
    };
  }
  if (!regex) {
    return {
      status: "error",
      output: 'Grep tool error: "regex" parameter is required.',
    };
  }

  const fullPath = path.resolve(projectPath, filePath);
  if (!fullPath.startsWith(path.resolve(projectPath))) {
    return {
      status: "error",
      output: "Grep tool error: filePath is outside the project directory.",
    };
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    const re = new RegExp(regex, flags);
    const lines = content.split("\n");
    const results = [];
    lines.forEach((line, index) => {
      let match;
      const lineMatches = [];
      // If global flag is used, find all matches in the line
      if (re.global) {
        while ((match = re.exec(line)) !== null) {
          lineMatches.push([...match]); // Store all capture groups
        }
      } else {
        match = line.match(re);
        if (match) {
          lineMatches.push([...match]);
        }
      }

      if (lineMatches.length > 0) {
        results.push({
          lineNumber: index + 1,
          line: line,
          matches: lineMatches,
        });
      }
    });
    return { status: "success", output: results };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        status: "error",
        output: `Grep error: File not found at '${filePath}'.`,
      };
    }
    return { status: "error", output: `Grep error: ${error.message}` };
  }
};
