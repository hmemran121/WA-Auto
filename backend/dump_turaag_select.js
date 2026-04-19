const axios = require('axios');
const cheerio = require('cheerio');

async function dump() {
    const url = "https://turaag.com/products/dawn-of-era-polo-shirt-6";
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        
        console.log("--- Select[name='id'] Options ---");
        $('select[name="id"]').find('option').each((j, opt) => {
            console.log(`  Option ${j}: value="${$(opt).attr('value')}" text="${$(opt).text().trim()}"`);
        });

    } catch (e) {
        console.log("Error:", e.message);
    }
}

dump();
