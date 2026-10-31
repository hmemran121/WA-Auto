const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

async function resetOrders() {
    console.log("🚀 Starting Order History Reset...");

    const tablesToClear = ['orders', 'order_payments', 'order_logs'];

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            try {
                for (const table of tablesToClear) {
                    db.run(`DELETE FROM ${table}`, (err) => {
                        if (err) {
                            if (err.message.includes('no such table')) {
                                console.log(`⚠️ Table ${table} does not exist, skipping.`);
                            } else {
                                throw err;
                            }
                        } else {
                            console.log(`✅ Cleared table: ${table}`);
                        }
                    });
                }

                // Also reset customer order-related metadata for consistency
                console.log("🔄 Resetting customer order-related metrics...");
                db.run(`
                    UPDATE customers 
                    SET lifetime_value = 0, 
                        last_purchase = NULL, 
                        lifecycle_stage = 'lead',
                        previous_due = 0
                `, (err) => {
                    if (err) console.error("❌ Failed to reset customer metrics:", err.message);
                    else console.log("✅ Customer metrics reset.");
                });

                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error("❌ Transaction failed, rolling back:", err.message);
                        db.run('ROLLBACK');
                        reject(err);
                    } else {
                        console.log("🏁 Order history successfully cleared!");
                        resolve();
                    }
                });
            } catch (error) {
                console.error("❌ Error during reset:", error.message);
                db.run('ROLLBACK');
                reject(error);
            }
        });
    });
}

resetOrders()
    .then(() => {
        db.run('VACUUM'); // Reclaim space
        db.close();
    })
    .catch((err) => {
        console.error(err);
        db.close();
        process.exit(1);
    });
