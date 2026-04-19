const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const SmartScraper = require('./scraper-service');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

async function runCleanup() {
    console.log("🧹 Starting Database Cleanup & Deep Repair...");

    // 1. Identify and Delete Duplicates (Keep the one with most data or latest)
    const duplicates = await new Promise((resolve, reject) => {
        db.all(`
            SELECT product_url, COUNT(*) as count 
            FROM intelligent_product_catalog 
            GROUP BY product_url 
            HAVING count > 1
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    console.log(`🔍 Found ${duplicates.length} URL groups with duplicates.`);

    for (const group of duplicates) {
        const rows = await new Promise((resolve, reject) => {
            db.all("SELECT id, name, variants, description FROM intelligent_product_catalog WHERE product_url = ?", [group.product_url], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        rows.sort((a, b) => {
            const getVarCount = (v) => {
                try {
                    const parsed = (typeof v === 'string') ? JSON.parse(v || '{}') : (v || {});
                    return parsed.items ? parsed.items.length : 0;
                } catch (e) { return 0; }
            };
            const countA = getVarCount(a.variants);
            const countB = getVarCount(b.variants);
            if (countB !== countA) return countB - countA;
            return b.id - a.id;
        });

        const keepId = rows[0].id;
        const deleteIds = rows.slice(1).map(r => r.id);

        if (deleteIds.length > 0) {
            console.log(`🗑️ URL: ${group.product_url} | Keeping ID: ${keepId} | Deleting ${deleteIds.length} clones...`);
            await new Promise((resolve, reject) => {
                const placeholders = deleteIds.map(() => '?').join(',');
                db.run(`DELETE FROM intelligent_product_catalog WHERE id IN (${placeholders})`, deleteIds, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }

    // 2. Identify products needing repair (even if they have "partial" or "broken" variants)
    const products = await new Promise((resolve, reject) => {
        db.all(`
            SELECT id, name, product_url, variants
            FROM intelligent_product_catalog 
            WHERE product_url LIKE '%turaag.com%'
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const isSuspicious = (v) => {
        if (!v || v === '{}') return true;
        try {
            const parsed = (typeof v === 'string') ? JSON.parse(v || '{}') : (v || {});
            const items = parsed.items || (Array.isArray(parsed) ? parsed : []);
            if (items.length === 0) return true;
            // Suspicious if only 1 variant and value starts with SKU prefix (TRG)
            if (items.length === 1 && (items[0].value.startsWith('TRG') || items[0].value.length > 10)) return true;
            return false;
        } catch (e) { return true; }
    };

    const toRepair = products.filter(p => isSuspicious(p.variants));
    console.log(`🛠️ Deep Repairing ${toRepair.length} Turaag products with suspicious or missing variations...`);

    const scraper = new SmartScraper();
    let fixedCount = 0;

    for (let i = 0; i < toRepair.length; i++) {
        const p = toRepair[i];
        process.stdout.write(`[${i+1}/${toRepair.length}] Repairing: ${p.name.slice(0, 30)}... `);
        
        try {
            const success = await scraper.tryApiSync(p.product_url);
            if (success && scraper.data.products.length > 0) {
                const scraped = scraper.data.products[0];
                const variantsStr = JSON.stringify(scraped.variants || { items: [] });
                
                await new Promise((resolve, reject) => {
                    db.run(`
                        UPDATE intelligent_product_catalog 
                        SET variants = ?, price = ?, regular_price = ?, sale_price = ?, 
                            description = CASE WHEN COALESCE(description, '') = '' THEN ? ELSE description END,
                            full_description = CASE WHEN COALESCE(full_description, '') = '' THEN ? ELSE full_description END,
                            technical_attributes = CASE WHEN COALESCE(technical_attributes, '') = '' THEN ? ELSE technical_attributes END
                        WHERE id = ?
                    `, [
                        variantsStr, scraped.price, scraped.regular_price, scraped.sale_price,
                        scraped.description, scraped.full_description, scraped.technical_attributes, p.id
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log(`✅ Fixed!`);
                fixedCount++;
            } else {
                console.log(`⚠️ Failed (No API data)`);
            }
            scraper.data.products = [];
        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 150));
    }

    console.log(`\n🏁 Detailed Cleanup Summary:`);
    console.log(`- Duplicates De-cloned!`);
    console.log(`- Products Successfully Re-synced: ${fixedCount}/${toRepair.length}`);
    db.close();
}

runCleanup();
