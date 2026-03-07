const db = require('./db');

async function debug() {
    try {
        console.log("Fetching a campaign...");
        const campaigns = await db.getAllCampaigns();
        const cid = campaigns[0].id;
        console.log("Using Campaign ID:", cid);

        console.log("Attempting bulk insert...");
        const res = await db.bulkInsertCancelledMessages(cid, ['880111', '880222']);
        console.log("Result:", res);
    } catch (e) {
        console.error("Caught Error:", e);
    }
}
debug();
