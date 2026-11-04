import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSamplePoints } from "./routePlanner.js";
import { haversineNm } from "./common.js";

const PORTLAND = { latitude: 43.65, longitude: -70.22, name: "Portland" };
const SEGUIN = { latitude: 43.45, longitude: -69.9, name: "Seguin" };
const BOOTHBAY = { latitude: 43.85, longitude: -69.63, name: "Boothbay" };

test("includes every waypoint, in order, with its name", () => {
    const pts = buildSamplePoints([PORTLAND, SEGUIN, BOOTHBAY], 16);
    const named = pts.filter((p) => !p.label.startsWith("en route"));
    assert.deepEqual(named.map((p) => p.label), ["Portland", "Seguin", "Boothbay"]);
    assert.equal(pts[0].distanceFromStartNm, 0);
});

test("never exceeds the sample budget", () => {
    for (const budget of [2, 3, 5, 8, 16]) {
        const pts = buildSamplePoints([PORTLAND, SEGUIN, BOOTHBAY], budget);
        assert.ok(pts.length <= Math.max(budget, 3), `budget ${budget} produced ${pts.length}`);
    }
});

test("uses the full budget on a long single leg", () => {
    const pts = buildSamplePoints([PORTLAND, { latitude: 42.36, longitude: -71.05, name: "Boston" }], 16);
    assert.equal(pts.length, 16);
});

test("distances increase monotonically and end at the total route length", () => {
    const pts = buildSamplePoints([PORTLAND, SEGUIN, BOOTHBAY], 16);
    for (let i = 1; i < pts.length; i++) {
        assert.ok(pts[i].distanceFromStartNm > pts[i - 1].distanceFromStartNm, `not increasing at ${i}`);
    }
    const total =
        haversineNm(PORTLAND.latitude, PORTLAND.longitude, SEGUIN.latitude, SEGUIN.longitude) +
        haversineNm(SEGUIN.latitude, SEGUIN.longitude, BOOTHBAY.latitude, BOOTHBAY.longitude);
    assert.ok(Math.abs(pts[pts.length - 1].distanceFromStartNm - total) < 1e-9);
});

test("intermediate points are spaced roughly evenly along the route", () => {
    const pts = buildSamplePoints([PORTLAND, SEGUIN, BOOTHBAY], 16);
    const gaps = pts.slice(1).map((p, i) => p.distanceFromStartNm - pts[i].distanceFromStartNm);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) assert.ok(g < avg * 2, `gap ${g.toFixed(1)} nm vs average ${avg.toFixed(1)} nm`);
});

test("intermediate points lie on the leg between their waypoints", () => {
    const pts = buildSamplePoints([PORTLAND, SEGUIN], 6);
    const legLength = haversineNm(PORTLAND.latitude, PORTLAND.longitude, SEGUIN.latitude, SEGUIN.longitude);
    for (const p of pts.slice(1, -1)) {
        assert.match(p.label, /^en route Portland -> Seguin$/);
        const viaPoint =
            haversineNm(PORTLAND.latitude, PORTLAND.longitude, p.latitude, p.longitude) +
            haversineNm(p.latitude, p.longitude, SEGUIN.latitude, SEGUIN.longitude);
        assert.ok(viaPoint - legLength < 0.1, `point is ${(viaPoint - legLength).toFixed(3)} nm off the leg`);
    }
});

test("unnamed waypoints get a WP label with coordinates", () => {
    const pts = buildSamplePoints([{ latitude: 43.5, longitude: -70 }, { latitude: 43.6, longitude: -70 }], 2);
    assert.deepEqual(pts.map((p) => p.label), ["WP1 (43.500, -70.000)", "WP2 (43.600, -70.000)"]);
});

test("a zero-length route still returns both endpoints", () => {
    const pts = buildSamplePoints([PORTLAND, PORTLAND], 16);
    assert.equal(pts.length, 2);
    assert.equal(pts[1].distanceFromStartNm, 0);
});
