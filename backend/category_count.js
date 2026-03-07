const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

async function checkCategory() {
    const url = 'https://www.pickaboo.com/mobiles.html';
    console.log(`🚀 Fetching category for count: ${url}`);

    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
        const $ = cheerio.load(res.data);

        // Look for the count in the text
        const bodyText = $('body').text();
        const countMatches = bodyText.match(/(\d+)\s+items/i) || bodyText.match(/of\s+(\d+)/i);

        if (countMatches) {
            console.log(`✅ Result: ${countMatches[0]}`);
        } else {
            console.log("❌ No direct count found. Checking common Magento selectors...");
            const toolBar = $('.toolbar-amount').first().text().trim();
            if (toolBar) {
                console.log(`✅ ToolBar Amount: ${toolBar}`);
            } else {
                console.log("Snippet:", bodyText.substring(0, 300).replace(/\s+/g, ' '));
            }
        }

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

checkCategory();
