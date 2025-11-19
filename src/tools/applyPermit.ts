import { z } from "zod";
import puppeteer from "puppeteer";

const PERMIT_URL = "https://www13.maine.gov/burnpermit/public/index.html"; // Found via search or common knowledge, will verify. 

export const applyPermitTool = {
    definition: {
        name: "apply_for_burn_permit",
        description: "Automates the process of applying for a Maine open burn permit.",
        inputSchema: {
            type: "object",
            properties: {
                town: { type: "string", description: "Town where burning will occur" },
                address: { type: "string", description: "Physical address of the burn (and applicant's home address)" },
                city: { type: "string", description: "City of the applicant's address" },
                state: { type: "string", description: "State of the applicant's address", default: "ME" },
                zip: { type: "string", description: "Zip code" },
                dob: { type: "string", description: "Date of Birth (MM/DD/YYYY)" },
                material: {
                    type: "string",
                    description: "Material to be burned (e.g., 'Brush', 'Wood Debris', 'Agricultural')",
                    enum: ["Brush", "Wood Debris", "Agricultural", "Campfire"]
                },
                applicantName: { type: "string", description: "Full name of the applicant" },
                phone: { type: "string", description: "Phone number (e.g., 207-555-1234)" },
                email: { type: "string", description: "Email address" },
                burnLocation: { type: "string", description: "Description of burn location on property" },
            },
            required: ["town", "address", "city", "zip", "dob", "material", "applicantName", "phone", "email", "burnLocation"],
        },
    },
    handler: async (args: any) => {
        const input = z.object({
            town: z.string(),
            address: z.string(),
            city: z.string(),
            state: z.string().default("ME"),
            zip: z.string(),
            dob: z.string(),
            material: z.string(),
            applicantName: z.string(),
            phone: z.string(),
            email: z.string().email(),
            burnLocation: z.string(),
        }).parse(args);

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true, // Start headless, maybe switch to false for debugging if needed
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
            const page = await browser.newPage();

            // Step 1: Go to the site
            await page.goto(PERMIT_URL, { waitUntil: "networkidle0" });

            // Click "Get Started Now"
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle0" }),
                page.click("#button"),
            ]);

            // Step 2: Select Municipality and Burn Type

            // Select Burn Type
            const burnTypeSelector = input.material === "Agricultural" ? "#burnType_1" : "#burnType_0";
            await page.click(burnTypeSelector);

            // Wait for town dropdown to be visible
            await page.waitForSelector("#town", { visible: true });

            // Select Town
            // The site uses Select2, but often we can just set the value on the underlying select and dispatch an event.
            await page.select('#burnTown', input.town);

            // Trigger change event to notify Select2 and show the continue button
            await page.evaluate(() => {
                const select = document.querySelector('#burnTown');
                if (select) {
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    // Also try jQuery trigger if available, as the site uses jQuery
                    // @ts-ignore
                    if (window.jQuery) { window.jQuery('#burnTown').trigger('change'); }
                }
            });

            // Wait for Continue button
            await page.waitForSelector("input[name='continue']", { visible: true });

            // Click Continue
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle0" }),
                page.click("input[name='continue']"),
            ]);

            // Step 3: Applicant Info
            await page.waitForSelector("#firstName", { visible: true });

            // Parse Name
            const nameParts = input.applicantName.split(" ");
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(" ");

            await page.type("#firstName", firstName);
            await page.type("#lastName", lastName);
            await page.type("#dob", input.dob);

            await page.type("#address_address", input.address);
            await page.type("#address_city", input.city);
            await page.select("#address_state", input.state);
            await page.type("#address_zipCode", input.zip);
            await page.select("#address_country", "US");

            // Assume burn location is same as home address for now
            await page.select("#burnLocationSameAddress", "true");
            // Trigger change for burnLocationSameAddress just in case
            await page.evaluate(() => {
                const select = document.querySelector('#burnLocationSameAddress');
                if (select) {
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    // @ts-ignore
                    if (window.jQuery) { window.jQuery('#burnLocationSameAddress').trigger('change'); }
                }
            });

            await page.type("#email", input.email);

            // Format phone number to (XXX) XXX-XXXX if needed, or just type it and hope the mask handles it.
            // The site uses a mask, so typing digits might work best.
            // Let's strip non-digits.
            const phoneDigits = input.phone.replace(/\D/g, "");
            await page.click("#phoneNumber"); // Focus first
            await page.type("#phoneNumber", phoneDigits);

            // Land Owner: Assume Yes for now
            await page.click("#owner_0");

            // Burn Location
            await page.type("#burnLocation", input.burnLocation);

            // Type of Item to Burn
            // Map material to value. Default to 22 (Brush < 10x10)
            // If Agricultural, we might need to check options.
            // For now, let's try to select "22" if it exists, otherwise the first option.
            const itemValue = "22";
            await page.select("#item", itemValue);
            // Trigger change
            await page.evaluate(() => {
                const select = document.querySelector('#item');
                if (select) {
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    // @ts-ignore
                    if (window.jQuery) { window.jQuery('#item').trigger('change'); }
                }
            });

            // Affirmation
            // Wait for affirmation checkbox to be visible (it might be hidden if 'Other' is selected, but we selected 22)
            await page.waitForSelector("#affirmation", { visible: true });
            await page.click("#affirmation");

            // Click Continue
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle0" }),
                page.click("input[name='continue']"),
            ]);

            // DEBUG: Dump content of step 4
            const contentStep4 = await page.content();
            const fs = await import('fs');
            fs.writeFileSync('debug_permit_step4.html', contentStep4);

            // Step 4: Minimum Requirements
            await page.waitForSelector("#minimumRequirements_agreed", { visible: true });
            await page.click("#minimumRequirements_agreed");

            // Click Continue
            // Click Continue
            await Promise.all([
                page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }),
                page.click("input[name='continue']"),
            ]);

            // Step 5: Confirmation / Permit Details
            // The permit is issued immediately after step 4.
            // Check for "Burn Permit Details" in the page content
            const bodyText = await page.evaluate(() => document.body.innerText);

            if (bodyText.includes("Burn Permit Details") || bodyText.includes("Permission is hereby granted")) {
                // Try to extract permit number
                // It's usually a 6+ digit number
                const match = bodyText.match(/(\d{6,})/);
                const permitNumber = match ? match[0] : "Unknown";

                return {
                    content: [
                        {
                            type: "text",
                            text: `Permit Application Successful! Permit Number: ${permitNumber}. Please download the permit from the provided link or save the confirmation page.`,
                        },
                    ],
                };
            } else {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Permit application submitted, but confirmation page title mismatch. Please verify manually.",
                        },
                    ],
                };
            }
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error applying for permit: ${error.message}`,
                    },
                ],
                isError: true,
            };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    },
};
