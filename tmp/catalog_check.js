const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = 'i:\\Antigravity\\WA-Auto\\backend\\database.sqlite';

function fetchPage(page) {
    return new Promise((resolve, reject) => {
        const url = `https://turaag.com/products.json?limit=250&page=${page}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).products);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function fetchAllProducts() {
    let allProducts = [];
    let page = 1;
    while (true) {
        console.log(`Fetching page ${page}...`);
        const products = await fetchPage(page);
        if (!products || products.length === 0) break;
        allProducts = allProducts.concat(products);
        if (products.length < 250) break;
        page++;
    }
    return allProducts;
}

async function checkDatabase(allProducts) {
    const db = new sqlite3.Database(DB_PATH);
    return new Promise((resolve, reject) => {
        db.all("SELECT title FROM intelligent_product_catalog", [], (err, rows) => {
            if (err) return reject(err);
            const dbTitles = new Set(rows.map(r => r.title.trim().toLowerCase()));
            let missing = [];
            let matched = 0;
            allProducts.forEach(p => {
                if (dbTitles.has(p.title.trim().toLowerCase())) matched++;
                else missing.push(p.title);
            });
            resolve({ totalSite: allProducts.length, totalDb: rows.length, matched, missing });
            db.close();
        });
    });
}

async function run() {
    try {
        const products = await fetchAllProducts();
        const results = await checkDatabase(products);
        console.log(`Total Site: ${results.totalSite}`);
        console.log(`Total DB: ${results.totalDb}`);
        console.log(`Matched: ${results.matched}`);
        console.log(`Missing: ${results.missing.length}`);
        if (results.missing.length > 0) {
            console.log('Missing Samples:', results.missing.slice(0, 10));
        }
    } catch (e) {
        console.error(e);
    }
}
run();
