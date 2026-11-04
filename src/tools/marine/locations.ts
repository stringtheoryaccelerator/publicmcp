import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "./common.js";

// Open-Meteo's free geocoding API - no key required, consistent with the
// other marine data sources in this project.
export const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// So "Portland, ME" matches the geocoder's admin1 value of "Maine".
const US_STATE_ABBREVIATIONS: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
    PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam", AS: "American Samoa",
};

export interface GeoMatch {
    name: string;
    region: string;
    country: string;
    latitude: number;
    longitude: number;
    label: string;
}

function expandQualifier(qualifier: string): string {
    const upper = qualifier.trim().toUpperCase();
    return US_STATE_ABBREVIATIONS[upper] ?? qualifier.trim();
}

function toMatch(r: any): GeoMatch {
    const region = [r.admin2, r.admin1].filter(Boolean).join(", ");
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    return {
        name: r.name ?? "",
        region,
        country: r.country ?? "",
        latitude: r.latitude,
        longitude: r.longitude,
        label,
    };
}

// Geocode a free-text place query like "Portland, ME", "Portland, Maine",
// or "Boothbay Harbor". Text after a comma is treated as a state/country
// qualifier used to rank and filter the geocoder's results.
export async function geocodeQuery(query: string, count = 8): Promise<GeoMatch[]> {
    const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) {
        return [];
    }
    const name = parts[0];
    const qualifiers = parts.slice(1).map(expandQualifier);

    const url =
        `${GEOCODING_URL}?name=${encodeURIComponent(name)}` +
        `&count=20&language=en&format=json`;
    const data = await fetchJson(url);
    const results: any[] = data.results ?? [];
    if (results.length === 0) {
        return [];
    }

    let filtered = results;
    if (qualifiers.length > 0) {
        const matchesQualifiers = (r: any) =>
            qualifiers.every((q) => {
                const qLower = q.toLowerCase();
                return [r.admin1, r.admin2, r.country, r.country_code].some(
                    (field: any) =>
                        typeof field === "string" && field.toLowerCase() === qLower,
                );
            });
        const exact = results.filter(matchesQualifiers);
        // Fall back to unfiltered results rather than returning nothing when
        // the qualifier doesn't match any geocoder field.
        if (exact.length > 0) {
            filtered = exact;
        }
    }

    return filtered.slice(0, count).map(toMatch);
}

// Best-guess resolution for tools that accept a place name: the first (top
// ranked) geocoder match after qualifier filtering.
export async function resolveLocation(query: string): Promise<GeoMatch> {
    const matches = await geocodeQuery(query, 1);
    if (matches.length === 0) {
        throw new Error(
            `Could not find a location matching "${query}". Try a different spelling, add a state or country (e.g. "Portland, Maine"), or pass latitude/longitude directly.`,
        );
    }
    return matches[0];
}

export function registerSearchLocationTool(server: McpServer) {
    server.registerTool(
        "search_location",
        {
            title: "Search Location",
            description:
                "Geocodes a place name like 'Portland, ME' or 'Portland, Maine' to latitude/longitude coordinates, returning ranked candidate matches. Use the coordinates with the marine forecast, tide, and route planning tools. The marine tools also accept a 'location' string directly and will use the best (first) match automatically. No API key required.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe(
                        "Place name, optionally with a state or country after a comma, e.g. 'Portland, ME' or 'Cork, Ireland'",
                    ),
                count: z
                    .number()
                    .int()
                    .min(1)
                    .max(20)
                    .optional()
                    .describe("Maximum number of matches to return (default 8)"),
            },
            outputSchema: {
                query: z.string(),
                matches: z.array(
                    z.object({
                        name: z.string(),
                        region: z.string(),
                        country: z.string(),
                        latitude: z.number(),
                        longitude: z.number(),
                        label: z.string(),
                    }),
                ),
            },
        },
        async (args) => {
            const { query } = args;
            const count = args.count ?? 8;

            try {
                const matches = await geocodeQuery(query, count);
                if (matches.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No locations found matching "${query}". Try a different spelling or add a state/country qualifier (e.g. "Portland, Maine").`,
                            },
                        ],
                        structuredContent: { query, matches: [] },
                    };
                }

                const lines = matches.map(
                    (m, i) =>
                        `${i + 1}. ${m.label}  (${m.latitude.toFixed(4)}, ${m.longitude.toFixed(4)})`,
                );
                return {
                    content: [
                        {
                            type: "text",
                            text:
                                `Location matches for "${query}":\n` +
                                lines.join("\n") +
                                `\n\nBest guess: ${matches[0].label} (${matches[0].latitude.toFixed(4)}, ${matches[0].longitude.toFixed(4)}). ` +
                                `Marine tools accept these coordinates, or pass the place name directly via their 'location' parameter.`,
                        },
                    ],
                    structuredContent: { query, matches },
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error searching for location: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );
}
