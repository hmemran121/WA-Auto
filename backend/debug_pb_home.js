const axios = require('axios');

async function debugHomepage() {
    const url = 'https://www.pickaboo.com/';
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    console.log(`🚀 Debugging Fetch: ${url}`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 15000
        });

        console.log(`✅ Status: ${res.status}`);
        console.log(`✅ Content-Length: ${res.headers['content-length']}`);
        console.log(`✅ Content-Type: ${res.headers['content-type']}`);

        const html = res.data;
        console.log("\n--- HTML SNIPPET (First 1000 chars) ---");
        console.log(html.substring(0, 1000));
        console.log("\n--- HTML SNIPPET (Title & Metadata) ---");
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        console.log(`Title: ${titleMatch ? titleMatch[1] : "Not found"}`);

        const linksCount = (html.match(/href=/g) || []).length;
        console.log(`Total Links Found: ${linksCount}`);

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
        if (e.response) {
            console.log(`Status: ${e.response.status}`);
            console.log("Data:", e.response.data.substring(0, 500));
        }
    }
}

debugHomepage();
