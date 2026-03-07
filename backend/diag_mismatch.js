const axios = require('axios');
const cheerio = require('cheerio');

async function diagnose() {
    const url = 'https://hffoodservice.com/product/winter-celebration';
    console.log(`🔍 Fetching: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });

        const $ = cheerio.load(response.data);

        console.log("\n--- Price Elements Found ---");
        $('.price').each((i, el) => {
            console.log(`Element ${i + 1}:`, $(el).html().trim());
            console.log(`Text ${i + 1}:`, $(el).text().trim());
        });

        console.log("\n--- Meta Tags ---");
        console.log("og:price:amount:", $('meta[property="product:price:amount"]').attr('content'));
        console.log("JSON-LD Price:", $('script[type="application/ld+json"]').text().match(/"price":"(\d+)"/)?.[1]);

        console.log("\n--- Variation Form ---");
        const variations = $('.variations_form').attr('data-product_variations');
        if (variations) {
            console.log("Found Variations!");
            const parsed = JSON.parse(variations);
            parsed.forEach(v => {
                console.log(`Variant ID: ${v.variation_id} | Attributes: ${JSON.stringify(v.attributes)} | Price: ${v.display_price}`);
            });
        } else {
            console.log("No Variation Form found.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

diagnose();
