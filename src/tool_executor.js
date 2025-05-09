// src/tool_executor.js
import chalk from "chalk";
import inquirer from "inquirer";
import path from "path";
import { tools } from "./tools/index.js";

export class ToolExecutor {
  constructor(projectPath, braveMode = false, model = "default-model") {
    this.projectPath = path.resolve(projectPath); // Ensure projectPath is absolute
    this.braveMode = braveMode;
    this.model = model; // For potential use in tool logging or context
  }

  async executeSingleTool(toolName, toolParams) {
    const toolFn = tools[toolName];
    if (!toolFn) {
      return { status: "error", output: `Tool "${toolName}" not found.` };
    }

    try {
      if (toolName === "Batch") {
        // Batch tool needs the ability to call other tools, so pass a bound version of this method
        return await toolFn(
          toolParams,
          this.projectPath,
          this.executeSingleTool.bind(this)
        );
      }
      return await toolFn(toolParams, this.projectPath);
    } catch (error) {
      console.error(chalk.red(`Error during ${toolName} execution:`), error);
      return {
        status: "error",
        output: `Tool ${toolName} execution failed: ${error.message}`,
      };
    }
  }

  async confirmAndExecute(toolCall) {
    if (toolCall.error) {
      // If tool call parsing itself failed
      return {
        tool_name: toolCall.raw_content ? `InvalidToolCall` : "UnknownTool",
        parameters: toolCall.raw_content ? { raw: toolCall.raw_content } : {},
        status: "error",
        output: toolCall.error,
      };
    }

    const { name: toolName, parameters: toolParams } = toolCall;
    let confirmed = this.braveMode;

    if (!this.braveMode) {
      console.log(
        chalk.yellow(`\n🤖 LLM wants to execute tool: ${chalk.bold(toolName)}`)
      );
      console.log(
        chalk.yellow("   Parameters:"),
        JSON.stringify(toolParams, null, 2)
      );
      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "Do you want to execute this tool call?",
          default: true,
        },
      ]);
      confirmed = proceed;
    }

    if (confirmed) {
      console.log(
        chalk.blue(`\n🚀 Executing tool: ${chalk.bold(toolName)} with params:`),
        toolParams
      );
      const result = await this.executeSingleTool(toolName, toolParams);
      console.log(
        chalk.blue(
          `✅ Tool ${toolName} finished. Status: ${
            result.status === "success"
              ? chalk.green(result.status)
              : chalk.red(result.status)
          }`
        )
      );
      if (result.status === "error") {
        console.log(chalk.red("   Output:"), result.output);
      } else if (toolName === "Bash" || toolName === "Batch") {
        // Complex outputs
        console.log(chalk.blue("   Output (details):"), result.output);
      } else if (
        typeof result.output === "string" &&
        result.output.length > 100
      ) {
        console.log(
          chalk.blue("   Output (preview):"),
          result.output.substring(0, 100) + "..."
        );
      } else {
        console.log(chalk.blue("   Output:"), result.output);
      }
      return { tool_name: toolName, parameters: toolParams, ...result };
    } else {
      console.log(chalk.magenta(`Skipped execution of tool: ${toolName}`));
      return {
        tool_name: toolName,
        parameters: toolParams,
        status: "error", // or 'skipped' if your LLM understands that
        output: "User denied tool execution.",
      };
    }
  }
}
