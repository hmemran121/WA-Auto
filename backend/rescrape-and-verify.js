const sqlite3 = require('sqlite3').verbose();
const SmartScraper = require('./scraper-service');
const path = require('path');
const fs = require('fs');
const dbModule = require('./db');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

async function getAllProducts() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, name, product_url, description, full_description, technical_attributes FROM intelligent_product_catalog WHERE product_url IS NOT NULL", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function run() {
    console.log("Starting DB Rescue & Verification...");
    try {
        const products = await getAllProducts();
        console.log(`Found ${products.length} products to verify and sync.`);
        
        let report = `# Database Verification & Sync Report\n\nTotal Products Checked: ${products.length}\n\n`;
        let successCount = 0;
        let issueCount = 0;

        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            console.log(`\n[${i+1}/${products.length}] Verifying: ${p.product_url}`);
            
            try {
                const scraper = new SmartScraper();

                let productData = null;
                
                await scraper.scan(p.product_url, { 
                    strictSinglePage: true, 
                    isApiSync: true, 
                    maxPages: 1,
                    onUpdate: () => {}
                });
                
                // Read from the final scraper instance memory to ensure all DOM merges applied
                if (scraper.data.products.length > 0) {
                    productData = scraper.data.products[0];
                }

                if (!productData) {
                    console.log(`❌ Failed to extract data for: ${p.product_url} (Maybe 404 or redirect)`);
                    report += `### ❌ ID: ${p.id} | Failed Extraction\nURL: ${p.product_url}\n\n`;
                    issueCount++;
                    continue;
                }

                let errors = [];
                
                if (productData.composition || productData.handling_guidelines) {
                    errors.push("🚨 Extra columns found in scraper output (composition/handling).");
                }
                
                if (errors.length > 0) {
                    console.log(`⚠️ Issues found for ${p.product_url}`);
                    report += `### ⚠️ ID: ${p.id}\nURL: ${p.product_url}\nWarnings:\n${errors.join('\n')}\n\n`;
                    issueCount++;
                } else {
                    console.log(`✅ Passed Verification: ${productData.name}`);
                    successCount++;
                }
                
                // Update DB 
                await dbModule.updateAIProduct(p.id, productData);
                console.log(`💾 Updated DB for ID: ${p.id} | ${productData.name}`);

                await delay(300);

            } catch (err) {
                console.log(`❌ Error processing ${p.product_url}:`, err.message);
                report += `### ❌ Error ID: ${p.id}\nURL: ${p.product_url}\nException: ${err.message}\n\n`;
                issueCount++;
            }
        }
        
        console.log(`\n--- Verification Complete ---`);
        console.log(`Total: ${products.length}`);
        console.log(`Passed & Synced: ${successCount}`);
        console.log(`Issues (404/redirects/errors): ${issueCount}`);
        
        fs.writeFileSync('db_verification_report.md', report);
        
    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        db.close();
    }
}

if (typeof dbModule.updateAIProduct === 'function') {
    run();
} else {
    console.error("updateAIProduct is not exported from db.js");
}
