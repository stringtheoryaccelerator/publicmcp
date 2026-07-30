import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NWS_API_URL, fetchJson, MARINE_DISCLAIMER } from "./common.js";

export function registerCoastalForecastTool(server: McpServer) {
    server.registerTool(
        "get_coastal_marine_forecast",
        {
            title: "Get Coastal Marine Forecast (NWS)",
            description:
                "Gets the official National Weather Service marine zone text forecast and any active marine alerts (small craft advisories, gale warnings, etc.) for a coordinate in US coastal or offshore waters. No API key required.",
            inputSchema: {
                latitude: z.number().min(-90).max(90).describe("Latitude in US waters"),
                longitude: z.number().min(-180).max(180).describe("Longitude in US waters"),
            },
            outputSchema: {
                zoneId: z.string(),
                zoneName: z.string(),
                periods: z.array(
                    z.object({
                        name: z.string(),
                        forecast: z.string(),
                    }),
                ),
                alerts: z.array(
                    z.object({
                        event: z.string(),
                        severity: z.string(),
                        headline: z.string(),
                        expires: z.string(),
                    }),
                ),
                disclaimer: z.string(),
            },
        },
        async (args) => {
            const { latitude, longitude } = args;

            try {
                const zones = await fetchJson(
                    `${NWS_API_URL}/zones?type=marine&point=${latitude},${longitude}`,
                );
                const features: any[] = zones.features ?? [];
                if (features.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No NWS marine zone covers ${latitude}, ${longitude}. NWS zone forecasts only cover US coastal, offshore, and high seas waters - for other locations use get_marine_forecast.`,
                            },
                        ],
                    };
                }

                // Prefer the coastal zone (most detailed for near-shore boating),
                // otherwise take the first zone returned.
                const zone =
                    features.find((f) => f.properties?.type === "coastal") ?? features[0];
                const zoneId: string = zone.properties.id;
                const zoneName: string = zone.properties.name;
                const zoneUrl: string = zone.properties["@id"] ?? zone.id;

                const [forecast, alertsData] = await Promise.all([
                    fetchJson(`${zoneUrl}/forecast`),
                    fetchJson(`${NWS_API_URL}/alerts/active/zone/${zoneId}`).catch(() => null),
                ]);

                const periods = (forecast.properties?.periods ?? []).map((p: any) => ({
                    name: p.name ?? "",
                    forecast: p.detailedForecast ?? "",
                }));

                const alerts = (alertsData?.features ?? []).map((a: any) => ({
                    event: a.properties?.event ?? "",
                    severity: a.properties?.severity ?? "",
                    headline: a.properties?.headline ?? "",
                    expires: a.properties?.expires ?? "",
                }));

                const output = { zoneId, zoneName, periods, alerts, disclaimer: MARINE_DISCLAIMER };

                const alertText = alerts.length
                    ? `ACTIVE ALERTS:\n${alerts
                          .map((a: any) => `⚠ ${a.event} (${a.severity}): ${a.headline}`)
                          .join("\n")}\n\n`
                    : "No active marine alerts for this zone.\n\n";

                const forecastText = periods
                    .map((p: any) => `${p.name}: ${p.forecast}`)
                    .join("\n\n");

                return {
                    content: [
                        {
                            type: "text",
                            text:
                                `NWS Marine Forecast - ${zoneName} (${zoneId}):\n\n` +
                                alertText +
                                forecastText +
                                `\n\n${MARINE_DISCLAIMER}`,
                        },
                    ],
                    structuredContent: output,
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error fetching NWS coastal forecast: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );
}
