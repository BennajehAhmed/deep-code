#!/usr/bin/env node
import chalk from "chalk";
import fs from "fs/promises";
import inquirer from "inquirer";
import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { getTools } from "./tools.js";
import { sendMessage } from "./llm.js";

const MAX_ITERATIONS = 25;
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V3-0324";

const argv = yargs(hideBin(process.argv))
  .option("p", {
    alias: "projectPath",
    description: "Absolute path to the project directory",
    type: "string",
    demandOption: true,
  })
  .option("m", {
    alias: "model",
    description: "Name of the LLM model to use",
    type: "string",
    default: DEFAULT_MODEL,
  })
  .usage("Usage: $0 -p /path/to/project [-m model_name] [-k api_key]")
  .help()
  .alias("help", "h")
  .parseSync();

const projectPath = path.resolve(argv.projectPath);
const tools = getTools(projectPath);
const selectedModel = argv.model;

// Read system prompt from system-prompt.md file
const SYSTEM_PROMPT = (
  await fs.readFile(path.join(process.cwd(), "src/system-prompt2.md"), "utf-8")
)?.replaceAll("{{projectPath}}", projectPath);

// --- Tool Execution Logic ---
const toolCallRegex = /<tool_call>([\s\S]+?)<\/tool_call>/g;
function parseToolCalls(content) {
  if (!content) return [];
  const calls = [];
  let match;
  let callIdCounter = 0;
  toolCallRegex.lastIndex = 0;
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const parsed = JSON.parse(jsonContent);
      if (parsed.name && parsed.parameters && tools[parsed.name]) {
        const tool_call_id = `call_${Date.now()}_${callIdCounter++}`;
        calls.push({
          id: tool_call_id,
          name: parsed.name,
          parameters: parsed.parameters,
        });
      } else {
        console.warn(
          chalk.yellow(
            `⚠️ Skipping invalid tool call structure or unknown tool name in: ${jsonContent}`
          )
        );
      }
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️ Skipping invalid JSON in tool call: ${match[1].trim()} - Error: ${
            error.message
          }`
        )
      );
    }
  }
  return calls;
}

async function executeToolCall(toolCall) {
  console.log(
    chalk.cyan(`\n🔧 Executing tool: ${chalk.bold(toolCall.name)} `) +
      chalk.gray(`(ID: ${toolCall.id})`)
  );
  const paramsString = JSON.stringify(toolCall.parameters);
  console.log(
    chalk.gray(
      `   Parameters: ${
        paramsString.length > 200
          ? paramsString.substring(0, 197) + "..."
          : paramsString
      }`
    )
  );
  let toolResultContent;
  try {
    const toolFunction = tools[toolCall.name];
    if (!toolFunction) {
      throw new Error(`Tool "${toolCall.name}" is not implemented.`);
    }
    toolResultContent = await toolFunction(toolCall.parameters);
    if (typeof toolResultContent !== "string") {
      toolResultContent = JSON.stringify(toolResultContent, null, 2);
    }
    console.log(chalk.cyan(`✅ Tool ${toolCall.name} completed.`));
    console.log(
      chalk.gray(
        `   Result: ${
          toolResultContent.length > 300
            ? toolResultContent.substring(0, 297) + "..."
            : toolResultContent
        }`
      )
    );
  } catch (error) {
    console.error(
      chalk.redBright(`❌ Error executing tool ${toolCall.name}:`),
      error
    );
    toolResultContent = `Error executing tool ${toolCall.name}: ${error.message}`;
  }
  return {
    role: "tool",
    tool_call_id: toolCall.id,
    name: toolCall.name,
    content: toolResultContent,
  };
}

// --- Main Application Logic ---
async function main() {
  console.log(chalk.green("🚀 Autonomous AI Assistant Initializing..."));
  console.log(chalk.yellow(`📂 Project Path: ${projectPath}`));
  console.log(chalk.blue(`🤖 Model: ${selectedModel}`));
  try {
    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      console.error(
        chalk.redBright(
          `🚨 Error: Project path "${projectPath}" is not a directory.`
        )
      );
      process.exit(1);
    }
    console.log(chalk.green("✅ Project path validated."));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(
        chalk.redBright(`🚨 Error: Project path "${projectPath}" not found.`)
      );
    } else {
      console.error(
        chalk.redBright(
          `🚨 Error accessing project path "${projectPath}": ${error.message}`
        )
      );
    }
    process.exit(1);
  }
  console.warn(chalk.bold.redBright("\n⚠️ SECURITY WARNING ⚠️"));
  console.warn(
    chalk.red(
      "This AI assistant can modify files and execute commands ('bash')."
    )
  );
  console.warn(
    chalk.red("Ensure the project path is safe and you understand the risks.")
  );
  console.warn(chalk.red("Supervise the AI's actions closely.\n"));
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  let interactionCount = 0;
  const chat = async () => {
    const { userInput } = await inquirer.prompt([
      {
        type: "input",
        name: "userInput",
        message: chalk.bold.blue("You:"),
        prefix: "",
      },
    ]);
    if (!userInput || ["exit", "quit"].includes(userInput.toLowerCase())) {
      console.log(chalk.yellow("👋 Assistant shutting down."));
      return;
    }
    messages.push({ role: "user", content: userInput });
    interactionCount = 0;
    let llmResponse;
    let toolCalls = [];
    do {
      toolCalls = [];
      if (interactionCount >= MAX_ITERATIONS) {
        console.warn(
          chalk.yellow(
            `⚠️ Reached max iterations (${MAX_ITERATIONS}). Forcing final response.`
          )
        );
        messages.push({
          role: "user",
          content:
            "SYSTEM: Max iterations reached. Please provide the final response now or state why you cannot complete the task.",
        });
      }
      llmResponse = await sendMessage(messages, selectedModel);
      if (llmResponse.error) {
        console.error(
          chalk.redBright(
            "Assistant encountered a critical error and cannot proceed."
          )
        );
        break;
      }
      messages.push(llmResponse);
      if (llmResponse.content) {
        console.log(chalk.greenBright(`\nAssistant (${selectedModel}):`));
        console.log(llmResponse.content);
      }
      toolCalls = parseToolCalls(llmResponse.content);
      if (toolCalls.length > 0 && interactionCount < MAX_ITERATIONS) {
        const toolResultMessages = [];
        for (const call of toolCalls) {
          const resultMessage = await executeToolCall(call);
          toolResultMessages.push(resultMessage);
        }
        messages.push(...toolResultMessages);
        interactionCount++;
      } else if (toolCalls.length > 0 && interactionCount >= MAX_ITERATIONS) {
        console.warn(
          chalk.yellow(
            `⚠️ Max iterations reached. Ignoring requested tools: ${toolCalls
              .map((t) => t.name)
              .join(", ")}`
          )
        );
        break;
      } else {
        if (!llmResponse.content) {
          console.log(
            chalk.gray("Assistant finished without further text response.")
          );
        }
        break;
      }
    } while (toolCalls.length > 0 && !llmResponse.error);
    if (!llmResponse?.error) {
      chat();
    } else {
      console.log(chalk.red("Exiting due to critical error."));
    }
  };
  await chat();
}

// --- Entry Point ---
main().catch((error) => {
  console.error(chalk.redBright("\n🚨 Unhandled Critical Error:"), error);
  process.exit(1);
});
