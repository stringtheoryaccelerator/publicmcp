import { test } from "node:test";
import assert from "node:assert/strict";
import { currentHourIndex, forecastDaysNeeded } from "./common.js";

// Open-Meteo hourly times (UTC, no "Z" suffix), starting at midnight of the current day.
const TIMES = Array.from({ length: 48 }, (_, h) => {
    const d = new Date(Date.UTC(2026, 10, 4, h));
    return d.toISOString().slice(0, 16);
});

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
    // 16:00 UTC + 12h runs into tomorrow, so two days are needed
    assert.equal(forecastDaysNeeded(12, new Date("2026-11-04T16:13:00Z")), 2);
    assert.equal(forecastDaysNeeded(12, new Date("2026-11-04T02:00:00Z")), 1);
    // max request (168h) late in the day still fits within the 8-day cap
    assert.equal(forecastDaysNeeded(168, new Date("2026-11-04T23:00:00Z")), 8);
});
