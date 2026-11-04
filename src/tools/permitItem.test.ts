import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseBurnItem } from "./permitItem.js";

// Options as served by www13.maine.gov/burnpermit on 2026-11-04 (values were renumbered from 22 to 28-30).
const LIVE_OPTIONS = [
    { value: "", text: "Select" },
    { value: "28", text: "Brush/Lumber (pile less than 10' X 10')" },
    { value: "29", text: "Brush/Lumber (pile less than 20' X 20')" },
    { value: "30", text: "Brush/Lumber (multiple piles no larger than 20' X 20' - maximum 3 piles)" },
];

test("defaults to the small single pile", () => {
    assert.equal(chooseBurnItem(LIVE_OPTIONS), "28");
});

test("selects each pile size by its label", () => {
    assert.equal(chooseBurnItem(LIVE_OPTIONS, "small"), "28");
    assert.equal(chooseBurnItem(LIVE_OPTIONS, "large"), "29");
    assert.equal(chooseBurnItem(LIVE_OPTIONS, "multiple"), "30");
});

test("survives the site renumbering options again", () => {
    const renumbered = LIVE_OPTIONS.map((o, i) => ({ ...o, value: o.value ? String(100 + i) : "" }));
    assert.equal(chooseBurnItem(renumbered, "large"), "102");
});

test("falls back to the first real option when no label matches", () => {
    const other = [
        { value: "", text: "Select" },
        { value: "41", text: "Agricultural field" },
    ];
    assert.equal(chooseBurnItem(other, "small"), "41");
});

test("throws a clear error when there are no options", () => {
    assert.throws(() => chooseBurnItem([{ value: "", text: "Select" }]), /No burn item options/);
});
