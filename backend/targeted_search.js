const axios = require('axios');
const cheerio = require('cheerio');

async function getCount() {
    console.log("🚀 Starting Targeted Backend Search for Pickaboo...");

    const targetUrl = 'https://www.pickaboo.com/catalogsearch/result/?q=*';
    console.log(`Checking search results: ${targetUrl}`);

    try {
        const res = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 30000
        });

        const $ = cheerio.load(res.data);
        const bodyText = $('body').text();

        // Look for "items" or "products" count
        const matches = bodyText.match(/(\d+)\s+items/i) || bodyText.match(/(\d+)\s+products/i) || bodyText.match(/of\s+(\d+)/i);
        if (matches) {
            console.log(`✅ FOUND: ${matches[0]}`);
        } else {
            console.log("❌ No direct count found in response body.");
            console.log("Snippet:", bodyText.substring(0, 500).replace(/\s+/g, ' '));
        }

        // Check for sitemap index again
        console.log("\nAttempting sitemapindex.xml again...");
        const sRes = await axios.get('https://www.pickaboo.com/sitemapindex.xml', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        console.log(`Sitemap Index Status: ${sRes.status}`);

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
        if (e.response) console.log(`Status: ${e.response.status}`);
    }
}

getCount();
