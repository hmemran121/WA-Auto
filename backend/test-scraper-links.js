const SmartScraper = require('./scraper-service');
const dbUtils = require('./db');
const fs = require('fs');
const path = require('path');

const TARGET_URLS = [
    "https://sailor.clothing/details/rb-ef62-bmscs-20371-44471",
    "https://sailor.clothing/details/ky-ef61-hwwlk-00321-41107",
    "https://turaag.com/products/atlas-women-s-track-jacket-1",
    "https://turaag.com/products/aerofit-compression-t-shirt",
    "https://frshopsbd.com/product/boyal-2-3kg/",
    "https://frshopsbd.com/product/deshi-koi-2/",
    "https://riverfish.com.bd/products/river-rui-fish-2-5kg-size?variant=44795308572976",
    "https://riverfish.com.bd/products/%E0%A6%A8%E0%A6%A6%E0%A7%80%E0%A6%B0-%E0%A6%95%E0%A6%BE%E0%A6%A4%E0%A6%B2-%E0%A7%AF-%E0%A6%A5%E0%A7%87%E0%A6%95%E0%A7%87-%E0%A7%A7%E0%A7%A6-%E0%A6%95%E0%A7%87%E0%A6%9C%E0%A6%BF-%E0%A6%B8%E0%A6%BE%E0%A6%87%E0%A6%9C?variant=50582105522480",
    "https://hffoodservice.com/product/chickpeas/",
    "https://hffoodservice.com/product/gawa-ghe/"
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest(isLive = false) {
    const scraper = new SmartScraper("test-process-123");
    const results = [];

    console.log(`\n🚀 Starting Scraper Test (${isLive ? 'LIVE' : 'DRY RUN'})\n`);

    for (const url of TARGET_URLS) {
        console.log(`🔍 Scraping: ${url}`);
        try {
            // V14.1: Direct Manual Extraction (No Crawl)
            const html = await scraper.fetchPage(url);
            if (!html) throw new Error("Failed to fetch HTML");

            const cheerio = require('cheerio'); // Assuming cheerio is available or needs to be required
            const $ = cheerio.load(html);

            // Temporary collection to catch what addProduct usually adds
            const products = [];
            const originalAddProduct = scraper.addProduct.bind(scraper);
            scraper.addProduct = async (p) => {
                products.push(p);
                // We DON'T call the original addProduct here to keep the test clean
            };

            await scraper.extractProducts($, url);

            // Restore original addProduct just in case
            scraper.addProduct = originalAddProduct;

            const prod = products[0];

            if (!prod) {
                console.error(`❌ No product found for: ${url}`);
                results.push({ url, status: 'failed', error: 'No product found' });
                continue;
            }

            console.log(`✅ Found: ${prod.name} | Price: ${prod.price} | SKU: ${prod.sku || 'N/A'}`);

            if (isLive) {
                console.log(`💾 Saving to database...`);
                // 1. Remove existing to prevent duplicates based on URL
                const existing = await dbUtils.getAIProducts({ url: url });
                if (existing && existing.length > 0) {
                    await dbUtils.deleteAIProduct(existing[0].id);
                }

                // 2. Insert new
                const result = await dbUtils.addAIProduct({
                    name: prod.name,
                    sku: prod.sku,
                    price: prod.price,
                    description: prod.description,
                    full_description: prod.full_description,
                    image_url: prod.imageUrl || prod.image_url,
                    product_url: url,
                    variants: prod.variants ? JSON.stringify(prod.variants) : '{}',
                    regular_price: prod.regular_price,
                    sale_price: prod.sale_price,
                    composition: prod.composition || prod.materials,
                    handling_guidelines: prod.handling_guidelines || prod.wash_instructions,
                    technical_attributes: prod.technical_attributes || prod.specifications,
                    source: 'test-scraper',
                    manual_override: 0
                });

                // 3. Cross-Check by ID (the most precise way)
                const verify = await dbUtils.getAIProducts({ url: url });
                const saved = verify[0];
                if (saved && saved.name === prod.name && saved.price === prod.price) {
                    console.log(`💎 Cross-Check PASSED for ${prod.name}`);
                    results.push({ url, status: 'success', name: prod.name });
                } else {
                    console.error(`❌ Cross-Check FAILED for ${prod.name}`);
                    results.push({ url, status: 'failed', name: prod.name, error: 'Database verification failed' });
                }
            } else {
                results.push({ url, status: 'success', name: prod.name });
            }

            // Be polite to servers
            await sleep(2000);

        } catch (err) {
            console.error(`❌ Error scraping ${url}: ${err.message}`);
            results.push({ url, status: 'error', error: err.message });
        }
    }

    console.log("\n--- TEST SUMMARY ---");
    console.table(results);

    // Save report
    const reportPath = path.join(__dirname, 'test_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\nDetailed report saved to: ${reportPath}`);
}

const args = process.argv.slice(2);
const isLive = args.includes('--live');

runTest(isLive).catch(console.error);
