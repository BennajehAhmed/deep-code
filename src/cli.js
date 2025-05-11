#!/usr/bin/env node
// src/cli.js
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import chalk from "chalk"; // Added for colored error message
import { startChat } from "./chat_loop.js";
import { config } from "dotenv";

config(); // Ensure .env is loaded early

const argv = yargs(hideBin(process.argv))
  .option("project-path", {
    alias: "p",
    type: "string",
    description: "The root directory of the project to work on.",
    default: ".",
    coerce: (p) => path.resolve(p), // Ensure it's an absolute path
  })
  .option("model", {
    alias: "m",
    type: "string",
    description: "The LLM model to use (e.g., gpt-4o, gpt-3.5-turbo).",
    default: process.env.DEFAULT_MODEL || "deepseek-ai/DeepSeek-V3-0324", // Or your preferred default
  })
  .option("brave", {
    alias: "b",
    type: "boolean",
    description: "Enable brave mode (auto-execute tools without confirmation).",
    default: false,
  })
  .help()
  .alias("help", "h")
  .version()
  .alias("version", "v").argv;

if (!process.env.CHUTES_API_KEY) {
  console.error(
    chalk.redBright(
      // chalk was missing here
      "🚨 Chutes API token not found. Set CHUTES_API_KEY environment variable or use the -k flag (if supported by sendMessage)."
    )
  );
  process.exit(1);
}

startChat(argv.projectPath, argv.model, argv.brave);
