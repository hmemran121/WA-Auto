const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const SmartScraper = require('./scraper-service');

const dbPath = 'i:/Antigravity/WA-Auto/backend/data.db';
const db = new sqlite3.Database(dbPath);

// Enterprise Lock Handling
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 30000');

async function runRepair() {
    console.log("🛠️ Starting Targeted Repair for Turaag Products (ID 11004-11576)...");

    const products = await new Promise((resolve, reject) => {
        db.all(`
            SELECT id, name, product_url 
            FROM intelligent_product_catalog 
            WHERE id BETWEEN 12150 AND 13000
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    console.log(`🔍 Found ${products.length} products to repair.`);

    const scraper = new SmartScraper();
    let fixedCount = 0;

    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        process.stdout.write(`[${i+1}/${products.length}] Repairing ID ${p.id}: ${p.name.slice(0, 30)}... `);
        
        try {
            // Use tryApiSync as it provides the highest fidelity Shopify data
            const success = await scraper.tryApiSync(p.product_url);
            if (success && scraper.data.products.length > 0) {
                const scraped = scraper.data.products[0];
                
                // Ensure variants are stringified correctly for DB
                const variantsStr = (typeof scraped.variants === 'string') 
                    ? scraped.variants 
                    : JSON.stringify(scraped.variants || { items: [] });
                
                await new Promise((resolve, reject) => {
                    db.run(`
                        UPDATE intelligent_product_catalog 
                        SET variants = ?, 
                            sku = ?,
                            price = ?, 
                            regular_price = ?, 
                            sale_price = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [
                        variantsStr, 
                        scraped.sku,
                        scraped.price, 
                        scraped.regular_price, 
                        scraped.sale_price, 
                        p.id
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log(`✅ Fixed!`);
                fixedCount++;
            } else {
                console.log(`⚠️ API Sync failed for this URL.`);
            }
            // Clear products for next iteration
            scraper.data.products = [];
        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
        }
        
        // Minor delay to avoid hitting rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n🏁 Repair Complete!`);
    console.log(`- Products Successfully Fixed: ${fixedCount}/${products.length}`);
    db.close();
}

runRepair();
