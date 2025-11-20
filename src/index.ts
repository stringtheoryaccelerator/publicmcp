import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fireDangerTool } from "./tools/fireDanger.js";
import { applyPermitTool } from "./tools/applyPermit.js";
import express from "express";

const server = new Server(
    {
        name: "maine-burn-permit-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            fireDangerTool.definition,
            applyPermitTool.definition,
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === fireDangerTool.definition.name) {
        return fireDangerTool.handler(args);
    }
    if (name === applyPermitTool.definition.name) {
        return applyPermitTool.handler(args);
    }

    throw new Error(`Tool not found: ${name}`);
});

async function main() {
    const useHttp = process.env.USE_HTTP === "true" || process.env.PORT;

    if (useHttp) {
        // HTTP transport for Smithery and other hosted deployments
        const app = express();
        app.use(express.json());

        app.post("/mcp", async (req, res) => {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true,
            });

            res.on("close", () => transport.close());

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        });

        const port = parseInt(process.env.PORT || "3000");
        app.listen(port, () => {
            console.log(`Maine Burn Permit MCP Server running on http://localhost:${port}/mcp`);
        });
    } else {
        // STDIO transport for local development
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Maine Burn Permit MCP Server running on stdio");
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
