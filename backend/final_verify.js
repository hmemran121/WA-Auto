const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.all(`
    SELECT id, name, variants 
    FROM intelligent_product_catalog 
    WHERE id IN (4438, 4500, 4751)
`, [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    rows.forEach(row => {
        console.log(`--- ID: ${row.id} | ${row.name} ---`);
        try {
            const v = JSON.parse(row.variants);
            console.log(`Items: ${v.items.length}`);
            console.log(`First item: ${JSON.stringify(v.items[0])}`);
            console.log(`Sizes: ${v.sizes.join(', ')}`);
        } catch (e) {
            console.log(`Error parsing JSON: ${e.message}`);
        }
        console.log("");
    });
    db.close();
});
