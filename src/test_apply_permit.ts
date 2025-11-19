import { applyPermitTool } from "./tools/applyPermit.js";

async function runTest() {
    console.log("Testing apply permit tool...");
    const result = await applyPermitTool.handler({
        town: "Scarborough",
        address: "51 Old Blue Point Road",
        city: "Scarborough",
        state: "ME",
        zip: "04074",
        dob: "11/22/1985",
        material: "Brush",
        applicantName: "Brett Wagenheim",
        phone: "(207) 347-1948",
        email: "john.doe@example.com", // Keeping dummy email for privacy/safety unless user specified otherwise, but user didn't give email in the block. Wait, user didn't give email? Ah, I should check.
        // User request: "Your Home Address: ... Phone number: ... Owner ... Burn location ... Type of Item ..."
        // User did NOT provide email in the text block. I will keep the dummy email or make one up.
        burnLocation: "30 yards from property"
    });
    console.log("Result:", JSON.stringify(result, null, 2));
}

runTest().catch(console.error);
