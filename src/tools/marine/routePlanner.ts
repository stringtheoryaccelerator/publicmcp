import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
    OPEN_METEO_MARINE_URL,
    OPEN_METEO_FORECAST_URL,
    fetchJson,
    haversineNm,
    initialBearing,
    intermediatePoint,
    degreesToCompass,
    metersToFeet,
    windWarning,
    waveWarning,
    asLocationArray,
    nearestHourIndex,
    MARINE_DISCLAIMER,
} from "./common.js";
import { resolveLocation } from "./locations.js";

// Total forecast sample points along the route (waypoints + intermediate
// points), kept small so the whole plan needs only two API requests.
const MAX_SAMPLES = 16;

// Open-Meteo's marine model provides at most 8 days of forecast.
const MAX_FORECAST_DAYS = 8;

const waypointSchema = z.object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    location: z
        .string()
        .optional()
        .describe(
            "Place name to geocode instead of coordinates, e.g. 'Portland, ME'. The best geocoder match is used.",
        ),
    name: z.string().optional().describe("Optional label, e.g. a harbor name"),
});

export function registerRoutePlannerTool(server: McpServer) {
    server.registerTool(
        "plan_marine_route",
        {
            title: "Plan Marine Route Weather",
            description:
                "Plans the weather along a marine route. Given ordered waypoints, a departure time, and a boat speed, it computes great-circle legs, estimates the time of arrival at points along the route, and fetches the forecast (waves, swell, wind) expected at each point at the time the vessel is there. Flags hazardous conditions such as gale-force winds or rough seas. Waypoints may be given as latitude/longitude or as place names like 'Portland, ME' (best geocoder match is used). Uses free public forecast models; no API key required.",
            inputSchema: {
                waypoints: z
                    .array(waypointSchema)
                    .min(2)
                    .describe(
                        "Ordered route waypoints, starting with the departure point. Each waypoint needs either latitude+longitude or a 'location' place name.",
                    ),
                departureTime: z
                    .string()
                    .optional()
                    .describe("Departure time as an ISO 8601 timestamp (default: now)"),
                speedKnots: z
                    .number()
                    .min(0.5)
                    .max(60)
                    .optional()
                    .describe("Average boat speed in knots (default 5)"),
            },
            outputSchema: {
                totalDistanceNm: z.number(),
                estimatedDurationHours: z.number(),
                departureTime: z.string(),
                estimatedArrivalTime: z.string(),
                legs: z.array(
                    z.object({
                        from: z.string(),
                        to: z.string(),
                        distanceNm: z.number(),
                        bearingTrue: z.number(),
                    }),
                ),
                samples: z.array(
                    z.object({
                        latitude: z.number(),
                        longitude: z.number(),
                        label: z.string(),
                        distanceFromStartNm: z.number(),
                        eta: z.string(),
                        forecastTime: z.string().nullable(),
                        waveHeightM: z.number().nullable(),
                        waveDirection: z.string().nullable(),
                        wavePeriodS: z.number().nullable(),
                        swellHeightM: z.number().nullable(),
                        windSpeedKn: z.number().nullable(),
                        windGustsKn: z.number().nullable(),
                        windDirection: z.string().nullable(),
                        warnings: z.array(z.string()),
                    }),
                ),
                maxWaveHeightM: z.number().nullable(),
                maxWindSpeedKn: z.number().nullable(),
                warnings: z.array(z.string()),
                disclaimer: z.string(),
            },
        },
        async (args) => {
            const speedKnots = args.speedKnots ?? 5;
            const departure = args.departureTime ? new Date(args.departureTime) : new Date();

            try {
                if (isNaN(departure.getTime())) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Invalid departureTime "${args.departureTime}". Use an ISO 8601 timestamp like 2026-08-01T10:00:00Z.`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Resolve any name-only waypoints to coordinates via geocoding.
                const waypoints: { latitude: number; longitude: number; name?: string }[] = [];
                for (let i = 0; i < args.waypoints.length; i++) {
                    const wp = args.waypoints[i];
                    if (wp.latitude != null && wp.longitude != null) {
                        waypoints.push({ latitude: wp.latitude, longitude: wp.longitude, name: wp.name });
                    } else if (wp.location) {
                        const match = await resolveLocation(wp.location);
                        waypoints.push({
                            latitude: match.latitude,
                            longitude: match.longitude,
                            name: wp.name ?? match.label,
                        });
                    } else {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Waypoint ${i + 1} needs either latitude and longitude, or a 'location' place name like 'Portland, ME'.`,
                                },
                            ],
                            isError: true,
                        };
                    }
                }

                const label = (wp: { name?: string; latitude: number; longitude: number }, i: number) =>
                    wp.name ?? `WP${i + 1} (${wp.latitude.toFixed(3)}, ${wp.longitude.toFixed(3)})`;

                // Legs between consecutive waypoints.
                const legs = [];
                let totalDistanceNm = 0;
                for (let i = 0; i < waypoints.length - 1; i++) {
                    const a = waypoints[i];
                    const b = waypoints[i + 1];
                    const distanceNm = haversineNm(a.latitude, a.longitude, b.latitude, b.longitude);
                    totalDistanceNm += distanceNm;
                    legs.push({
                        from: label(a, i),
                        to: label(b, i + 1),
                        distanceNm: Math.round(distanceNm * 10) / 10,
                        bearingTrue: Math.round(initialBearing(a.latitude, a.longitude, b.latitude, b.longitude)),
                    });
                }

                const durationHours = totalDistanceNm / speedKnots;
                const arrival = new Date(departure.getTime() + durationHours * 3600_000);

                // Sample points: all waypoints plus intermediate points on long
                // legs, distributed by distance so no more than MAX_SAMPLES
                // forecast lookups are needed.
                const samplePoints: {
                    latitude: number;
                    longitude: number;
                    label: string;
                    distanceFromStartNm: number;
                }[] = [];
                const extraBudget = Math.max(0, MAX_SAMPLES - waypoints.length);
                const spacingNm = extraBudget > 0 ? totalDistanceNm / (extraBudget + 1) : Infinity;

                let cumulative = 0;
                for (let i = 0; i < waypoints.length - 1; i++) {
                    const a = waypoints[i];
                    const b = waypoints[i + 1];
                    const legDist = haversineNm(a.latitude, a.longitude, b.latitude, b.longitude);
                    samplePoints.push({
                        latitude: a.latitude,
                        longitude: a.longitude,
                        label: label(a, i),
                        distanceFromStartNm: cumulative,
                    });
                    const intermediateCount = Math.min(
                        Math.floor(legDist / spacingNm),
                        extraBudget,
                    );
                    for (let k = 1; k <= intermediateCount; k++) {
                        const fraction = k / (intermediateCount + 1);
                        const p = intermediatePoint(
                            a.latitude, a.longitude, b.latitude, b.longitude, fraction,
                        );
                        samplePoints.push({
                            latitude: Math.round(p.latitude * 1000) / 1000,
                            longitude: Math.round(p.longitude * 1000) / 1000,
                            label: `en route ${label(a, i)} -> ${label(b, i + 1)}`,
                            distanceFromStartNm: cumulative + legDist * fraction,
                        });
                    }
                    cumulative += legDist;
                }
                const last = waypoints[waypoints.length - 1];
                samplePoints.push({
                    latitude: last.latitude,
                    longitude: last.longitude,
                    label: label(last, waypoints.length - 1),
                    distanceFromStartNm: cumulative,
                });

                // Forecast horizon check.
                const routeWarnings = new Set<string>();
                const hoursUntilArrival =
                    (arrival.getTime() - Date.now()) / 3600_000;
                const forecastDays = Math.min(
                    MAX_FORECAST_DAYS,
                    Math.max(1, Math.ceil(hoursUntilArrival / 24) + 1),
                );
                if (hoursUntilArrival > MAX_FORECAST_DAYS * 24) {
                    routeWarnings.add(
                        `Parts of the route are beyond the ${MAX_FORECAST_DAYS}-day forecast horizon; conditions for later legs use the last available forecast hour and are unreliable.`,
                    );
                }

                // Two batched requests cover every sample point.
                const lats = samplePoints.map((p) => p.latitude).join(",");
                const lons = samplePoints.map((p) => p.longitude).join(",");
                const marineUrl =
                    `${OPEN_METEO_MARINE_URL}?latitude=${lats}&longitude=${lons}` +
                    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height` +
                    `&forecast_days=${forecastDays}&timezone=UTC&cell_selection=sea`;
                const weatherUrl =
                    `${OPEN_METEO_FORECAST_URL}?latitude=${lats}&longitude=${lons}` +
                    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
                    `&forecast_days=${forecastDays}&timezone=UTC&wind_speed_unit=kn`;

                const [marineRaw, weatherRaw] = await Promise.all([
                    fetchJson(marineUrl),
                    fetchJson(weatherUrl),
                ]);
                const marineByPoint = asLocationArray(marineRaw);
                const weatherByPoint = asLocationArray(weatherRaw);

                let maxWave: number | null = null;
                let maxWind: number | null = null;

                const samples = samplePoints.map((p, i) => {
                    const eta = new Date(
                        departure.getTime() + (p.distanceFromStartNm / speedKnots) * 3600_000,
                    );
                    const marine = marineByPoint[i]?.hourly;
                    const weather = weatherByPoint[i]?.hourly;
                    const warnings: string[] = [];

                    let forecastTime: string | null = null;
                    let waveHeightM: number | null = null;
                    let waveDirection: string | null = null;
                    let wavePeriodS: number | null = null;
                    let swellHeightM: number | null = null;
                    let windSpeedKn: number | null = null;
                    let windGustsKn: number | null = null;
                    let windDirection: string | null = null;

                    if (marine?.time?.length) {
                        const idx = nearestHourIndex(marine.time, eta);
                        forecastTime = marine.time[idx] + "Z";
                        waveHeightM = marine.wave_height?.[idx] ?? null;
                        waveDirection =
                            marine.wave_direction?.[idx] != null
                                ? degreesToCompass(marine.wave_direction[idx])
                                : null;
                        wavePeriodS = marine.wave_period?.[idx] ?? null;
                        swellHeightM = marine.swell_wave_height?.[idx] ?? null;
                    }
                    if (weather?.time?.length) {
                        const idx = nearestHourIndex(weather.time, eta);
                        windSpeedKn = weather.wind_speed_10m?.[idx] ?? null;
                        windGustsKn = weather.wind_gusts_10m?.[idx] ?? null;
                        windDirection =
                            weather.wind_direction_10m?.[idx] != null
                                ? degreesToCompass(weather.wind_direction_10m[idx])
                                : null;
                    }

                    if (windSpeedKn != null) {
                        const w = windWarning(windSpeedKn);
                        if (w) warnings.push(w);
                        if (maxWind == null || windSpeedKn > maxWind) maxWind = windSpeedKn;
                    }
                    if (waveHeightM != null) {
                        const w = waveWarning(waveHeightM);
                        if (w) warnings.push(w);
                        if (maxWave == null || waveHeightM > maxWave) maxWave = waveHeightM;
                    }
                    if (waveHeightM == null && windSpeedKn == null) {
                        warnings.push("No forecast data at this point (may be on land or outside model coverage)");
                    }
                    warnings.forEach((w) => routeWarnings.add(w));

                    return {
                        latitude: p.latitude,
                        longitude: p.longitude,
                        label: p.label,
                        distanceFromStartNm: Math.round(p.distanceFromStartNm * 10) / 10,
                        eta: eta.toISOString(),
                        forecastTime,
                        waveHeightM,
                        waveDirection,
                        wavePeriodS,
                        swellHeightM,
                        windSpeedKn,
                        windGustsKn,
                        windDirection,
                        warnings,
                    };
                });

                const output = {
                    totalDistanceNm: Math.round(totalDistanceNm * 10) / 10,
                    estimatedDurationHours: Math.round(durationHours * 10) / 10,
                    departureTime: departure.toISOString(),
                    estimatedArrivalTime: arrival.toISOString(),
                    legs,
                    samples,
                    maxWaveHeightM: maxWave,
                    maxWindSpeedKn: maxWind,
                    warnings: [...routeWarnings],
                    disclaimer: MARINE_DISCLAIMER,
                };

                const legLines = legs.map(
                    (l) => `  ${l.from} -> ${l.to}: ${l.distanceNm} nm, ${l.bearingTrue}°T`,
                );
                const sampleLines = samples.map((s) => {
                    const wave =
                        s.waveHeightM != null
                            ? `waves ${s.waveHeightM.toFixed(1)}m/${metersToFeet(s.waveHeightM).toFixed(0)}ft ${s.waveDirection ?? ""}`
                            : "waves n/a";
                    const wind =
                        s.windSpeedKn != null
                            ? `wind ${Math.round(s.windSpeedKn)}kn ${s.windDirection ?? ""} (g${s.windGustsKn != null ? Math.round(s.windGustsKn) : "?"})`
                            : "wind n/a";
                    return `  ${s.eta.slice(0, 16)}Z  ${s.label} @ ${s.distanceFromStartNm}nm: ${wave}, ${wind}${s.warnings.length ? "  ⚠ " + s.warnings.join("; ") : ""}`;
                });

                const text =
                    `Marine route plan (${speedKnots} kn):\n` +
                    `Total distance: ${output.totalDistanceNm} nm, est. ${output.estimatedDurationHours} h\n` +
                    `Departure: ${output.departureTime}  ->  Arrival: ${output.estimatedArrivalTime}\n\n` +
                    `Legs:\n${legLines.join("\n")}\n\n` +
                    `Conditions expected along the route (at vessel ETA):\n${sampleLines.join("\n")}\n\n` +
                    `Max en route: waves ${maxWave != null ? `${(maxWave as number).toFixed(1)}m (${metersToFeet(maxWave).toFixed(0)}ft)` : "n/a"}, ` +
                    `wind ${maxWind != null ? `${Math.round(maxWind)}kn` : "n/a"}\n` +
                    (routeWarnings.size
                        ? `Warnings: ${[...routeWarnings].join("; ")}\n`
                        : "No warning-level conditions forecast along the route.\n") +
                    `\n${MARINE_DISCLAIMER}`;

                return {
                    content: [{ type: "text", text }],
                    structuredContent: output,
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error planning marine route: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );
}
