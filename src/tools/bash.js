// src/tools/bash.js
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const execute = async (params, projectPath) => {
  const { command } = params;
  if (!command) {
    return {
      status: "error",
      output: 'Bash tool error: "command" parameter is required.',
    };
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectPath,
      shell: true,
    }); // shell: true for complex commands
    return { status: "success", output: { stdout, stderr } };
  } catch (error) {
    return {
      status: "error",
      output: {
        message: error.message,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
      },
    };
  }
};
