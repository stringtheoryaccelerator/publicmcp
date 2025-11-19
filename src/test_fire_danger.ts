import { fireDangerTool } from "./tools/fireDanger.js";

async function runTest() {
    console.log("Testing fire danger tool...");
    const result = await fireDangerTool.handler({ town: "Augusta" });
    console.log("Result:", JSON.stringify(result, null, 2));
}

runTest().catch(console.error);
