const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

async function fetchAllProducts() {
    let allProducts = [];
    let page = 1;
    let limit = 250;
    
    while (true) {
        console.log(`Fetching page ${page}...`);
        try {
            const response = await axios.get(`https://turaag.com/products.json?limit=${limit}&page=${page}`);
            const products = response.data.products;
            if (!products || products.length === 0) break;
            allProducts = allProducts.concat(products);
            if (products.length < limit) break;
            page++;
        } catch (error) {
            console.error('Error fetching products:', error.message);
            break;
        }
    }
    return allProducts;
}

async function checkDatabase(allProducts) {
    const db = new sqlite3.Database(DB_PATH);
    
    return new Promise((resolve, reject) => {
        db.all("SELECT title FROM intelligent_product_catalog", [], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const dbTitles = new Set(rows.map(r => r.title.trim().toLowerCase()));
            const siteTitles = allProducts.map(p => p.title.trim().toLowerCase());
            
            let missingInDb = [];
            let inDb = 0;
            
            allProducts.forEach(p => {
                if (dbTitles.has(p.title.trim().toLowerCase())) {
                    inDb++;
                } else {
                    missingInDb.push(p.title);
                }
            });
            
            resolve({
                totalSite: allProducts.length,
                totalDb: rows.length,
                matched: inDb,
                missing: missingInDb
            });
            db.close();
        });
    });
}

async function run() {
    console.log('--- Turaag Catalog Depth Analysis ---');
    const products = await fetchAllProducts();
    console.log(`Total Products on Website: ${products.length}`);
    
    const results = await checkDatabase(products);
    console.log(`Total Products in Database: ${results.totalDb}`);
    console.log(`Successfully Synced: ${results.matched}`);
    console.log(`Missing in Database: ${results.missing.length}`);
    
    if (results.missing.length > 0) {
        console.log('\nSample Missing Products:');
        results.missing.slice(0, 10).forEach(m => console.log(`- ${m}`));
    }
    
    console.log('\n--- Sync Status: ' + (results.missing.length === 0 ? 'FULLY SYNCED' : 'PARTIAL SYNC') + ' ---');
}

run();
