const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
};

async function checkCategory(url) {
    try {
        console.log(`Checking Category: ${url}`);
        const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        const bodyText = $('body').text();

        // Look for common "total items" patterns
        const countMatch = bodyText.match(/(\d+)\s+items/i) || bodyText.match(/of\s+(\d+)/i);
        if (countMatch) {
            console.log(`  -> Found count: ${countMatch[0]}`);
            return parseInt(countMatch[1]);
        }

        // Check for pagination indicators
        const lastPageLink = $('.pages-item-next').prev().text().trim();
        if (lastPageLink) {
            const lastPage = parseInt(lastPageLink);
            console.log(`  -> Estimated items based on pages (${lastPage}): ~${lastPage * 20}`);
            return lastPage * 20;
        }

        console.log("  -> No count found in text.");
        return 0;
    } catch (e) {
        console.log(`  -> Failed: ${e.message}`);
        return 0;
    }
}

async function run() {
    console.log("🚀 Starting Pickaboo Product Count Verification...");

    // Try sitemap index again with better headers
    try {
        const sUrl = 'https://www.pickaboo.com/sitemapindex.xml';
        console.log(`Attempting Sitemap: ${sUrl}`);
        const sRes = await axios.get(sUrl, { headers: HEADERS, timeout: 10000 });
        console.log(`- Sitemap Status: ${sRes.status} (SUCCESS)`);
        // If success, we can parse it here.
    } catch (e) {
        console.log(`- Sitemap Index Failed: ${e.message}`);
    }

    // Check key categories
    const categories = [
        'https://www.pickaboo.com/mobiles.html',
        'https://www.pickaboo.com/electronics.html',
        'https://www.pickaboo.com/lifestyle.html'
    ];

    let totalEstimate = 0;
    for (const cat of categories) {
        totalEstimate += await checkCategory(cat);
    }

    console.log(`\n📊 Preliminary Estimate (Sum of 3 main categories): ~${totalEstimate}`);
    console.log("Note: This is a rough backend estimation.");
}

run();
