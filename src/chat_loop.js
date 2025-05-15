// src/chat_loop.js
import readline from "readline/promises";
import chalk from "chalk";

import { sendMessage, extractToolCalls } from "./llm_interface.js";
import { getSystemPrompt } from "./system_prompt.js";
import { ToolExecutor } from "./tool_executor.js";
import { CommandProcessor } from "./command_processor.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const MAX_TOOL_ITERATIONS = 70; // Prevent infinite loops

/**
 * Removes <think>...</think> blocks from a string.
 * These blocks are used by the LLM for its thought process but are not
 * meant for the user or for the history.
 * @param {string | null | undefined} text The text to process.
 * @returns {string} The text with thinking blocks removed.
 */
function removeThinkingBlocks(text) {
  if (!text || typeof text !== "string") {
    return text || ""; // Return empty string if text is null/undefined
  }
  // Regex to match <think>...</think> blocks, including multiline content
  // and the tags themselves. It also removes an optional newline character
  // that might immediately follow a closing </think> tag.
  const regex = /<think>[\s\S]*?<\/think>\n?/g;
  return text.replace(regex, "").trim();
}

export async function startChat(projectPath, model, braveMode) {
  const commandProcessor = new CommandProcessor(); // Uses default commands.json path
  await commandProcessor.loadCommands();

  console.log(chalk.cyanBright.bold("===== Autonomous CLI Assistant ====="));
  console.log(chalk.gray(`Project Path: ${projectPath}`));
  console.log(chalk.gray(`LLM Model: ${model}`));
  console.log(
    chalk.gray(
      `Brave Mode: ${braveMode ? chalk.green("ON") : chalk.red("OFF")}`
    )
  );
  if (braveMode) {
    console.warn(
      chalk.yellowBright(
        "⚠️ Brave Mode is ON. Tools, including Bash, will be executed automatically. Use with caution!"
      )
    );
  }
  console.log(chalk.blue("\nType 'exit' or 'quit' to end the session."));
  console.log(chalk.blue("Type '/help' to see available commands."));
  console.log(
    chalk.blue(
      "Ask for help with your project, e.g., 'Read the main app file' or 'Refactor the User class to include an email field and update tests.'"
    )
  );

  const messages = [{ role: "system", content: getSystemPrompt(projectPath) }];
  const toolExecutor = new ToolExecutor(projectPath, braveMode, model);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const userInput = await rl.question(chalk.greenBright("\nYou: "));
    if (
      userInput.toLowerCase() === "exit" ||
      userInput.toLowerCase() === "quit"
    ) {
      break;
    }

    const commandResult = commandProcessor.processInput(userInput);
    let effectiveInput = userInput; // Default to original input

    if (commandResult.type === "client_handled") {
      // e.g., /help was handled, display a new prompt
      continue;
    } else if (commandResult.type === "llm_prompt") {
      effectiveInput = commandResult.content;
    } else if (commandResult.type === "unknown_command") {
      // Let the LLM try to figure out the unknown command or user's intent
      effectiveInput = userInput;
      // Optionally, you could add a message to the LLM like:
      // effectiveInput = `User tried command '${commandResult.commandName}' which is unknown. Original input: ${userInput}`;
    }
    // If commandResult.type === "no_command", effectiveInput remains userInput

    messages.push({ role: "user", content: effectiveInput });

    let iterationCount = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Loop for LLM response -> tool execution -> LLM response cycle
      if (iterationCount >= MAX_TOOL_ITERATIONS) {
        console.error(
          chalk.red("Max tool iterations reached. Aborting this sequence.")
        );
        messages.push({
          role: "user",
          content:
            "TOOL_EXECUTION_ERROR: Max tool iterations reached. Please summarize your current state or ask the user for guidance.",
        });
      }
      iterationCount++;

      console.log(
        chalk.gray(
          `\n🧠 Thinking with ${chalk.bold(
            model
          )}... (Iteration ${iterationCount})`
        )
      );
      const llmResponse = await sendMessage(messages, model);

      if (llmResponse.error) {
        console.error(chalk.redBright("Assistant Error:"), llmResponse.content);
        messages.push(llmResponse); // Push original error response to history
        break; // Break from the inner tool loop, back to user prompt
      }

      // Remove thinking blocks from the LLM's response content.
      // The llmResponse object's content property is modified in place.
      // This ensures the cleaned content is used for history, tool extraction, and display.
      llmResponse.content = removeThinkingBlocks(llmResponse.content);

      messages.push(llmResponse); // Add the LLM response (with cleaned content) to the history

      // Extract tool calls and text-only response from the *cleaned* content
      const { toolCalls, textOnlyResponse } = extractToolCalls(
        llmResponse.content
      );

      // Display the text-only part of the response (which is now cleaned)
      // Only display if there's actual text content after cleaning and tool extraction.
      const assistantDisplayResponse = textOnlyResponse.trim();
      if (assistantDisplayResponse) {
        console.log(chalk.cyan(`\n🤖 Assistant: ${assistantDisplayResponse}`));
      }

      if (toolCalls.length === 0) {
        // If no tool calls, and text (if any) has been displayed, break from tool loop
        break;
      }

      const toolResponses = [];
      for (const toolCall of toolCalls) {
        const result = await toolExecutor.confirmAndExecute(toolCall);
        toolResponses.push(result);
      }

      const toolResultsMessage = {
        role: "user", // Or "tool" if your LLM API supports it and you prefer
        content: JSON.stringify({ tool_responses: toolResponses }),
      };
      messages.push(toolResultsMessage);
      console.log(
        chalk.magenta(
          "\n📬 Sent tool results back to LLM. Waiting for next action..."
        )
      );
    }
  }

  console.log(chalk.cyanBright("\nExiting CLI Assistant. Goodbye!"));
  rl.close();
}
