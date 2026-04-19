const SmartScraper = require('./scraper-service');
const dbModule = require('./db');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

async function checkUrls() {
    const urls = [
        "https://turaag.com/products/impulse-series-2-training-t-shirt",
        "https://turaag.com/products/rapidrush-joggers",
        "https://turaag.com/products/aerosculpt-cropped-leggings"
    ];

    for (const url of urls) {
        console.log(`\n\n--- Fixing: ${url} ---`);
        const scraper = new SmartScraper();
        await scraper.scan(url, {
            strictSinglePage: true,
            isApiSync: true,
            maxPages: 1
        });
        
        const extracted = scraper.data.products[0];

        if (extracted) {
            console.log("-> description:", !!extracted.description, extracted.description ? extracted.description.substring(0, 50) + "..." : "EMPTY");
            console.log("-> full_description:", !!extracted.full_description, extracted.full_description ? extracted.full_description.substring(0, 50) + "..." : "EMPTY");
            console.log("-> technical_attributes:", !!extracted.technical_attributes, extracted.technical_attributes ? extracted.technical_attributes.substring(0, 50) + "..." : "EMPTY");
            
            // Fix in DB directly
            db.get("SELECT id FROM intelligent_product_catalog WHERE product_url = ?", [url], async (err, row) => {
                if (err) console.error(err);
                if (row) {
                    await dbModule.updateAIProduct(row.id, extracted);
                    console.log(`✅ Patched DB successfully for ID: ${row.id}`);
                }
            });
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.log("Failed to extract product.");
        }
    }
}

checkUrls();
