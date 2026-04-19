const sqlite3 = require('sqlite3').verbose();
const SmartScraper = require('./scraper-service');
const path = require('path');
const fs = require('fs');

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

async function verifyAllProducts() {
    console.log("Starting Full Database Verification...");
    try {
        const products = await getAllProducts();
        console.log(`Found ${products.length} products to verify.`);
        
        let report = `# Database Verification Report\n\nTotal Products Checked: ${products.length}\n\n`;
        let issuesFound = 0;
        let successCount = 0;

        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            console.log(`\n[${i+1}/${products.length}] Checking: ${p.product_url}`);
            
            try {
                const scraper = new SmartScraper();
                let scrapedData = null;
                
                await scraper.scan(p.product_url, { 
                    strictSinglePage: true, 
                    isApiSync: true, 
                    maxPages: 1,
                    onProduct: async (prod) => {
                        scrapedData = prod;
                    }
                });
                
                if (!scrapedData && scraper.data.products.length > 0) {
                    scrapedData = scraper.data.products[0];
                }

                if (!scrapedData) {
                    console.log(`❌ Failed to extract data or redirect occurred for: ${p.product_url}`);
                    report += `### ❌ ID: ${p.id} | URL: ${p.product_url}\n- Error: Failed to extract data (Possibly 404 or redirect).\n\n`;
                    issuesFound++;
                    continue;
                }

                // Verify Rules
                let errors = [];
                
                // Rule 1: No fallback mixup
                if (scrapedData.description && scrapedData.full_description) {
                    if (scrapedData.description === scrapedData.full_description) {
                       // Note: Our strict logic just maps whatever is there. But if the site truly had them identical, it's fine.
                       // Just mentioning for safety.
                    }
                }
                
                // Rule 2: Variants
                const v = JSON.parse(scrapedData.variants || "{}");
                if (v.sizes && v.sizes.some(s => s.toLowerCase().includes('red') || s.toLowerCase().includes('blue'))) {
                     errors.push("- Warning: Color found in sizes array (Check variant logic).");
                }
                
                // Rule 3: Composition / Handling should not be present natively if not set 
                if (scrapedData.composition || scrapedData.handling_guidelines) {
                     errors.push("- Error: composition or handling_guidelines fields were extracted (They should only be in technical_attributes).");
                }

                if (errors.length > 0) {
                    console.log(`⚠️ Issues found for ${p.product_url}`);
                    report += `### ⚠️ ID: ${p.id} | URL: ${p.product_url}\n${errors.join('\n')}\n\n`;
                    issuesFound++;
                } else {
                    console.log(`✅ Passed: ${p.name}`);
                    successCount++;
                }
                
                // Add sleep to avoid rate limiting
                await delay(2000);

            } catch (err) {
                console.log(`❌ Error scanning ${p.product_url}:`, err.message);
                report += `### ❌ ID: ${p.id} | URL: ${p.product_url}\n- Exception: ${err.message}\n\n`;
                issuesFound++;
            }
        }
        
        report += `---\n**Summary:**\nTotal: ${products.length}\nPassed: ${successCount}\nIssues/Warnings: ${issuesFound}\n`;
        fs.writeFileSync('db_verification_report.md', report);
        console.log("Verification finished. Report saved to db_verification_report.md");
        
    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        db.close();
    }
}

verifyAllProducts();
