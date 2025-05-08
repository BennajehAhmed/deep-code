import chalk from "chalk";
import fetch from "node-fetch";
import { config } from "dotenv";

config();

const apiToken = process.env.CHUTES_API_KEY;

export const sendMessage = async (messages, model) => {
  /* (Keep as before) */
  if (!apiToken) {
    console.error(
      chalk.redBright(
        "🚨 Chutes API token not found. Set CHUTES_API_KEY environment variable or use -k flag."
      )
    );
    return {
      role: "assistant",
      content: chalk.red(
        "⚠️ Configuration Error: Missing CHUTES_API_KEY. Cannot contact LLM."
      ),
      error: true,
    };
  }
  console.log(chalk.gray(`\n🧠 Thinking with ${chalk.bold(model)}...`));
  try {
    const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
        temperature: 0.5,
      }),
    });
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = {
          error: { message: `HTTP ${response.status} ${response.statusText}` },
        };
      }
      const errorMessage =
        errorData?.error?.message ||
        errorData?.error ||
        `HTTP ${response.status} ${response.statusText}`;
      throw new Error(`API Error: ${errorMessage}`);
    }
    const data = await response.json();
    if (
      !data.choices ||
      data.choices.length === 0 ||
      !data.choices[0].message
    ) {
      console.error(
        chalk.redBright("🚨 Invalid LLM response structure:"),
        data
      );
      return {
        role: "assistant",
        content: chalk.red(
          "⚠️ LLM Communication Error: Received invalid response structure."
        ),
        error: true,
      };
    }
    return data.choices[0].message;
  } catch (error) {
    console.error(
      chalk.redBright("🚨 Error sending message to LLM:"),
      error.message
    );
    return {
      role: "assistant",
      content: chalk.red(`⚠️ LLM Communication Error: ${error.message}`),
      error: true,
    };
  }
};
