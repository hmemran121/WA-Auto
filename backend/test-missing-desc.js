const SmartScraper = require('./scraper-service');

async function checkUrls() {
    const urls = [
        "https://turaag.com/products/impulse-series-2-training-t-shirt",
        "https://turaag.com/products/rapidrush-joggers",
        "https://turaag.com/products/aerosculpt-cropped-leggings"
    ];

    for (const url of urls) {
        console.log(`\n\n--- Testing: ${url} ---`);
        const scraper = new SmartScraper();
        await scraper.scan(url, {
            strictSinglePage: true,
            isApiSync: true,
            maxPages: 1
        });
        
        const extracted = scraper.data.products[0];

        if (extracted) {
            console.log("-> description:", !!extracted.description, extracted.description ? extracted.description.substring(0, 150) + "..." : "EMPTY");
            console.log("-> full_description:", !!extracted.full_description, extracted.full_description ? extracted.full_description.substring(0, 150) + "..." : "EMPTY");
            console.log("-> technical_attributes:", !!extracted.technical_attributes, extracted.technical_attributes ? extracted.technical_attributes.substring(0, 150) + "..." : "EMPTY");
            console.log("-> variants count:", JSON.parse(extracted.variants).items.length);
        } else {
            console.log("Failed to extract product.");
        }
    }
}

checkUrls();
