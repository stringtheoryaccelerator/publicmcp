import { test } from "node:test";
import assert from "node:assert/strict";
import { findNearestMarineZone, type ZoneFeature } from "./nearestZone.js";
import { haversineNm } from "./common.js";

const zone = (id: string, type = "coastal"): ZoneFeature => ({
    id: `https://api.weather.gov/zones/forecast/${id}`,
    properties: { id, name: `Zone ${id}`, type, "@id": `https://api.weather.gov/zones/forecast/${id}` },
});

// Fake lookup: water is everything south of `shoreLat`.
const coastSouthOf = (shoreLat: number, features = [zone("ANZ152")]) => {
    const calls: { latitude: number; longitude: number }[] = [];
    const lookup = async (latitude: number, longitude: number) => {
        calls.push({ latitude, longitude });
        return latitude < shoreLat ? features : [];
    };
    return { lookup, calls };
};

test("returns the zone at the point itself with zero distance, in one lookup", async () => {
    const { lookup, calls } = coastSouthOf(44);
    const result = await findNearestMarineZone(43.5, -70, lookup);
    assert.equal(result?.zone.properties.id, "ANZ152");
    assert.equal(result?.distanceNm, 0);
    assert.equal(calls.length, 1);
});

test("finds a zone a few miles offshore from an inland town center", async () => {
    // Town 4 nm north of the shoreline
    const shoreLat = 43.8;
    const town = { lat: shoreLat + 4 / 60, lon: -69.63 };
    const { lookup } = coastSouthOf(shoreLat);
    const result = await findNearestMarineZone(town.lat, town.lon, lookup);
    assert.ok(result, "expected a zone");
    assert.equal(result.zone.properties.id, "ANZ152");
    assert.ok(result.distanceNm > 4 && result.distanceNm <= 10, `distance ${result.distanceNm}`);
    // Reported position is the probe that hit, and its distance is accurate
    const d = haversineNm(town.lat, town.lon, result.latitude, result.longitude);
    assert.ok(Math.abs(d - result.distanceNm) < 0.01);
    // The hit is to the south
    assert.ok(result.bearingTrue > 90 && result.bearingTrue < 270, `bearing ${result.bearingTrue}`);
});

test("stops searching at the first ring with a hit", async () => {
    const { lookup, calls } = coastSouthOf(43.8);
    await findNearestMarineZone(43.8 + 1 / 60, -69.63, lookup);
    const maxProbeDistance = Math.max(...calls.map((c) => haversineNm(43.8 + 1 / 60, -69.63, c.latitude, c.longitude)));
    assert.ok(maxProbeDistance < 5, `searched out to ${maxProbeDistance} nm`);
});

test("returns null for a truly inland point beyond the search radius", async () => {
    const { lookup, calls } = coastSouthOf(43.0);
    const result = await findNearestMarineZone(44.0, -70, lookup, { maxRadiusNm: 25 });
    assert.equal(result, null);
    const furthest = Math.max(...calls.map((c) => haversineNm(44, -70, c.latitude, c.longitude)));
    assert.ok(furthest <= 25.001, `probed beyond the cap: ${furthest}`);
});

test("prefers a coastal zone over offshore zones at the same point", async () => {
    const lookup = async () => [zone("ANZ800", "offshore"), zone("ANZ152", "coastal")];
    const result = await findNearestMarineZone(43.5, -70, lookup);
    assert.equal(result?.zone.properties.id, "ANZ152");
});

test("ignores lookup failures for individual probes", async () => {
    const shoreLat = 43.8;
    const start = { lat: shoreLat + 2 / 60, lon: -69.63 };
    const lookup = async (latitude: number, longitude: number) => {
        if (latitude === start.lat && longitude === start.lon) return []; // on land
        if (latitude >= shoreLat) throw new Error("boom"); // flaky probe on land
        return [zone("ANZ152")];
    };
    const result = await findNearestMarineZone(start.lat, start.lon, lookup);
    assert.equal(result?.zone.properties.id, "ANZ152");
});

test("propagates a failure of the initial point lookup", async () => {
    const lookup = async () => {
        throw new Error("NWS down");
    };
    await assert.rejects(findNearestMarineZone(43.5, -70, lookup), /NWS down/);
});
