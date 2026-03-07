const axios = require('axios');
const cheerio = require('cheerio');

async function extractLDJSON() {
    const url = 'https://www.pickaboo.com/';
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    try {
        const res = await axios.get(url, { headers: { 'User-Agent': ua } });
        const $ = cheerio.load(res.data);

        console.log("--- LD+JSON Discovery ---");
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).html());
                console.log(`\nScript ${i + 1} Type: ${data['@type'] || 'unknown'}`);

                // Print a sample of the data keys
                console.log("Keys: " + Object.keys(data).join(', '));

                if (data.itemListElement) {
                    console.log(`Found ${data.itemListElement.length} items in list.`);
                    data.itemListElement.slice(0, 5).forEach(item => {
                        console.log(`- ${item.item ? item.item['@id'] : 'no-id'}`);
                    });
                }
            } catch (e) {
                console.log(`Error parsing script ${i + 1}`);
            }
        });

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }
}

extractLDJSON();
