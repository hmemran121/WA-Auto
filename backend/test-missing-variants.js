const SmartScraper = require('./scraper-service');

async function testVariant() {
    const url = "https://turaag.com/products/advent-half-zip-pullover";
    console.log(`\n\n--- Testing API Sync Alone ---`);
    
    const scraper = new SmartScraper();
    
    // Override processPage to do NOTHING so we ONLY get API results
    scraper.processPage = async function() {
        console.log("Mock processPage executed (HTML scrape bypassed).");
    };

    await scraper.scan(url, {
        strictSinglePage: true,
        isApiSync: true,
        maxPages: 1
    });
    
    console.log(`Extracted DB items: ${scraper.data.products.length}`);
    if (scraper.data.products.length > 0) {
        console.log("Variants object string:", scraper.data.products[0].variants);
        const parsed = JSON.parse(scraper.data.products[0].variants);
        console.log("Parsed Variants count:", parsed.items.length);
        console.log("Parsed Variants content:", JSON.stringify(parsed, null, 2));
    }
}

testVariant();
