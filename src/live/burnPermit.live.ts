// Live checks for the Maine fire weather and burn permit sites. Run with `npm run test:live`.
// The permit check only loads the form and inspects it: it types no personal data
// and never submits an application.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { callTool, connectTools } from "../test/harness.js";
import { registerFireDangerTool } from "../tools/fireDanger.js";
import { PERMIT_URL } from "../tools/applyPermit.js";

describe("fire danger (live)", { timeout: 90_000 }, () => {
    let client: Client;
    before(async () => {
        client = await connectTools(registerFireDangerTool);
    });
    after(() => client.close());

    test("returns fire weather for a known station", async () => {
        const r = await callTool(client, "check_fire_danger", { town: "Augusta" });
        assert.equal(r.isError, false, r.text);
        assert.equal(r.structured.stationName, "Augusta");
        assert.match(r.structured.burningIndex, /^\d+/);
    });

    test("a town without a station lists the available stations", async () => {
        const r = await callTool(client, "check_fire_danger", { town: "Scarborough" });
        assert.equal(r.isError, true);
        assert.match(r.text, /Try the nearest of: .*Augusta/);
    });
});

describe("burn permit form structure (live, read-only)", { timeout: 120_000 }, () => {
    // Every selector apply_for_burn_permit relies on, in the order it uses them.
    const APPLICANT_PAGE_FIELDS = [
        "#firstName", "#lastName", "#dob",
        "#address_address", "#address_city", "#address_state", "#address_zipCode", "#address_country",
        "#burnLocationSameAddress", "#email", "#phoneNumber",
        "#owner_0", "#commercialService_1", "#burnLocation", "#item", "#affirmation",
        "input[name='continue']",
    ];

    test("the applicant page still has every field the tool fills in", async () => {
        const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        try {
            const page = await browser.newPage();
            await page.goto(PERMIT_URL, { waitUntil: "networkidle0" });
            await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("#button")]);

            await page.click("#burnType_0");
            await page.waitForSelector("#town", { visible: true });
            const towns = await page.$$eval("#burnTown option", (os) => os.map((o) => (o as HTMLOptionElement).value));
            assert.ok(towns.includes("Scarborough"), "town list still uses town names as values");
            await page.select("#burnTown", "Scarborough");
            await page.evaluate(() => {
                // @ts-ignore jQuery on the page drives Select2
                if (window.jQuery) window.jQuery("#burnTown").trigger("change");
            });
            await page.waitForSelector("input[name='continue']", { visible: true });
            await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("input[name='continue']")]);

            const missing: string[] = [];
            for (const selector of APPLICANT_PAGE_FIELDS) {
                if (!(await page.$(selector))) missing.push(selector);
            }
            assert.deepEqual(missing, [], `fields missing from the permit form: ${missing.join(", ")}`);

            const items = await page.$$eval("#item option", (os) => os.map((o) => o.textContent?.trim() ?? ""));
            for (const label of [/less than 10'?\s*x\s*10/i, /less than 20'?\s*x\s*20/i, /multiple piles/i]) {
                assert.ok(items.some((t) => label.test(t)), `no burn item matching ${label}; options are: ${items.join(" | ")}`);
            }

            const stateValues = await page.$$eval("#address_state option", (os) => os.map((o) => (o as HTMLOptionElement).value));
            assert.ok(stateValues.includes("ME"), "state dropdown still uses postal codes");
            const countryValues = await page.$$eval("#address_country option", (os) => os.map((o) => (o as HTMLOptionElement).value));
            assert.ok(countryValues.includes("US"), "country dropdown still uses US");
        } finally {
            await browser.close();
        }
    });
});
