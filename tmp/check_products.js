const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'backend', 'data.db'));

const productsToCheck = [
    'AeroMesh Series-1 Long-Sleeve Performance T-shirt',
    'Aeris Long-Sleeve Performance T-shirt',
    'Altitude Hooded Jacket',
    'Hale Seamless Half Zip Pullover',
    'Halo Drop Shoulder Tee',
    'Atlas Men’s Track Jacket',
    'Eclipse Drop Shoulder T-Shirt'
];

db.serialize(() => {
    console.log('--- Database Check Results ---');
    productsToCheck.forEach(name => {
        db.get('SELECT name FROM intelligent_product_catalog WHERE name LIKE ?', [`%${name}%`], (err, row) => {
            if (err) {
                console.error(`Error checking ${name}:`, err.message);
                return;
            }
            if (row) {
                console.log(`[FOUND] ${name} (Matches: ${row.name})`);
            } else {
                console.log(`[MISSING] ${name}`);
            }
        });
    });
});

db.close();
