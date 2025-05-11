// src/command_processor.js
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultCommandsFilePath = path.join(__dirname, "commands.json");

export class CommandProcessor {
  constructor(commandsFilePath = defaultCommandsFilePath) {
    this.commandsFilePath = commandsFilePath;
    this.commandsData = {};
  }

  async loadCommands() {
    try {
      const data = await fs.readFile(this.commandsFilePath, "utf-8");
      this.commandsData = JSON.parse(data);
      console.log(
        chalk.blue(
          `Successfully loaded commands from ${this.commandsFilePath}.`
        )
      );
      return true;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️ Could not load commands from ${this.commandsFilePath}: ${error.message}`
        )
      );
      console.warn(
        chalk.yellow(
          "Commands feature will be significantly limited or disabled."
        )
      );
      this.commandsData = {}; // Ensure it's an empty object if loading fails
      return false;
    }
  }

  displayHelp() {
    console.log(chalk.bold.underline("\nAvailable commands:"));
    if (Object.keys(this.commandsData).length === 0) {
      console.log(chalk.gray("No commands loaded or defined."));
      return;
    }
    for (const cmdName in this.commandsData) {
      const cmd = this.commandsData[cmdName];
      console.log(
        `${chalk.cyanBright(`/${cmdName}`)}: ${
          cmd.description || "No description."
        }`
      );
    }
    console.log(
      chalk.gray(
        "\nTip: Use commands like /plan-feature 'your feature idea here'"
      )
    );
  }

  processInput(userInput) {
    if (!userInput.startsWith("/")) {
      return { type: "no_command", content: userInput };
    }

    const firstSpaceIndex = userInput.indexOf(" ");
    const commandNameWithSlash =
      firstSpaceIndex === -1
        ? userInput
        : userInput.substring(0, firstSpaceIndex);
    const commandName = commandNameWithSlash.substring(1);
    const rawArgs =
      firstSpaceIndex === -1 ? "" : userInput.substring(firstSpaceIndex + 1);

    const commandDef = this.commandsData[commandName];

    if (!commandDef) {
      console.log(chalk.yellow(`Unknown command: ${commandNameWithSlash}`));
      return { type: "unknown_command", content: userInput, commandName };
    }

    console.log(chalk.magenta(`Processing command: /${commandName}`));

    if (commandDef.type === "client_side_handler") {
      if (commandName === "help") {
        this.displayHelp();
        return { type: "client_handled", commandName: "help" };
      }
      // Potentially handle other client-side commands here
      console.log(
        chalk.yellow(`Unknown client-side command handler for /${commandName}`)
      );
      // Treat as if unknown or let LLM try to interpret
      return { type: "unknown_command", content: userInput, commandName };
    }

    if (commandDef.prompt_template) {
      let effectiveInput = commandDef.prompt_template;
      if (commandDef.arg_placeholder && rawArgs.trim() !== "") {
        effectiveInput = effectiveInput.replace(
          commandDef.arg_placeholder,
          rawArgs.trim()
        );
      } else if (commandDef.arg_placeholder && rawArgs.trim() === "") {
        // If placeholder exists but no args given, maybe inform user or use a default
        // For now, we'll pass the template as is, which might prompt the LLM to ask for args
        console.log(
          chalk.yellow(
            `Command /${commandName} expects arguments but none were provided. The LLM might ask for them.`
          )
        );
      } else if (!commandDef.arg_placeholder && rawArgs.trim() !== "") {
        console.log(
          chalk.yellow(
            `Command /${commandName} does not expect arguments, but some were provided: '${rawArgs.trim()}'. They will be ignored for prompt templating.`
          )
        );
        // Args are ignored for templating if no placeholder, but LLM might see the original user input if we decide to pass it.
        // For now, just the template.
      }

      console.log(
        chalk.gray(
          `Formatted prompt for LLM: "${effectiveInput.substring(0, 100)}..."`
        )
      );
      return { type: "llm_prompt", content: effectiveInput, commandName };
    }

    console.log(
      chalk.yellow(
        `Command /${commandName} is defined but has no prompt_template or recognized client_side_handler.`
      )
    );
    // Treat as if unknown or let LLM try to interpret the original input
    return { type: "unknown_command", content: userInput, commandName };
  }
}
