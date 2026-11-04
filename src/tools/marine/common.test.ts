import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    asLocationArray,
    currentHourIndex,
    degreesToCompass,
    destinationPoint,
    forecastDaysNeeded,
    haversineNm,
    initialBearing,
    intermediatePoint,
    metersToFeet,
    nearestHourIndex,
    waveWarning,
    windWarning,
} from "./common.js";

const PORTLAND = { lat: 43.6591, lon: -70.2568 };
const BOSTON = { lat: 42.3601, lon: -71.0589 };

const near = (actual: number, expected: number, tolerance: number, what = "value") =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: expected ${expected} ±${tolerance}, got ${actual}`);

describe("great-circle math", () => {
    test("haversineNm: Portland ME to Boston is about 85.6 nm (98.5 statute miles)", () => {
        near(haversineNm(PORTLAND.lat, PORTLAND.lon, BOSTON.lat, BOSTON.lon), 85.6, 0.5, "distance");
    });

    test("haversineNm: one degree of latitude is 60 nm", () => {
        near(haversineNm(43, -70, 44, -70), 60, 0.1, "distance");
    });

    test("haversineNm: zero for the same point", () => {
        assert.equal(haversineNm(43.5, -70.2, 43.5, -70.2), 0);
    });

    test("initialBearing: cardinal directions", () => {
        near(initialBearing(43, -70, 44, -70), 0, 0.01, "north");
        near(initialBearing(44, -70, 43, -70), 180, 0.01, "south");
        near(initialBearing(0, -70, 0, -69), 90, 0.01, "east");
        near(initialBearing(0, -69, 0, -70), 270, 0.01, "west");
    });

    test("initialBearing: Portland to Boston is roughly SSW", () => {
        near(initialBearing(PORTLAND.lat, PORTLAND.lon, BOSTON.lat, BOSTON.lon), 204, 2, "bearing");
    });

    test("intermediatePoint: endpoints and midpoint", () => {
        const start = intermediatePoint(43, -70, 44, -70, 0);
        near(start.latitude, 43, 1e-9, "start lat");
        const end = intermediatePoint(43, -70, 44, -70, 1);
        near(end.latitude, 44, 1e-9, "end lat");
        const mid = intermediatePoint(43, -70, 44, -70, 0.5);
        near(mid.latitude, 43.5, 1e-6, "mid lat");
        near(mid.longitude, -70, 1e-6, "mid lon");
    });

    test("intermediatePoint: identical points return the point", () => {
        assert.deepEqual(intermediatePoint(43, -70, 43, -70, 0.5), { latitude: 43, longitude: -70 });
    });

    test("destinationPoint: 60 nm due north is one degree of latitude", () => {
        const p = destinationPoint(43, -70, 0, 60);
        near(p.latitude, 44, 0.01, "lat");
        near(p.longitude, -70, 1e-9, "lon");
    });

    test("destinationPoint round-trips with haversineNm and initialBearing", () => {
        const p = destinationPoint(PORTLAND.lat, PORTLAND.lon, 135, 12);
        near(haversineNm(PORTLAND.lat, PORTLAND.lon, p.latitude, p.longitude), 12, 1e-6, "distance");
        near(initialBearing(PORTLAND.lat, PORTLAND.lon, p.latitude, p.longitude), 135, 1e-6, "bearing");
    });
});

describe("unit and direction helpers", () => {
    test("degreesToCompass: 16-point rose with wraparound", () => {
        assert.equal(degreesToCompass(0), "N");
        assert.equal(degreesToCompass(22.5), "NNE");
        assert.equal(degreesToCompass(90), "E");
        assert.equal(degreesToCompass(202), "SSW");
        assert.equal(degreesToCompass(348.75), "N");
        assert.equal(degreesToCompass(359), "N");
        assert.equal(degreesToCompass(360), "N");
    });

    test("metersToFeet", () => {
        near(metersToFeet(1), 3.28084, 1e-9, "feet");
        near(metersToFeet(2.5), 8.2, 0.01, "feet");
    });

    test("asLocationArray wraps a single location and passes arrays through", () => {
        assert.deepEqual(asLocationArray({ a: 1 }), [{ a: 1 }]);
        assert.deepEqual(asLocationArray([{ a: 1 }, { a: 2 }]), [{ a: 1 }, { a: 2 }]);
    });
});

describe("hazard thresholds (NWS-style)", () => {
    test("windWarning boundaries in knots", () => {
        assert.equal(windWarning(20.9), null);
        assert.match(windWarning(21)!, /Small craft/);
        assert.match(windWarning(33.9)!, /Small craft/);
        assert.match(windWarning(34)!, /Gale/);
        assert.match(windWarning(48)!, /Storm/);
        assert.match(windWarning(64)!, /Hurricane/);
    });

    test("waveWarning boundaries in meters", () => {
        assert.equal(waveWarning(2.49), null);
        assert.match(waveWarning(2.5)!, /Rough seas/);
        assert.match(waveWarning(4)!, /Very rough/);
        assert.match(waveWarning(6)!, /Very high/);
    });
});

// Open-Meteo hourly times (UTC, no "Z" suffix), starting at midnight of the current day.
const TIMES = Array.from({ length: 48 }, (_, h) => new Date(Date.UTC(2026, 10, 4, h)).toISOString().slice(0, 16));

describe("forecast time windows", () => {
    test("currentHourIndex starts at the hour containing now, not midnight", () => {
        assert.equal(currentHourIndex(TIMES, new Date("2026-11-04T16:13:57Z")), 16);
    });

    test("currentHourIndex returns the exact hour on the hour", () => {
        assert.equal(currentHourIndex(TIMES, new Date("2026-11-04T05:00:00Z")), 5);
    });

    test("currentHourIndex returns 0 when now is before the data starts", () => {
        assert.equal(currentHourIndex(TIMES, new Date("2026-11-03T22:30:00Z")), 0);
    });

    test("currentHourIndex returns -1 when all data is in the past", () => {
        assert.equal(currentHourIndex(TIMES, new Date("2026-11-07T00:00:00Z")), -1);
    });

    test("forecastDaysNeeded covers the requested hours from the current hour", () => {
        assert.equal(forecastDaysNeeded(12, new Date("2026-11-04T16:13:00Z")), 2);
        assert.equal(forecastDaysNeeded(12, new Date("2026-11-04T02:00:00Z")), 1);
        assert.equal(forecastDaysNeeded(168, new Date("2026-11-04T23:00:00Z")), 8);
    });

    test("nearestHourIndex picks the closest slot, rounding to the nearer hour", () => {
        assert.equal(nearestHourIndex(TIMES, new Date("2026-11-04T10:20:00Z")), 10);
        assert.equal(nearestHourIndex(TIMES, new Date("2026-11-04T10:40:00Z")), 11);
        assert.equal(nearestHourIndex(TIMES, new Date("2026-11-10T00:00:00Z")), 47);
    });
});
