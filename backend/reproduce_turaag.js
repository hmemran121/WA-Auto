const SmartScraper = require('./scraper-service');

async function test() {
    const scraper = new SmartScraper();
    const url = "https://turaag.com/products/dawn-of-era-polo-shirt-6";
    
    console.log("--- Testing API Sync (Shopify JSON) ---");
    const apiSuccess = await scraper.tryApiSync(url);
    if (apiSuccess && scraper.data.products.length > 0) {
        console.log("API Sync Success!");
        console.log("Variants:", JSON.stringify(scraper.data.products[0].variants, null, 2));
    } else {
        console.log("API Sync Failed or returned no products.");
    }
    
    // Clear products for next test
    scraper.data.products = [];
    
    console.log("\n--- Testing HTML Scrape ---");
    // We need to fetch the HTML first to use extractProducts
    const axios = require('axios');
    const cheerio = require('cheerio');
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        await scraper.extractProducts($, url);
        if (scraper.data.products.length > 0) {
            console.log("HTML Scrape Success!");
            console.log("Variants:", JSON.stringify(scraper.data.products[0].variants, null, 2));
        } else {
            console.log("HTML Scrape returned no products.");
        }
    } catch (e) {
        console.log("HTML Scrape Error:", e.message);
    }
}

test();
