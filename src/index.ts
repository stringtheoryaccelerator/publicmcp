import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fireDangerTool } from "./tools/fireDanger.js";
import { applyPermitTool } from "./tools/applyPermit.js";

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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Maine Burn Permit MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
