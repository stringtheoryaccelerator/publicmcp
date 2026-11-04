import { test } from "node:test";
import assert from "node:assert/strict";
import { findStation } from "./fireStation.js";

const STATIONS = [
    { station_name: "Augusta", source_id: "1", zoneid: 5 },
    { station_name: "East Millinocket", source_id: "2", zoneid: 3 },
    { station_name: "Rachael Carson", source_id: "3", zoneid: 10 },
    { station_name: "Lyman", source_id: "4", zoneid: 9 },
];

test("matches a station name case-insensitively", () => {
    assert.equal(findStation(STATIONS, "augusta")?.source_id, "1");
    assert.equal(findStation(STATIONS, "LYMAN")?.source_id, "4");
});

test("matches a partial name", () => {
    assert.equal(findStation(STATIONS, "Millinocket")?.source_id, "2");
    assert.equal(findStation(STATIONS, "Rachael")?.source_id, "3");
});

test("ignores surrounding whitespace", () => {
    assert.equal(findStation(STATIONS, "  Augusta ")?.source_id, "1");
});

test("returns undefined for a town without a station", () => {
    assert.equal(findStation(STATIONS, "Scarborough"), undefined);
});

test("an empty query matches nothing rather than the first station", () => {
    assert.equal(findStation(STATIONS, "   "), undefined);
});
