const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

async function fetchFirstPage() {
    const response = await axios.get(`https://turaag.com/products.json?limit=250&page=1`);
    return response.data.products;
}

async function checkSync() {
    const siteProducts = await fetchFirstPage();
    const siteNames = new Set(siteProducts.map(p => p.title.trim().toLowerCase()));
    
    const db = new sqlite3.Database(DB_PATH);
    db.all("SELECT name FROM intelligent_product_catalog", [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        
        let matched = 0;
        rows.forEach(r => {
            if (siteNames.has(r.name.trim().toLowerCase())) matched++;
        });
        
        console.log(`Site Page 1 (250 items) vs DB (${rows.length} items):`);
        console.log(`Matched: ${matched}`);
        db.close();
    });
}

checkSync();
