// src/tools/bash.js
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const execute = async (params, projectPath) => {
  // Destructure `background` with a default value of false
  const { command, background = false } = params;

  if (!command) {
    return {
      status: "error",
      output: 'Bash tool error: "command" parameter is required.',
    };
  }

  if (background) {
    // Handle background execution using spawn
    try {
      // We pass an empty array for args because `shell: true` means the `command` string
      // itself will be interpreted by the shell.
      const child = spawn(command, [], {
        cwd: projectPath,
        shell: true, // Allows execution of complex commands, scripts, pipes, etc., via the system shell
        detached: true, // Crucial for allowing the parent process (this tool) to exit independently
        stdio: "ignore", // Detach stdio: parent won't wait for child's IO, prevents hanging.
        // Child's output will go to system default (often /dev/null) unless
        // the command itself redirects it (e.g., `npm start > server.log 2>&1`).
      });

      // If child.pid is not set, it means spawn might have failed to create the process.
      // However, spawn() itself usually throws an error for immediate failures (e.g., invalid options,
      // system errors preventing process creation). This is an extra safeguard.
      if (!child.pid) {
        return {
          status: "error",
          output: {
            message: `Failed to spawn command "${command}" in background: No PID was assigned, though spawn did not throw an immediate error.`,
            stdout: "",
            stderr: "",
          },
        };
      }

      // unref() allows the parent process to exit even if the child is still running.
      // This is essential for background tasks.
      child.unref();

      return {
        status: "success",
        output: {
          stdout: `Command "${command}" has been initiated in the background with PID: ${child.pid}. Its output will not be captured by this tool. Check server logs or process status manually if needed.`,
          stderr: "", // No stderr is captured by this tool for background processes
        },
      };
    } catch (error) {
      // This catch block handles errors thrown by the spawn() call itself
      // (e.g., system errors, invalid options passed to spawn).
      return {
        status: "error",
        output: {
          message: `Error attempting to start background command "${command}": ${error.message}`,
          stdout: "",
          stderr: "", // Spawn errors don't typically populate stdout/stderr on the error object
        },
      };
    }
  } else {
    // Handle foreground execution (existing logic, waits for completion)
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectPath,
        shell: true, // shell: true for complex commands (as in original)
      });
      return { status: "success", output: { stdout, stderr } };
    } catch (error) {
      // Errors from execAsync often include stdout and stderr from the failed command
      return {
        status: "error",
        output: {
          message: error.message, // This message often includes the exit code
          stdout: error.stdout || "",
          stderr: error.stderr || "",
        },
      };
    }
  }
};
