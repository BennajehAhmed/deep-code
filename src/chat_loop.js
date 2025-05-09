// src/chat_loop.js
import readline from "readline/promises";
import chalk from "chalk";
import { sendMessage, extractToolCalls } from "./llm_interface.js";
import { getSystemPrompt } from "./system_prompt.js";
import { ToolExecutor } from "./tool_executor.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const MAX_TOOL_ITERATIONS = 10; // Prevent infinite loops

export async function startChat(projectPath, model, braveMode) {
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

    messages.push({ role: "user", content: userInput });

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
        // Force a final response from LLM without further tool calls
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
        // Potentially break or allow user to retry? For now, just show error and wait for next user input.
        messages.push(llmResponse); // Add error response to history
        break; // Break inner loop, go to next user input
      }

      messages.push(llmResponse); // Add assistant's raw response to history

      const { toolCalls, textOnlyResponse } = extractToolCalls(
        llmResponse.content
      );

      if (textOnlyResponse) {
        console.log(chalk.cyan(`\n🤖 Assistant: ${textOnlyResponse}`));
      }

      if (toolCalls.length === 0) {
        break; // No tools to call, assistant's turn is over, wait for user.
      }

      const toolResponses = [];
      for (const toolCall of toolCalls) {
        const result = await toolExecutor.confirmAndExecute(toolCall);
        toolResponses.push(result);
      }

      // Provide tool execution results back to the LLM
      const toolResultsMessage = {
        role: "user", // Or 'tool' if your API supports it. 'user' is common.
        content: JSON.stringify({ tool_responses: toolResponses }),
      };
      messages.push(toolResultsMessage);
      console.log(
        chalk.magenta(
          "\n📬 Sent tool results back to LLM. Waiting for next action..."
        )
      );
      // Continue the loop to get LLM's response based on tool results
    }
  }

  console.log(chalk.cyanBright("\nExiting CLI Assistant. Goodbye!"));
  rl.close();
}
