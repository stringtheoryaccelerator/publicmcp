import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerFireDangerTool } from "./tools/fireDanger.js";
import { registerApplyPermitTool } from "./tools/applyPermit.js";
import { registerMarineForecastTool } from "./tools/marine/marineForecast.js";
import { registerCoastalForecastTool } from "./tools/marine/coastalForecast.js";
import { registerTidePredictionsTool } from "./tools/marine/tides.js";
import { registerRoutePlannerTool } from "./tools/marine/routePlanner.js";
import { registerSearchLocationTool } from "./tools/marine/locations.js";
import express from "express";

const server = new McpServer({
    name: "maine-burn-permit-server",
    version: "1.0.0",
});

// Register tools using the modern pattern
registerFireDangerTool(server);
registerApplyPermitTool(server);
registerMarineForecastTool(server);
registerCoastalForecastTool(server);
registerTidePredictionsTool(server);
registerRoutePlannerTool(server);
registerSearchLocationTool(server);

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
