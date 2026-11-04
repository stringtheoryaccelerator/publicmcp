// Live checks against the real public APIs. Run with `npm run test:live`.
// These catch upstream changes (moved endpoints, renamed fields) that fixture tests can't.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { callTool, connectTools } from "../test/harness.js";
import { registerMarineForecastTool } from "../tools/marine/marineForecast.js";
import { registerCoastalForecastTool } from "../tools/marine/coastalForecast.js";
import { registerTidePredictionsTool } from "../tools/marine/tides.js";
import { registerRoutePlannerTool } from "../tools/marine/routePlanner.js";
import { registerSearchLocationTool } from "../tools/marine/locations.js";

let client: Client;
before(async () => {
    client = await connectTools(
        registerMarineForecastTool,
        registerCoastalForecastTool,
        registerTidePredictionsTool,
        registerRoutePlannerTool,
        registerSearchLocationTool,
    );
});
after(() => client.close());

describe("marine tools (live)", { timeout: 60_000 }, () => {
    test("Open-Meteo marine forecast off Portland, ME", async () => {
        const r = await callTool(client, "get_marine_forecast", { latitude: 43.55, longitude: -70.15, hours: 6 });
        assert.equal(r.isError, false, r.text);
        assert.equal(r.structured.hourly.length, 6);
        assert.equal(typeof r.structured.hourly[0].waveHeightM, "number");
        assert.equal(typeof r.structured.hourly[0].windSpeedKn, "number");
    });

    test("NWS coastal forecast for a point on the water", async () => {
        const r = await callTool(client, "get_coastal_marine_forecast", { latitude: 43.55, longitude: -70.15 });
        assert.equal(r.isError, false, r.text);
        assert.match(r.structured.zoneId, /^ANZ\d{3}$/);
        assert.ok(r.structured.periods.length > 0);
    });

    test("NWS coastal forecast for a harbor town uses the nearest zone", async () => {
        const r = await callTool(client, "get_coastal_marine_forecast", { location: "Boothbay Harbor, ME" });
        assert.equal(r.isError, false, r.text);
        assert.ok(r.structured.zoneDistanceNm > 0 && r.structured.zoneDistanceNm <= 10);
    });

    test("NOAA tides for Portland by station ID", async () => {
        const r = await callTool(client, "get_tide_predictions", { stationId: "8418150", days: 1 });
        assert.equal(r.isError, false, r.text);
        assert.equal(r.structured.stationName, "Portland");
        assert.ok(r.structured.predictions.length >= 3);
    });

    test("NOAA tides by coordinates finds a nearby station", async () => {
        const r = await callTool(client, "get_tide_predictions", { latitude: 43.55, longitude: -70.3, days: 1 });
        assert.equal(r.isError, false, r.text);
        assert.ok(r.structured.distanceNm < 10);
    });

    test("route plan Portland to Boothbay", async () => {
        const r = await callTool(client, "plan_marine_route", {
            waypoints: [
                { latitude: 43.65, longitude: -70.22, name: "Portland" },
                { location: "Boothbay Harbor, ME" },
            ],
            speedKnots: 8,
        });
        assert.equal(r.isError, false, r.text);
        assert.ok(r.structured.samples.every((s: any) => s.windSpeedKn != null), "every sample has wind");
    });

    test("geocoder resolves a Maine town", async () => {
        const r = await callTool(client, "search_location", { query: "Scarborough, ME" });
        assert.match(r.text, /Scarborough, Maine/);
    });
});
