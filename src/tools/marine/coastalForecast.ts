import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NWS_API_URL, fetchJson, NWS_MARINE_DISCLAIMER, degreesToCompass } from "./common.js";
import { findNearestMarineZone, type ZoneFeature } from "./nearestZone.js";
import { resolveLocation } from "./locations.js";

// Beyond this, a place is inland rather than a harbor whose center sits on land.
const MAX_ZONE_SEARCH_NM = 25;

export function registerCoastalForecastTool(server: McpServer) {
    server.registerTool(
        "get_coastal_marine_forecast",
        {
            title: "Get Coastal Marine Forecast (NWS)",
            description:
                "Gets the official National Weather Service marine zone text forecast and any active marine alerts (small craft advisories, gale warnings, etc.) for a coordinate in US coastal or offshore waters. Points on land (such as a harbor town's center) use the nearest marine zone within 25 nm. Accepts either latitude/longitude or a place name like 'Portland, ME' (best geocoder match is used). No API key required.",
            inputSchema: {
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .optional()
                    .describe("Latitude in US waters (or use 'location' instead)"),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .optional()
                    .describe("Longitude in US waters (or use 'location' instead)"),
                location: z
                    .string()
                    .optional()
                    .describe(
                        "US coastal place name to look up instead of coordinates, e.g. 'Portland, ME'. The best geocoder match is used.",
                    ),
            },
            outputSchema: {
                resolvedLocation: z
                    .string()
                    .nullable()
                    .describe("The geocoded place the forecast is for, when a location name was given"),
                zoneId: z.string(),
                zoneName: z.string(),
                zoneDistanceNm: z
                    .number()
                    .describe("Distance from the requested point to the marine zone used; 0 when the point is inside it"),
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
            try {
                let { latitude, longitude } = args;
                let resolvedLocation: string | null = null;
                if (latitude == null || longitude == null) {
                    if (!args.location) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "Provide either latitude and longitude, or a 'location' place name like 'Portland, ME'.",
                                },
                            ],
                            isError: true,
                        };
                    }
                    const match = await resolveLocation(args.location);
                    latitude = match.latitude;
                    longitude = match.longitude;
                    resolvedLocation = match.label;
                }

                const lookupZones = async (lat: number, lon: number): Promise<ZoneFeature[]> =>
                    (await fetchJson(`${NWS_API_URL}/zones?type=marine&point=${lat.toFixed(4)},${lon.toFixed(4)}`))
                        .features ?? [];
                const nearest = await findNearestMarineZone(latitude, longitude, lookupZones, {
                    maxRadiusNm: MAX_ZONE_SEARCH_NM,
                });
                if (!nearest) {
                    const where = resolvedLocation
                        ? `${resolvedLocation} (${latitude}, ${longitude})`
                        : `${latitude}, ${longitude}`;
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No NWS marine zone within ${MAX_ZONE_SEARCH_NM} nm of ${where}. NWS zone forecasts only cover US coastal, offshore, and high seas waters - for other locations use get_marine_forecast.`,
                            },
                        ],
                        isError: true,
                    };
                }

                const zone = nearest.zone;
                const zoneId: string = zone.properties.id;
                const zoneName: string = zone.properties.name;
                const zoneUrl: string = zone.properties["@id"] ?? zone.id ?? `${NWS_API_URL}/zones/forecast/${zoneId}`;
                const zoneDistanceNm = nearest.distanceNm;

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

                const output = {
                    resolvedLocation,
                    zoneId,
                    zoneName,
                    zoneDistanceNm,
                    periods,
                    alerts,
                    disclaimer: NWS_MARINE_DISCLAIMER,
                };

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
                                `NWS Marine Forecast - ${zoneName} (${zoneId})` +
                                (resolvedLocation ? ` near ${resolvedLocation}` : "") +
                                `:\n` +
                                (zoneDistanceNm > 0
                                    ? `(${resolvedLocation ?? "The requested point"} is on land; this is the nearest marine zone, ${zoneDistanceNm.toFixed(1)} nm ${degreesToCompass(nearest.bearingTrue)}.)\n`
                                    : "") +
                                `\n` +
                                alertText +
                                forecastText +
                                `\n\n${NWS_MARINE_DISCLAIMER}`,
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
