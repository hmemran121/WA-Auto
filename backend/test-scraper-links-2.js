const SmartScraper = require('./scraper-service');

async function testScraping() {
    const sailorUrl = "https://www.sailor.clothing/men-s-panjabi-61405.html";

    console.log("--- Testing Sailor ---");
    const scraper2 = new SmartScraper();
    await scraper2.scan(sailorUrl, { 
        strictSinglePage: true, 
        isApiSync: true, 
        maxPages: 1,
        onProduct: (prod) => {
            console.log("Sailor Result:", JSON.stringify(prod, null, 2));
            process.exit(0);
        }
    });

}
testScraping();
