// src/tools/index.js
import * as bashTool from "./bash.js";
import * as batchTool from "./batch.js";
import * as globTool from "./glob.js";
import * as grepTool from "./grep.js";
import * as lsTool from "./ls.js";
import * as treeTool from "./tree.js";
import * as readTool from "./read.js";
import * as writeTool from "./write.js";
import * as webFetchTool from "./webFetch.js";

export const tools = {
  Bash: bashTool.execute,
  Batch: batchTool.execute,
  Glob: globTool.execute,
  Grep: grepTool.execute,
  LS: lsTool.execute,
  Tree: treeTool.execute,
  Read: readTool.execute,
  Write: writeTool.execute,
  WebFetch: webFetchTool.execute,
};
