#!/usr/bin/env node
// Calls one tool on the built MCP server over stdio, the same way a real MCP client would.
//
// Usage:
//   npm run build
//   node scripts/run-tool.mjs list
//   node scripts/run-tool.mjs <toolName> <args.json | 'inline json'>
//
// Example:
//   node scripts/run-tool.mjs apply_for_burn_permit test-data/burn-permit.local.json
//
// Note: apply_for_burn_permit submits a REAL application to the State of Maine.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [tool, argSource] = process.argv.slice(2);

if (!tool) {
    console.error("Usage: node scripts/run-tool.mjs <list | toolName> [args.json | 'inline json']");
    process.exit(1);
}

const args = !argSource
    ? {}
    : existsSync(argSource)
      ? JSON.parse(readFileSync(argSource, "utf8"))
      : JSON.parse(argSource);

const transport = new StdioClientTransport({
    command: "node",
    args: [resolve(root, "dist/index.js")],
    cwd: root,
    stderr: "ignore",
});
const client = new Client({ name: "run-tool", version: "1.0.0" });
await client.connect(transport);

let exitCode = 0;
try {
    if (tool === "list") {
        const { tools } = await client.listTools();
        for (const t of tools) console.log(t.name);
    } else {
        const started = Date.now();
        const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 180_000 });
        console.log(`--- ${tool} (${((Date.now() - started) / 1000).toFixed(1)}s) isError=${!!result.isError}`);
        for (const c of result.content ?? []) if (c.type === "text") console.log(c.text);
        if (result.isError) exitCode = 1;
    }
} catch (error) {
    console.error(`--- ${tool} failed: ${error.message}`);
    exitCode = 1;
} finally {
    await client.close();
}
process.exit(exitCode);
