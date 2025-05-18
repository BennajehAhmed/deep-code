import chalk from "chalk";
import fetch from "node-fetch";
import { config } from "dotenv";

config();

const apiToken = process.env.CHUTES_API_KEY;

export const sendMessage = async (messages, model) => {
  if (!apiToken) {
    console.error(
      chalk.redBright(
        "🚨 Chutes API token not found. Set CHUTES_API_KEY environment variable."
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

export const extractToolCalls = (responseText) => {
  const toolCalls = [];
  const planRegex = /<plan>([\s\S]*?)<\/plan>/;
  let plan = null;
  const planMatch = responseText.match(planRegex);
  if (planMatch) {
    plan = planMatch[1].trim();
    responseText = responseText.replace(planRegex, "");
  }
  const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match;
  while ((match = regex.exec(responseText)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const parsed = JSON.parse(jsonContent);
      if (!parsed.name || !parsed.parameters) {
        console.warn(
          chalk.yellow(
            "⚠️ Found malformed tool call (missing name or parameters):"
          ),
          jsonContent
        );
        toolCalls.push({
          error: "Malformed tool call: missing name or parameters.",
          raw_content: jsonContent,
        });
      } else {
        toolCalls.push(parsed);
      }
    } catch (error) {
      console.warn(
        chalk.yellow("⚠️ Found invalid JSON in tool_call:"),
        match[1].trim(),
        error.message
      );
      toolCalls.push({
        error: `Invalid JSON in tool_call: ${error.message}`,
        raw_content: match[1].trim(),
      });
    }
  }
  const textOnlyResponse = responseText.replace(regex, "").trim();
  return { toolCalls, plan, textOnlyResponse };
};
