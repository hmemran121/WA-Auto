const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// Since this script will be run from inside the backend directory
const db = new sqlite3.Database(path.join(__dirname, 'data.db'));

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
    let completed = 0;
    productsToCheck.forEach(name => {
        db.get('SELECT name FROM intelligent_product_catalog WHERE name LIKE ?', [`%${name}%`], (err, row) => {
            completed++;
            if (err) {
                console.error(`Error checking ${name}:`, err.message);
            } else if (row) {
                console.log(`[FOUND] ${name} (Matches: ${row.name})`);
            } else {
                console.log(`[MISSING] ${name}`);
            }
            if (completed === productsToCheck.length) {
                db.close();
            }
        });
    });
});
