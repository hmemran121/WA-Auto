const assert = require('assert');

// Simple integration test for Smart Resend
async function runUnifiedCampaignTest() {
    console.log('🧪 Starting Unified Campaign & Smart Resend E2E Test...');

    // 1. Fire a dummy Instant Campaign
    console.log('1️⃣ Firing Instant Campaign to 3 targets...');
    const initRes = await fetch('http://localhost:3001/api/campaigns/run-instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            targets: [
                { phone: '8801900000001', name: 'Test 1' },
                { phone: '8801900000002', name: 'Test 2' },
                { phone: '8801900000003', name: 'Test 3' }
            ],
            text: 'Hello from Unified E2E Test',
            delayMin: 10,
            delayMax: 20
        })
    });

    const initData = await initRes.json();
    assert.strictEqual(initData.success, true, 'Instant campaign init failed');
    console.log('✅ Instant campaign launched');

    // Give it 10 seconds to process and intentionally fail (since numbers are fake)
    console.log('⏳ Waiting 10 seconds for campaign to finish routing (and fail)...');
    await new Promise(r => setTimeout(r, 10000));

    // 2. Fetch Unified Campaigns List
    console.log('2️⃣ Fetching Unified Tracker List...');
    const listRes = await fetch('http://localhost:3001/api/campaigns');
    const listData = await listRes.json();
    assert.strictEqual(listData.success, true, 'Campaign List fetch failed');

    const ourCampaign = listData.campaigns.find(c => c.name.includes('Instant Campaign'));
    assert.ok(ourCampaign, 'Campaign was not saved to DB!');
    console.log(`✅ Found campaign in DB (ID: ${ourCampaign.id}), Failures: ${ourCampaign.fail_count}`);

    // 3. Test Smart Resend
    console.log(`3️⃣ Triggering Smart Resend on Campaign ${ourCampaign.id}...`);
    const resendRes = await fetch(`http://localhost:3001/api/campaigns/${ourCampaign.id}/resend`, {
        method: 'POST'
    });
    const resendData = await resendRes.json();
    assert.strictEqual(resendData.success, true, 'Smart Resend API failed');
    console.log(`✅ Smart resend initialized for ${resendData.resentCount} targets!`);

    console.log('🎉 Unified Campaign Tracker test completed successfully.');
}

runUnifiedCampaignTest().catch(console.error);
