const db = require('./backend/db');
const http = require('http');

async function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', (err) => reject(err));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log('🚀 Starting Bulk Selection Test...');

    try {
        // 1. Insert test products
        console.log('   Inserting 5 test products...');
        for (let i = 1; i <= 5; i++) {
            await db.addAIProduct({
                name: `Test Selection ${i} ${i % 2 === 0 ? 'Blue' : 'Red'}`,
                price: '1000 Tk',
                description: `Description for product ${i}`,
                sku: `TEST-SEL-${1000 + i}`
            });
        }

        // 2. Verify total count
        const initialTotal = await db.countAIProducts();
        console.log(`   Initial total: ${initialTotal}`);

        const apiOptions = {
            hostname: 'localhost',
            port: 3001,
            path: '/api/ai-brain/products/bulk-delete',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };

        // 3. Test filter-based deletion (Red products)
        console.log('   Testing filtered bulk delete (Red)...');
        await request(apiOptions, {
            selectionMode: 'filter',
            filter: { search: 'Red' }
        });

        const afterRedTotal = await db.countAIProducts();
        console.log(`   Total after deleting Red: ${afterRedTotal}`);

        // 4. Test global selection delete (All matching 'Test Selection')
        console.log('   Testing global bulk delete (Test Selection)...');
        await request(apiOptions, {
            selectionMode: 'filter',
            filter: { search: 'Test Selection' }
        });

        const finalTotal = await db.countAIProducts();
        console.log(`   Final total products: ${finalTotal}`);

        if (finalTotal < initialTotal) {
            console.log('✅ Bulk Selection logic verified successfully!');
        } else {
            console.log('❌ Bulk Selection logic verification failed!');
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        // Cleanup remaining Test Selection items
        await db.bulkDeleteAIProductsByFilter({ search: 'Test Selection' });
        process.exit();
    }
}

runTest();
