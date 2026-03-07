const axios = require('axios');
const cheerio = require('cheerio');

async function refinedCountCheck() {
    // Using the IP resolved earlier to bypass DNS issues
    const url = 'http://34.111.148.251/mobiles.html';
    console.log(`🚀 Attempting Refined Backend Check (IP-based): ${url}`);

    try {
        const res = await axios.get(url, {
            headers: {
                'Host': 'www.pickaboo.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            timeout: 20000,
            validateStatus: false
        });

        console.log(`Status: ${res.status}`);

        const $ = cheerio.load(res.data);
        const bodyText = $('body').text().replace(/\s+/g, ' ');

        // Search for count patterns
        const matches = bodyText.match(/(\d+)\s+items/i) || bodyText.match(/of\s+(\d+)/i);
        if (matches) {
            console.log(`✅ FOUND COUNT ON PAGE: ${matches[0]}`);
        } else {
            console.log("❌ No direct count found in text.");
            console.log("Debug Snippet:", bodyText.substring(0, 500));
        }

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

refinedCountCheck();
