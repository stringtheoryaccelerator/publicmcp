import { z } from "zod";
import puppeteer from "puppeteer";

const FIRE_DANGER_URL = "https://mainefireweather.org/station.php";

export const fireDangerTool = {
    definition: {
        name: "check_fire_danger",
        description: "Checks the current fire danger rating for a specific town in Maine to see if burning is allowed.",
        inputSchema: {
            type: "object",
            properties: {
                town: {
                    type: "string",
                    description: "The name of the town to check fire danger for.",
                },
            },
            required: ["town"],
        },
    },
    handler: async (args: any) => {
        const { town } = z.object({ town: z.string() }).parse(args);

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

            return {
                content: [
                    {
                        type: "text",
                        text: `Fire Weather Data for ${station.station_name} (Zone ${station.zoneid}):\n` +
                            `Burning Index: ${fd.bi}\n` +
                            `Fire Moisture (1-hr): ${fd.fm1}\n` +
                            `Fire Moisture (10-hr): ${fd.fm10}\n` +
                            `Fire Moisture (100-hr): ${fd.fm100}\n` +
                            `Weather: ${weather.dry_temp}°F, RH ${weather.rh}%, Wind ${weather.wind_sp} mph\n` +
                            `\nNote: Please verify the official Class Day (Low/Moderate/High) on the main map at ${FIRE_DANGER_URL} before burning.`,
                    },
                ],
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
    },
};
