import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NOAA_TIDES_URL, NOAA_STATIONS_URL, fetchJson, haversineNm, MARINE_DISCLAIMER } from "./common.js";
import { resolveLocation } from "./locations.js";

function yyyymmdd(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function registerTidePredictionsTool(server: McpServer) {
    server.registerTool(
        "get_tide_predictions",
        {
            title: "Get Tide Predictions",
            description:
                "Gets high/low tide predictions from NOAA CO-OPS for a US tide station. Provide a NOAA station ID, a coordinate, or a place name like 'Portland, ME' - the nearest tide prediction station is found automatically. No API key required.",
            inputSchema: {
                stationId: z
                    .string()
                    .optional()
                    .describe("NOAA CO-OPS station ID (e.g. 8418150 for Portland, ME)"),
                location: z
                    .string()
                    .optional()
                    .describe(
                        "Place name to look up instead of a station ID or coordinates, e.g. 'Portland, ME'. The nearest tide station to the best geocoder match is used.",
                    ),
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .optional()
                    .describe("Latitude, used to find the nearest tide station if no stationId is given"),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .optional()
                    .describe("Longitude, used to find the nearest tide station if no stationId is given"),
                days: z
                    .number()
                    .int()
                    .min(1)
                    .max(7)
                    .optional()
                    .describe("Number of days of predictions starting today (default 2)"),
            },
            outputSchema: {
                resolvedLocation: z
                    .string()
                    .nullable()
                    .describe("The geocoded place used to find the station, when a location name was given"),
                stationId: z.string(),
                stationName: z.string(),
                distanceNm: z.number().nullable().describe("Distance from the requested coordinate, if one was given"),
                datum: z.string(),
                predictions: z.array(
                    z.object({
                        time: z.string().describe("Local time at the station"),
                        type: z.string().describe("H for high tide, L for low tide"),
                        heightFt: z.number(),
                    }),
                ),
                disclaimer: z.string(),
            },
        },
        async (args) => {
            const { stationId } = args;
            const days = args.days ?? 2;

            try {
                let { latitude, longitude } = args;
                let resolvedLocation: string | null = null;

                if (!stationId && (latitude == null || longitude == null)) {
                    if (!args.location) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "Provide a NOAA stationId, both latitude and longitude, or a 'location' place name like 'Portland, ME'.",
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

                let resolvedId = stationId ?? "";
                let stationName = "";
                let distanceNm: number | null = null;

                if (!resolvedId) {
                    const stationList = await fetchJson(`${NOAA_STATIONS_URL}?type=tidepredictions`);
                    const stations: any[] = stationList.stations ?? [];
                    if (stations.length === 0) {
                        throw new Error("NOAA station list is unavailable");
                    }
                    let best: any = null;
                    let bestDist = Infinity;
                    for (const s of stations) {
                        if (s.lat == null || s.lng == null) continue;
                        const d = haversineNm(latitude!, longitude!, s.lat, s.lng);
                        if (d < bestDist) {
                            bestDist = d;
                            best = s;
                        }
                    }
                    if (!best) {
                        throw new Error("Could not find a nearby NOAA tide station");
                    }
                    resolvedId = best.id;
                    stationName = best.name ?? "";
                    distanceNm = Math.round(bestDist * 10) / 10;
                }

                const url =
                    `${NOAA_TIDES_URL}?product=predictions&application=publicmcp` +
                    `&begin_date=${yyyymmdd(new Date())}&range=${days * 24}` +
                    `&datum=MLLW&station=${resolvedId}&time_zone=lst_ldt&units=english` +
                    `&interval=hilo&format=json`;
                const data = await fetchJson(url);

                if (data.error) {
                    throw new Error(data.error.message ?? "NOAA returned an error for this station");
                }

                const predictions = (data.predictions ?? []).map((p: any) => ({
                    time: p.t,
                    type: p.type,
                    heightFt: parseFloat(p.v),
                }));

                const output = {
                    resolvedLocation,
                    stationId: resolvedId,
                    stationName,
                    distanceNm,
                    datum: "MLLW",
                    predictions,
                    disclaimer: MARINE_DISCLAIMER,
                };

                const header =
                    `Tide predictions for station ${resolvedId}` +
                    (stationName ? ` (${stationName})` : "") +
                    (distanceNm != null
                        ? `, ${distanceNm} nm from ${resolvedLocation ?? "the requested position"}`
                        : "") +
                    ` - heights in feet above MLLW, station local time:\n`;
                const lines = predictions.map(
                    (p: any) =>
                        `${p.time}  ${p.type === "H" ? "HIGH" : "LOW "}  ${p.heightFt.toFixed(1)} ft`,
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: header + lines.join("\n") + `\n\n${MARINE_DISCLAIMER}`,
                        },
                    ],
                    structuredContent: output,
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error fetching tide predictions: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );
}
