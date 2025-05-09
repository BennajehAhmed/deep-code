// src/tools/webFetch.js
import fetch from "node-fetch";

export const execute = async (params) => {
  const { url } = params;
  if (!url) {
    return {
      status: "error",
      output: 'WebFetch tool error: "url" parameter is required.',
    };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        status: "error",
        output: `WebFetch error: Failed to fetch ${url}. Status: ${response.status} ${response.statusText}`,
      };
    }
    const textContent = await response.text();
    return { status: "success", output: textContent };
  } catch (error) {
    return { status: "error", output: `WebFetch error: ${error.message}` };
  }
};
