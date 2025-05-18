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

const MAX_TOOL_ITERATIONS = 70;

function removeThinkingBlocks(text) {
  if (!text || typeof text !== "string") {
    return text || "";
  }
  const regex = /<think>[\s\S]*?<\/think>\n?/g;
  return text.replace(regex, "").trim();
}

export async function startChat(projectPath, model, braveMode) {
  const commandProcessor = new CommandProcessor();
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
      "Ask for help with your project, e.g., 'Read the main app file' or '/develop Add JWT auth'."
    )
  );

  const messages = [{ role: "system", content: getSystemPrompt(projectPath) }];
  const toolExecutor = new ToolExecutor(projectPath, braveMode, model);

  while (true) {
    const userInput = await rl.question(chalk.greenBright("\nYou: "));
    if (
      userInput.toLowerCase() === "exit" ||
      userInput.toLowerCase() === "quit"
    ) {
      break;
    }

    const commandResult = commandProcessor.processInput(userInput);
    let effectiveInput = userInput;

    if (commandResult.type === "client_handled") {
      continue;
    } else if (commandResult.type === "llm_prompt") {
      effectiveInput = commandResult.content;
    } else if (commandResult.type === "unknown_command") {
      effectiveInput = userInput;
    }

    messages.push({ role: "user", content: effectiveInput });

    let iterationCount = 0;
    let plan = null;
    let currentTask = userInput.startsWith("/develop")
      ? userInput.slice(9).trim()
      : null;

    while (true) {
      if (iterationCount >= MAX_TOOL_ITERATIONS) {
        console.error(chalk.red("Max tool iterations reached. Aborting."));
        messages.push({
          role: "user",
          content: "TOOL_EXECUTION_ERROR: Max iterations reached.",
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
        messages.push(llmResponse);
        break;
      }

      llmResponse.content = removeThinkingBlocks(llmResponse.content);
      messages.push(llmResponse);

      const {
        toolCalls,
        plan: extractedPlan,
        textOnlyResponse,
      } = extractToolCalls(llmResponse.content);

      if (extractedPlan) {
        plan = extractedPlan;
      }

      if (textOnlyResponse.trim()) {
        console.log(chalk.cyan(`\n🤖 Assistant: ${textOnlyResponse}`));
      }

      if (toolCalls.length === 0) {
        break;
      }

      const toolResponses = [];
      for (const toolCall of toolCalls) {
        const result = await toolExecutor.confirmAndExecute(toolCall);
        toolResponses.push(result);
      }

      messages.push({
        role: "user",
        content: JSON.stringify({ tool_responses: toolResponses }),
      });
      console.log(chalk.magenta("\n📬 Sent tool results back to LLM."));
    }

    if (plan && currentTask) {
      try {
        const steps = JSON.parse(plan);
        if (Array.isArray(steps)) {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(
              chalk.yellow(`\nExecuting Step ${i + 1}/${steps.length}: ${step}`)
            );
            messages.push({
              role: "user",
              content: `TASK: ${step}\nConfirm completion by replying with \`TASK COMPLETE\`.`,
            });

            let stepCompleted = false;
            while (!stepCompleted) {
              const stepResponse = await sendMessage(messages, model);
              stepResponse.content = removeThinkingBlocks(stepResponse.content);
              messages.push(stepResponse);

              const { toolCalls: stepToolCalls, textOnlyResponse: stepText } =
                extractToolCalls(stepResponse.content);

              if (stepText.trim().includes("TASK COMPLETE")) {
                console.log(chalk.cyan(`\n🤖 Assistant: ${stepText}`));
                stepCompleted = true;
              } else if (stepText.trim()) {
                console.log(chalk.cyan(`\n🤖 Assistant: ${stepText}`));
              }

              if (stepToolCalls.length > 0) {
                const toolResponses = [];
                for (const toolCall of stepToolCalls) {
                  const result = await toolExecutor.confirmAndExecute(toolCall);
                  toolResponses.push(result);
                }
                messages.push({
                  role: "user",
                  content: JSON.stringify({ tool_responses: toolResponses }),
                });
              } else {
                messages.push({
                  role: "user",
                  content: `**If you have finished the task ${step} make sure to Confirm it by replying with \`TASK COMPLETE\`.**`,
                });
              }
            }
            console.log(
              chalk.green(`Completed Step ${i + 1}/${steps.length}: ${step}`)
            );
          }
          console.log(
            chalk.green(`\nSuccess: Task "${currentTask}" completed.`)
          );
        } else {
          console.error(chalk.red("Invalid plan: not an array."));
        }
      } catch (error) {
        console.error(chalk.red("Error parsing plan:"), error.message);
      }
    }
  }

  console.log(chalk.cyanBright("\nExiting CLI Assistant. Goodbye!"));
  rl.close();
}
