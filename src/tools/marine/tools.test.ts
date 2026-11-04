import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
    ANZ152,
    CALM_MARINE,
    CALM_WEATHER,
    NWS_ZONE_FORECAST,
    callTool,
    connectTools,
    geocodeResult,
    mockFetch,
    nwsZone,
    openMeteoHourly,
} from "../../test/harness.js";
import { registerMarineForecastTool } from "./marineForecast.js";
import { registerCoastalForecastTool } from "./coastalForecast.js";
import { registerTidePredictionsTool } from "./tides.js";
import { registerRoutePlannerTool } from "./routePlanner.js";
import { registerSearchLocationTool } from "./locations.js";

let client: Client;
let fetchMock: ReturnType<typeof mockFetch> | undefined;

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
afterEach(() => fetchMock?.restore());

const useFetch = (routes: Parameters<typeof mockFetch>[0]) => {
    fetchMock = mockFetch(routes);
    return fetchMock;
};

const MARINE_API = "marine-api.open-meteo.com";
const WEATHER_API = "api.open-meteo.com/v1/forecast";
const GEOCODE_API = "geocoding-api.open-meteo.com";
const currentHour = () => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);

describe("get_marine_forecast", () => {
    test("starts at the current hour and returns the requested number of hours", async () => {
        useFetch([
            [MARINE_API, openMeteoHourly(CALM_MARINE)],
            [WEATHER_API, openMeteoHourly(CALM_WEATHER)],
        ]);
        const r = await callTool(client, "get_marine_forecast", { latitude: 43.55, longitude: -70.15, hours: 12 });
        assert.equal(r.isError, false);
        assert.equal(r.structured.hourly.length, 12);
        assert.equal(new Date(r.structured.hourly[0].time + "Z").getTime(), currentHour().getTime());
        assert.deepEqual(r.structured.warnings, []);
        assert.match(r.text, /No warning-level conditions/);
    });

    test("converts units and directions", async () => {
        useFetch([
            [MARINE_API, openMeteoHourly(CALM_MARINE)],
            [WEATHER_API, openMeteoHourly(CALM_WEATHER)],
        ]);
        const r = await callTool(client, "get_marine_forecast", { latitude: 43.55, longitude: -70.15, hours: 1 });
        const h = r.structured.hourly[0];
        assert.equal(h.waveDirection, "S");
        assert.equal(h.windDirection, "SSW");
        assert.equal(h.currentDirection, "E");
        assert.equal(h.currentSpeedKn, 0.27); // 0.5 km/h
    });

    test("flags gale-force wind and rough seas", async () => {
        useFetch([
            [MARINE_API, openMeteoHourly({ ...CALM_MARINE, wave_height: 3 })],
            [WEATHER_API, openMeteoHourly({ ...CALM_WEATHER, wind_speed_10m: 38 })],
        ]);
        const r = await callTool(client, "get_marine_forecast", { latitude: 43.55, longitude: -70.15, hours: 6 });
        assert.equal(r.structured.maxWindSpeedKn, 38);
        assert.ok(r.structured.warnings.some((w: string) => /Gale/.test(w)));
        assert.ok(r.structured.warnings.some((w: string) => /Rough seas/.test(w)));
    });

    test("requests enough days to cover the hours from now", async () => {
        const mock = useFetch([
            [MARINE_API, openMeteoHourly(CALM_MARINE, { days: 8 })],
            [WEATHER_API, openMeteoHourly(CALM_WEATHER, { days: 8 })],
        ]);
        const r = await callTool(client, "get_marine_forecast", { latitude: 43.55, longitude: -70.15, hours: 168 });
        assert.equal(r.structured.hourly.length, 168);
        const days = Number(mock.calls[0].searchParams.get("forecast_days"));
        assert.ok(days * 24 >= new Date().getUTCHours() + 168, `forecast_days=${days} too short`);
    });

    test("a point with no marine data is an error, not a schema failure", async () => {
        useFetch([
            [MARINE_API, { latitude: 44.3, longitude: -69.8, hourly: { time: [] } }],
            [WEATHER_API, openMeteoHourly(CALM_WEATHER)],
        ]);
        const r = await callTool(client, "get_marine_forecast", { latitude: 44.3, longitude: -69.8 });
        assert.equal(r.isError, true);
        assert.match(r.text, /No marine forecast data/);
    });

    test("upstream HTTP errors become tool errors", async () => {
        useFetch([[/open-meteo/, new Response("rate limited", { status: 429, statusText: "Too Many Requests" })]]);
        const r = await callTool(client, "get_marine_forecast", { latitude: 43.55, longitude: -70.15 });
        assert.equal(r.isError, true);
        assert.match(r.text, /429/);
    });

    test("accepts a place name instead of coordinates", async () => {
        const mock = useFetch([
            [GEOCODE_API, { results: [geocodeResult("Portland", 43.6591, -70.2568)] }],
            [MARINE_API, openMeteoHourly(CALM_MARINE)],
            [WEATHER_API, openMeteoHourly(CALM_WEATHER)],
        ]);
        const r = await callTool(client, "get_marine_forecast", { location: "Portland, ME", hours: 3 });
        assert.equal(r.isError, false);
        assert.match(r.text, /Portland, Maine/);
        const marineCall = mock.calls.find((c) => c.host === MARINE_API)!;
        assert.equal(marineCall.searchParams.get("latitude"), "43.6591");
    });
});

describe("get_coastal_marine_forecast", () => {
    // Fake ocean: the Gulf of Maine south of this shoreline (lat 42-43.8, lon -71 to -66)
    const shoreLat = 43.8;
    const zonesBySide = (url: URL) => {
        const [lat, lon] = url.searchParams.get("point")!.split(",").map(Number);
        const water = lat > 42 && lat < shoreLat && lon > -71 && lon < -66;
        return { type: "FeatureCollection", features: water ? [ANZ152] : [] };
    };
    const NWS_ROUTES: Parameters<typeof mockFetch>[0] = [
        ["/zones?type=marine", zonesBySide],
        ["/zones/forecast/ANZ152/forecast", NWS_ZONE_FORECAST],
        ["/alerts/active/zone/ANZ152", { features: [] }],
    ];

    test("returns the zone forecast for a point on the water", async () => {
        useFetch(NWS_ROUTES);
        const r = await callTool(client, "get_coastal_marine_forecast", { latitude: 43.55, longitude: -70.15 });
        assert.equal(r.isError, false);
        assert.equal(r.structured.zoneId, "ANZ152");
        assert.equal(r.structured.zoneDistanceNm, 0);
        assert.equal(r.structured.periods.length, 2);
        assert.match(r.text, /No active marine alerts/);
        assert.doesNotMatch(r.text, /on land/);
        assert.match(r.structured.disclaimer, /National Weather Service/);
    });

    test("uses the nearest zone when a town center is on land", async () => {
        useFetch([[GEOCODE_API, { results: [geocodeResult("Boothbay Harbor", shoreLat + 2 / 60, -69.63)] }], ...NWS_ROUTES]);
        const r = await callTool(client, "get_coastal_marine_forecast", { location: "Boothbay Harbor, ME" });
        assert.equal(r.isError, false);
        assert.equal(r.structured.zoneId, "ANZ152");
        assert.ok(r.structured.zoneDistanceNm > 0 && r.structured.zoneDistanceNm <= 5);
        assert.match(r.text, /Boothbay Harbor, Maine, United States is on land; this is the nearest marine zone, \d+\.\d nm S/);
    });

    test("a place far inland is still an error", async () => {
        useFetch([[GEOCODE_API, { results: [geocodeResult("Denver", 39.74, -104.98, "Colorado")] }], ...NWS_ROUTES]);
        const r = await callTool(client, "get_coastal_marine_forecast", { location: "Denver, CO" });
        assert.equal(r.isError, true);
        assert.match(r.text, /No NWS marine zone within 25 nm of Denver/);
    });

    test("includes active alerts", async () => {
        useFetch([
            ["/zones?type=marine", { features: [ANZ152] }],
            ["/zones/forecast/ANZ152/forecast", NWS_ZONE_FORECAST],
            [
                "/alerts/active/zone/ANZ152",
                {
                    features: [
                        {
                            properties: {
                                event: "Small Craft Advisory",
                                severity: "Minor",
                                headline: "Small Craft Advisory until 6 PM",
                                expires: "2026-11-04T18:00:00-05:00",
                            },
                        },
                    ],
                },
            ],
        ]);
        const r = await callTool(client, "get_coastal_marine_forecast", { latitude: 43.55, longitude: -70.15 });
        assert.equal(r.structured.alerts.length, 1);
        assert.match(r.text, /ACTIVE ALERTS:\n⚠ Small Craft Advisory \(Minor\)/);
    });

    test("an alerts outage doesn't fail the forecast", async () => {
        useFetch([
            ["/zones?type=marine", { features: [ANZ152] }],
            ["/zones/forecast/ANZ152/forecast", NWS_ZONE_FORECAST],
            ["/alerts/active/zone/ANZ152", new Response("down", { status: 503 })],
        ]);
        const r = await callTool(client, "get_coastal_marine_forecast", { latitude: 43.55, longitude: -70.15 });
        assert.equal(r.isError, false);
        assert.deepEqual(r.structured.alerts, []);
    });

    test("prefers the coastal zone when offshore zones also cover the point", async () => {
        useFetch([
            ["/zones?type=marine", { features: [nwsZone("ANZ800", "Gulf of Maine", "offshore"), ANZ152] }],
            ["/zones/forecast/ANZ152/forecast", NWS_ZONE_FORECAST],
            ["/alerts/active/zone/ANZ152", { features: [] }],
        ]);
        const r = await callTool(client, "get_coastal_marine_forecast", { latitude: 43.55, longitude: -70.15 });
        assert.equal(r.structured.zoneId, "ANZ152");
    });

    test("requires coordinates or a location", async () => {
        useFetch([]);
        const r = await callTool(client, "get_coastal_marine_forecast", {});
        assert.equal(r.isError, true);
        assert.match(r.text, /Provide either latitude and longitude, or a 'location'/);
    });
});

describe("get_tide_predictions", () => {
    const PREDICTIONS = {
        predictions: [
            { t: "2026-11-04 00:28", v: "0.327", type: "L" },
            { t: "2026-11-04 06:49", v: "9.244", type: "H" },
        ],
    };

    test("by station ID, includes the station's name", async () => {
        useFetch([
            ["stations/8418150.json", { stations: [{ id: "8418150", name: "Portland" }] }],
            ["datagetter", PREDICTIONS],
        ]);
        const r = await callTool(client, "get_tide_predictions", { stationId: "8418150", days: 1 });
        assert.equal(r.isError, false);
        assert.equal(r.structured.stationName, "Portland");
        assert.equal(r.structured.distanceNm, null);
        assert.deepEqual(r.structured.predictions[1], { time: "2026-11-04 06:49", type: "H", heightFt: 9.244 });
        assert.match(r.text, /station 8418150 \(Portland\)/);
    });

    test("by station ID, still works if the name lookup fails", async () => {
        useFetch([
            ["stations/8418150.json", new Response("nope", { status: 500 })],
            ["datagetter", PREDICTIONS],
        ]);
        const r = await callTool(client, "get_tide_predictions", { stationId: "8418150", days: 1 });
        assert.equal(r.isError, false);
        assert.equal(r.structured.stationName, "");
    });

    test("by coordinates, picks the nearest station", async () => {
        const mock = useFetch([
            [
                "stations.json?type=tidepredictions",
                {
                    stations: [
                        { id: "8418150", name: "Portland", lat: 43.6567, lng: -70.2467 },
                        { id: "8418445", name: "Pine Point, Scarborough River", lat: 43.5433, lng: -70.3267 },
                        { id: "8413320", name: "Bar Harbor", lat: 44.3917, lng: -68.205 },
                    ],
                },
            ],
            ["datagetter", PREDICTIONS],
        ]);
        const r = await callTool(client, "get_tide_predictions", { latitude: 43.55, longitude: -70.3, days: 1 });
        assert.equal(r.structured.stationId, "8418445");
        assert.ok(r.structured.distanceNm < 2);
        assert.equal(mock.calls.at(-1)!.searchParams.get("station"), "8418445");
    });

    test("NOAA errors become tool errors", async () => {
        useFetch([
            ["stations/0000000.json", { stations: [] }],
            ["datagetter", { error: { message: "No Predictions data was found." } }],
        ]);
        const r = await callTool(client, "get_tide_predictions", { stationId: "0000000" });
        assert.equal(r.isError, true);
        assert.match(r.text, /No Predictions data/);
    });

    test("requires a station, coordinates, or a location", async () => {
        useFetch([]);
        const r = await callTool(client, "get_tide_predictions", {});
        assert.equal(r.isError, true);
    });
});

describe("plan_marine_route", () => {
    // Multi-location Open-Meteo responses are arrays, one entry per requested point.
    const perPoint = (vars: Record<string, number | ((t: Date) => number | null)>) => (url: URL) =>
        url.searchParams.get("latitude")!.split(",").map(() => openMeteoHourly(vars, { days: 3 }));

    const ROUTE = [
        { latitude: 43.65, longitude: -70.22, name: "Portland" },
        { latitude: 43.45, longitude: -69.9, name: "Seguin" },
        { latitude: 43.85, longitude: -69.63, name: "Boothbay" },
    ];

    test("computes legs, ETAs, and conditions at each point's ETA", async () => {
        const departure = new Date(currentHour().getTime() + 2 * 3_600_000);
        // Wind equals the hour of day, so each sample's wind reveals which hour was used
        useFetch([
            [MARINE_API, perPoint(CALM_MARINE)],
            [WEATHER_API, perPoint({ ...CALM_WEATHER, wind_speed_10m: (t) => t.getUTCHours() })],
        ]);
        const r = await callTool(client, "plan_marine_route", {
            waypoints: ROUTE,
            speedKnots: 8,
            departureTime: departure.toISOString(),
        });
        assert.equal(r.isError, false);
        const s = r.structured;
        assert.deepEqual(s.legs.map((l: any) => [l.from, l.to]), [["Portland", "Seguin"], ["Seguin", "Boothbay"]]);
        assert.ok(Math.abs(s.totalDistanceNm - 45.1) < 0.2, `distance ${s.totalDistanceNm}`);
        assert.equal(s.departureTime, departure.toISOString());
        for (const sample of s.samples) {
            const expectedEta = departure.getTime() + (sample.distanceFromStartNm / 8) * 3_600_000;
            assert.ok(Math.abs(new Date(sample.eta).getTime() - expectedEta) < 60_000 * 1, `eta for ${sample.label}`);
            const hourUsed = new Date(sample.forecastTime);
            assert.ok(Math.abs(hourUsed.getTime() - new Date(sample.eta).getTime()) <= 30 * 60_000, "forecast hour nearest ETA");
            assert.equal(sample.windSpeedKn, hourUsed.getUTCHours());
        }
    });

    test("flags hazards along the route", async () => {
        useFetch([
            [MARINE_API, perPoint(CALM_MARINE)],
            [WEATHER_API, perPoint({ ...CALM_WEATHER, wind_speed_10m: 36 })],
        ]);
        const r = await callTool(client, "plan_marine_route", { waypoints: ROUTE, speedKnots: 8 });
        assert.ok(r.structured.warnings.some((w: string) => /Gale/.test(w)));
    });

    test("warns when the trip extends past the forecast horizon", async () => {
        useFetch([
            [MARINE_API, perPoint(CALM_MARINE)],
            [WEATHER_API, perPoint(CALM_WEATHER)],
        ]);
        const far = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString();
        const r = await callTool(client, "plan_marine_route", { waypoints: ROUTE, departureTime: far });
        assert.ok(r.structured.warnings.some((w: string) => /forecast horizon/.test(w)));
    });

    test("rejects an invalid departure time", async () => {
        useFetch([]);
        const r = await callTool(client, "plan_marine_route", { waypoints: ROUTE, departureTime: "next tuesday" });
        assert.equal(r.isError, true);
        assert.match(r.text, /Invalid departureTime/);
    });

    test("needs coordinates or a location for every waypoint", async () => {
        useFetch([]);
        const r = await callTool(client, "plan_marine_route", { waypoints: [ROUTE[0], { name: "Somewhere" }] });
        assert.equal(r.isError, true);
        assert.match(r.text, /Waypoint 2 needs/);
    });
});

describe("search_location", () => {
    test("lists matches, filtered by a state qualifier", async () => {
        useFetch([
            [
                GEOCODE_API,
                {
                    results: [
                        geocodeResult("Portland", 45.52, -122.68, "Oregon"),
                        geocodeResult("Portland", 43.6591, -70.2568, "Maine"),
                    ],
                },
            ],
        ]);
        const r = await callTool(client, "search_location", { query: "Portland, ME" });
        assert.equal(r.isError, false);
        assert.match(r.text, /Best guess: Portland, Maine, United States \(43\.6591, -70\.2568\)/);
        assert.doesNotMatch(r.text, /Oregon/);
    });

    test("no matches is reported cleanly", async () => {
        useFetch([[GEOCODE_API, {}]]);
        const r = await callTool(client, "search_location", { query: "zzqxv" });
        assert.match(r.text, /No locations found matching "zzqxv"/);
    });
});
