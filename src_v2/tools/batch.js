// src/tools/batch.js
export const execute = async (params, projectPath, executeSingleToolFn) => {
  const { calls } = params;
  if (!Array.isArray(calls) || calls.length === 0) {
    return {
      status: "error",
      output:
        'Batch tool error: "calls" parameter must be a non-empty array of tool calls.',
    };
  }

  const results = [];
  const promises = calls.map(async (call) => {
    if (!call.name || !call.parameters) {
      return {
        tool_name: call.name || "UnknownTool",
        parameters: call.parameters || {},
        status: "error",
        output: "Malformed sub-tool call in Batch: missing name or parameters.",
      };
    }
    // This executeSingleToolFn is the core dispatcher function from ToolExecutor
    const result = await executeSingleToolFn(call.name, call.parameters);
    return {
      // Ensure the format matches the tool_response structure
      tool_name: call.name,
      parameters: call.parameters,
      status: result.status,
      output: result.output,
    };
  });

  try {
    const settledResults = await Promise.allSettled(promises);
    settledResults.forEach((settledResult) => {
      if (settledResult.status === "fulfilled") {
        results.push(settledResult.value);
      } else {
        // This case should ideally not happen if executeSingleToolFn handles its errors
        results.push({
          // Attempt to get some info if possible
          tool_name: "BatchSubCallError",
          parameters: {},
          status: "error",
          output: `Batch sub-call failed unexpectedly: ${
            settledResult.reason.message || settledResult.reason
          }`,
        });
      }
    });
    return { status: "success", output: results };
  } catch (error) {
    // Should not be reached if using Promise.allSettled and promises handle their errors
    return {
      status: "error",
      output: `Batch execution failed: ${error.message}`,
    };
  }
};
