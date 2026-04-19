const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

async function analyzeDatabase() {
    console.log("🔍 Starting Deep Database Analysis...\n");

    try {
        // 1. Total count
        const totalRows = await fetchAll("SELECT id, name, product_url, variants, source FROM intelligent_product_catalog");
        console.log(`📊 Total Products in Database: ${totalRows.length}\n`);

        // 2. Duplicate Analysis (By EXACT URL)
        const duplicateUrls = await fetchAll(`
            SELECT product_url, COUNT(*) as count, GROUP_CONCAT(id) as ids 
            FROM intelligent_product_catalog 
            WHERE product_url IS NOT NULL 
            GROUP BY product_url 
            HAVING count > 1
        `);
        console.log(`\n--- 🕵️ Duplicate URL Analysis ---`);
        console.log(`Found ${duplicateUrls.length} unique URLs with duplicates.`);
        let duplicateUrlCount = 0;
        duplicateUrls.slice(0, 5).forEach(d => {
            console.log(`URL: ${d.product_url} | Count: ${d.count} | IDs: ${d.ids}`);
            duplicateUrlCount += (d.count - 1);
        });
        if (duplicateUrls.length > 5) console.log(`... and ${duplicateUrls.length - 5} more.`);
        console.log(`Total superfluous rows due to exact URL duplication: ${duplicateUrlCount}`);

        // 3. Duplicate Analysis (By Base URL - ignoring query params)
        const allUrls = totalRows.map(r => ({ id: r.id, name: r.name, url: r.product_url, base_url: r.product_url ? r.product_url.split('?')[0] : '' }));
        const baseUrlMap = {};
        allUrls.forEach(item => {
            if (item.base_url) {
                if (!baseUrlMap[item.base_url]) baseUrlMap[item.base_url] = [];
                baseUrlMap[item.base_url].push(item);
            }
        });
        
        let dupBaseUrlCount = 0;
        console.log(`\n--- 🕵️ Duplicate Base URL Analysis ---`);
        for (const [baseUrl, items] of Object.entries(baseUrlMap)) {
            if (items.length > 1) {
                dupBaseUrlCount++;
                if (dupBaseUrlCount <= 5) {
                    console.log(`Base URL: ${baseUrl} | Count: ${items.length}`);
                    console.log(`  IDs: ${items.map(i => i.id).join(', ')}`);
                }
            }
        }
        console.log(`Found ${dupBaseUrlCount} Base URLs with duplicates (likely query parameter variations).`);

        // 4. Variant Analysis
        console.log(`\n--- 📦 Variant Analysis ---`);
        let missingVariantsCount = 0;
        let missingVariantSamples = [];

        totalRows.forEach(row => {
            let hasVariants = false;
            try {
                if (row.variants) {
                    const parsed = JSON.parse(row.variants);
                    if (parsed.items && parsed.items.length > 0) {
                        hasVariants = true;
                    } else if (Array.isArray(parsed) && parsed.length > 0) {
                        hasVariants = true;
                    }
                }
            } catch (e) {
                // Parse error
            }

            if (!hasVariants) {
                missingVariantsCount++;
                if (missingVariantSamples.length < 10) {
                    missingVariantSamples.push({ id: row.id, name: row.name, url: row.product_url, source: row.source });
                }
            }
        });

        console.log(`Products entirely missing variants: ${missingVariantsCount} out of ${totalRows.length} (${((missingVariantsCount/totalRows.length)*100).toFixed(2)}%)`);
        if (missingVariantSamples.length > 0) {
            console.log(`\nSample Products missing variants:`);
            missingVariantSamples.forEach(s => {
                console.log(`ID: ${s.id} | Name: ${s.name} | URL: ${s.url} | Source: ${s.source}`);
            });
        }

    } catch (err) {
        console.error("Analysis Error:", err);
    } finally {
        db.close();
    }
}

function fetchAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

analyzeDatabase();
