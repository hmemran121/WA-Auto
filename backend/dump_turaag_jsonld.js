const axios = require('axios');
const cheerio = require('cheerio');

async function dump() {
    const url = "https://turaag.com/products/dawn-of-era-polo-shirt-6";
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        
        console.log("--- JSON-LD Tags ---");
        $('script[type="application/ld+json"]').each((i, el) => {
            console.log(`Tag ${i}:`);
            console.log($(el).html());
        });

    } catch (e) {
        console.log("Error:", e.message);
    }
}

dump();
