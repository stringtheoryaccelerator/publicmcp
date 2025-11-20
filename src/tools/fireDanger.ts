import { z } from "zod";
import puppeteer from "puppeteer";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const FIRE_DANGER_URL = "https://mainefireweather.org/station.php";

export function registerFireDangerTool(server: McpServer) {
    server.registerTool(
        "check_fire_danger",
        {
            title: "Check Fire Danger",
            description: "Checks the current fire danger rating for a specific town in Maine to see if burning is allowed.",
            inputSchema: {
                town: z.string().describe("The name of the town to check fire danger for"),
            },
            outputSchema: {
                stationName: z.string(),
                zoneId: z.string(),
                burningIndex: z.string(),
                fireMoisture1hr: z.string(),
                fireMoisture10hr: z.string(),
                fireMoisture100hr: z.string(),
                temperature: z.string(),
                humidity: z.string(),
                windSpeed: z.string(),
                note: z.string(),
            },
        },
        async (args) => {
            const { town } = args;

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
            const page = await browser.newPage();
            await page.goto(FIRE_DANGER_URL, { waitUntil: "networkidle0" });

            // Extract the STA object from the page script
            const staData = await page.evaluate(() => {
                // @ts-ignore
                return typeof STA !== 'undefined' ? STA : null;
            });

            if (!staData || !staData.stations) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Could not retrieve station data from Maine Fire Weather website.",
                        },
                    ],
                    isError: true,
                };
            }

            // Find station by name (case-insensitive partial match)
            const stations = Object.values(staData.stations) as any[];
            const station = stations.find((s: any) =>
                s.station_name.toLowerCase().includes(town.toLowerCase())
            );

            if (!station) {
                const availableStations = stations.map((s: any) => s.station_name).join(", ");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Could not find a weather station matching "${town}". Available stations: ${availableStations}. Please try one of these locations.`,
                        },
                    ],
                };
            }

            // Navigate to specific station page
            const stationUrl = `${FIRE_DANGER_URL}?station=${station.source_id}`;
            await page.goto(stationUrl, { waitUntil: "networkidle0" });

            const currentStationData = await page.evaluate(() => {
                // @ts-ignore
                return typeof STA !== 'undefined' ? STA.currentStation : null;
            });

            if (!currentStationData || !currentStationData.firedanger) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Could not retrieve fire danger data for ${station.station_name}.`,
                        },
                    ],
                    isError: true,
                };
            }

            const fd = currentStationData.firedanger;
            const weather = currentStationData.weather;

            const output = {
                stationName: station.station_name,
                zoneId: station.zoneid.toString(),
                burningIndex: fd.bi.toString(),
                fireMoisture1hr: fd.fm1.toString(),
                fireMoisture10hr: fd.fm10.toString(),
                fireMoisture100hr: fd.fm100.toString(),
                temperature: `${weather.dry_temp}°F`,
                humidity: `${weather.rh}%`,
                windSpeed: `${weather.wind_sp} mph`,
                note: `Please verify the official Class Day (Low/Moderate/High) on the main map at ${FIRE_DANGER_URL} before burning.`,
            };

            return {
                content: [
                    {
                        type: "text",
                        text: `Fire Weather Data for ${output.stationName} (Zone ${output.zoneId}):\n` +
                            `Burning Index: ${output.burningIndex}\n` +
                            `Fire Moisture (1-hr): ${output.fireMoisture1hr}\n` +
                            `Fire Moisture (10-hr): ${output.fireMoisture10hr}\n` +
                            `Fire Moisture (100-hr): ${output.fireMoisture100hr}\n` +
                            `Weather: ${output.temperature}, RH ${output.humidity}, Wind ${output.windSpeed}\n` +
                            `\nNote: ${output.note}`,
                    },
                ],
                structuredContent: output,
            };

        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error checking fire danger: ${error.message}`,
                    },
                ],
                isError: true,
            };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    });
}
