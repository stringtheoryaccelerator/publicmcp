import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
    OPEN_METEO_MARINE_URL,
    OPEN_METEO_FORECAST_URL,
    fetchJson,
    degreesToCompass,
    metersToFeet,
    windWarning,
    waveWarning,
    MARINE_DISCLAIMER,
    currentHourIndex,
    forecastDaysNeeded,
} from "./common.js";

const MARINE_HOURLY_VARS = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "wind_wave_height",
    "sea_surface_temperature",
    "ocean_current_velocity",
    "ocean_current_direction",
].join(",");

const WEATHER_HOURLY_VARS = [
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "visibility",
    "precipitation",
].join(",");

export function registerMarineForecastTool(server: McpServer) {
    server.registerTool(
        "get_marine_forecast",
        {
            title: "Get Marine Forecast",
            description:
                "Gets an hourly marine forecast (waves, swell, wind, sea surface temperature, currents, visibility) for any ocean coordinate worldwide, using the free Open-Meteo marine and weather models. No API key required.",
            inputSchema: {
                latitude: z.number().min(-90).max(90).describe("Latitude of the position at sea"),
                longitude: z.number().min(-180).max(180).describe("Longitude of the position at sea"),
                hours: z
                    .number()
                    .int()
                    .min(1)
                    .max(168)
                    .optional()
                    .describe("Forecast length in hours (default 48, max 168)"),
            },
            outputSchema: {
                latitude: z.number(),
                longitude: z.number(),
                hourly: z.array(
                    z.object({
                        time: z.string().describe("UTC timestamp"),
                        waveHeightM: z.number().nullable(),
                        waveDirection: z.string().nullable(),
                        wavePeriodS: z.number().nullable(),
                        swellHeightM: z.number().nullable(),
                        swellDirection: z.string().nullable(),
                        swellPeriodS: z.number().nullable(),
                        windWaveHeightM: z.number().nullable(),
                        windSpeedKn: z.number().nullable(),
                        windGustsKn: z.number().nullable(),
                        windDirection: z.string().nullable(),
                        seaSurfaceTempC: z.number().nullable(),
                        currentSpeedKn: z.number().nullable(),
                        currentDirection: z.string().nullable(),
                        visibilityM: z.number().nullable(),
                        precipitationMm: z.number().nullable(),
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
            const { latitude, longitude } = args;
            const hours = args.hours ?? 48;
            const forecastDays = forecastDaysNeeded(hours);

            try {
                const marineUrl =
                    `${OPEN_METEO_MARINE_URL}?latitude=${latitude}&longitude=${longitude}` +
                    `&hourly=${MARINE_HOURLY_VARS}&forecast_days=${forecastDays}` +
                    `&timezone=UTC&cell_selection=sea`;
                const weatherUrl =
                    `${OPEN_METEO_FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
                    `&hourly=${WEATHER_HOURLY_VARS}&forecast_days=${forecastDays}` +
                    `&timezone=UTC&wind_speed_unit=kn`;

                const [marine, weather] = await Promise.all([
                    fetchJson(marineUrl),
                    fetchJson(weatherUrl),
                ]);

                const allTimes: string[] = marine.hourly?.time ?? [];
                const start = currentHourIndex(allTimes);
                const times = start >= 0 ? allTimes.slice(start, start + hours) : [];
                if (times.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No marine forecast data is available for ${latitude}, ${longitude}. The point may be on land or outside marine model coverage.`,
                            },
                        ],
                        isError: true,
                    };
                }

                const mh = marine.hourly;
                const wh = weather.hourly ?? {};
                const knPerKmh = 1 / 1.852;
                const overallWarnings = new Set<string>();
                let maxWave: number | null = null;
                let maxWind: number | null = null;

                const hourly = times.map((time: string, offset: number) => {
                    const i = start + offset;
                    const waveHeightM = mh.wave_height?.[i] ?? null;
                    const windSpeedKn = wh.wind_speed_10m?.[i] ?? null;
                    const currentKmh = mh.ocean_current_velocity?.[i] ?? null;
                    const warnings: string[] = [];

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
                    warnings.forEach((w) => overallWarnings.add(w));

                    return {
                        time,
                        waveHeightM,
                        waveDirection:
                            mh.wave_direction?.[i] != null
                                ? degreesToCompass(mh.wave_direction[i])
                                : null,
                        wavePeriodS: mh.wave_period?.[i] ?? null,
                        swellHeightM: mh.swell_wave_height?.[i] ?? null,
                        swellDirection:
                            mh.swell_wave_direction?.[i] != null
                                ? degreesToCompass(mh.swell_wave_direction[i])
                                : null,
                        swellPeriodS: mh.swell_wave_period?.[i] ?? null,
                        windWaveHeightM: mh.wind_wave_height?.[i] ?? null,
                        windSpeedKn,
                        windGustsKn: wh.wind_gusts_10m?.[i] ?? null,
                        windDirection:
                            wh.wind_direction_10m?.[i] != null
                                ? degreesToCompass(wh.wind_direction_10m[i])
                                : null,
                        seaSurfaceTempC: mh.sea_surface_temperature?.[i] ?? null,
                        currentSpeedKn:
                            currentKmh != null ? Math.round(currentKmh * knPerKmh * 100) / 100 : null,
                        currentDirection:
                            mh.ocean_current_direction?.[i] != null
                                ? degreesToCompass(mh.ocean_current_direction[i])
                                : null,
                        visibilityM: wh.visibility?.[i] ?? null,
                        precipitationMm: wh.precipitation?.[i] ?? null,
                        warnings,
                    };
                });

                const output = {
                    latitude,
                    longitude,
                    hourly,
                    maxWaveHeightM: maxWave,
                    maxWindSpeedKn: maxWind,
                    warnings: [...overallWarnings],
                    disclaimer: MARINE_DISCLAIMER,
                };

                // Text summary: every 3 hours for the first 24, then daily maxima.
                const fmt = (h: (typeof hourly)[number]) => {
                    const wave =
                        h.waveHeightM != null
                            ? `${h.waveHeightM.toFixed(1)}m/${metersToFeet(h.waveHeightM).toFixed(0)}ft ${h.waveDirection ?? ""} @${h.wavePeriodS ?? "?"}s`
                            : "n/a";
                    const wind =
                        h.windSpeedKn != null
                            ? `${Math.round(h.windSpeedKn)}kn ${h.windDirection ?? ""} (gusts ${h.windGustsKn != null ? Math.round(h.windGustsKn) : "?"}kn)`
                            : "n/a";
                    return `${h.time}Z  waves ${wave}  wind ${wind}${h.warnings.length ? "  ⚠ " + h.warnings.join("; ") : ""}`;
                };
                const lines = hourly.filter((_, i) => i % 3 === 0 && i < 24).map(fmt);

                const summary =
                    `Marine forecast for ${latitude}, ${longitude} (next ${hourly.length}h):\n` +
                    lines.join("\n") +
                    `\n\nMax over period: waves ${maxWave != null ? `${(maxWave as number).toFixed(1)}m (${metersToFeet(maxWave).toFixed(0)}ft)` : "n/a"}, ` +
                    `wind ${maxWind != null ? `${Math.round(maxWind)}kn` : "n/a"}` +
                    (overallWarnings.size
                        ? `\nWarnings: ${[...overallWarnings].join("; ")}`
                        : "\nNo warning-level conditions in this period.") +
                    `\n\n${MARINE_DISCLAIMER}`;

                return {
                    content: [{ type: "text", text: summary }],
                    structuredContent: output,
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error fetching marine forecast: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );
}
