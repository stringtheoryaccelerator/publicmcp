// Test helpers: run real tools through an in-process MCP client/server pair
// with a fake fetch, so tests exercise the SDK's input and output schema
// validation exactly as a real client would, without touching the network.
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type Register = (server: McpServer) => void;

export async function connectTools(...registers: Register[]): Promise<Client> {
    const server = new McpServer({ name: "test-server", version: "0.0.0" });
    for (const register of registers) register(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

export interface ToolResult {
    isError: boolean;
    text: string;
    structured: any;
}

/**
 * Calls a tool and fails the test if the SDK rejected the tool's own result
 * (e.g. an output schema with no structuredContent) - the bug class that hid
 * helpful messages behind "Output validation error".
 */
export async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result: any = await client.callTool({ name, arguments: args });
    const text = (result.content ?? [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
    assert.doesNotMatch(text, /Output validation error/, `${name} returned a result its own output schema rejects`);
    if (!result.isError) {
        assert.ok(result.structuredContent, `${name} succeeded without structuredContent`);
    }
    return { isError: !!result.isError, text, structured: result.structuredContent };
}

type Responder = (url: URL) => unknown | Response | Promise<unknown | Response>;

/**
 * Replaces global fetch. Each route maps a URL substring or regex to a JSON
 * body, a Response, or a function of the URL. Unmatched requests throw, so a
 * test can never silently hit the real network.
 */
export function mockFetch(routes: [string | RegExp, unknown | Responder][]) {
    const original = globalThis.fetch;
    const calls: URL[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        calls.push(url);
        for (const [pattern, response] of routes) {
            const hit = typeof pattern === "string" ? url.href.includes(pattern) : pattern.test(url.href);
            if (!hit) continue;
            const body = typeof response === "function" ? await (response as Responder)(url) : response;
            return body instanceof Response ? body : Response.json(body);
        }
        throw new Error(`Unexpected fetch in test: ${url.href}`);
    }) as typeof fetch;
    return {
        calls,
        restore: () => {
            globalThis.fetch = original;
        },
    };
}

// ---------- Fixture builders shaped like the real APIs ----------

/** Open-Meteo hourly times: UTC, no "Z", starting at midnight of today's UTC date. */
export function openMeteoTimes(days: number, now = new Date()): string[] {
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Array.from({ length: days * 24 }, (_, h) => new Date(midnight + h * 3_600_000).toISOString().slice(0, 16));
}

/** An Open-Meteo hourly response; each variable is a constant or a function of the hour's Date. */
export function openMeteoHourly(
    vars: Record<string, number | ((time: Date) => number | null)>,
    { days = 2, latitude = 43.54, longitude = -70.12 } = {},
) {
    const time = openMeteoTimes(days);
    const hourly: Record<string, unknown[]> = { time };
    for (const [name, v] of Object.entries(vars)) {
        hourly[name] = time.map((t) => (typeof v === "function" ? v(new Date(t + "Z")) : v));
    }
    return { latitude, longitude, hourly };
}

export const CALM_MARINE = {
    wave_height: 0.6,
    wave_direction: 180,
    wave_period: 6,
    swell_wave_height: 0.4,
    swell_wave_direction: 170,
    swell_wave_period: 8,
    wind_wave_height: 0.3,
    sea_surface_temperature: 11,
    ocean_current_velocity: 0.5,
    ocean_current_direction: 90,
};

export const CALM_WEATHER = {
    wind_speed_10m: 8,
    wind_gusts_10m: 12,
    wind_direction_10m: 200,
    visibility: 20000,
    precipitation: 0,
};

export function nwsZone(id: string, name: string, type = "coastal") {
    const url = `https://api.weather.gov/zones/forecast/${id}`;
    return { id: url, type: "Feature", properties: { "@id": url, id, name, type } };
}

export const ANZ152 = nwsZone("ANZ152", "Coastal Waters from Port Clyde, ME to Cape Elizabeth, ME out 25 NM");

export const NWS_ZONE_FORECAST = {
    properties: {
        zone: "https://api.weather.gov/zones/forecast/ANZ152",
        updated: "2026-11-04T09:00:00-05:00",
        periods: [
            { number: 1, name: "Today", detailedForecast: "SW winds 10 to 15 kt. Seas 2 to 3 ft." },
            { number: 2, name: "Tonight", detailedForecast: "SW winds 10 to 15 kt. Seas 2 to 3 ft." },
        ],
    },
};

export function geocodeResult(name: string, latitude: number, longitude: number, admin1 = "Maine") {
    return { name, latitude, longitude, admin1, admin2: "", country: "United States", country_code: "US" };
}
