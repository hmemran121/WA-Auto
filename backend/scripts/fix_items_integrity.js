const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), 'data.db');
console.log('Target DB:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all("SELECT id, items FROM orders", [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    console.log(`Analyzing ${rows.length} orders for data corruption...`);
    let fixedCount = 0;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        rows.forEach(row => {
            if (!row.items) return;
            
            try {
                let parsed = JSON.parse(row.items);
                let corruptionDetected = false;
                
                // If it parses to a string, it was double-encoded
                if (typeof parsed === 'string') {
                    console.log(`[CORRUPTION] Order #${row.id} is double-encoded. Repairing...`);
                    parsed = JSON.parse(parsed); // Parse again to get the array
                    corruptionDetected = true;
                }
                
                if (corruptionDetected && Array.isArray(parsed)) {
                    const fixedJson = JSON.stringify(parsed);
                    db.run("UPDATE orders SET items = ? WHERE id = ?", [fixedJson, row.id]);
                    fixedCount++;
                }
            } catch (e) {
                console.error(`[ERROR] Order #${row.id} has unparseable items!`, e.message);
            }
        });

        db.run("COMMIT", (err) => {
            if (err) {
                console.error("Failed to commit changes:", err);
            } else {
                console.log(`Success! Fixed ${fixedCount} corrupted orders.`);
            }
            db.close();
        });
    });
});
