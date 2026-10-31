
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');
const db = require('../db');

describe('OMS Merge Payment Integrity (Audit for Order #18)', () => {
    const testCustomer = '8801712345678';
    
    beforeAll(async () => {
        await new Promise(r => setTimeout(r, 500));
    });

    beforeEach(async () => {
        const tables = ['orders', 'customers', 'order_payments', 'order_logs'];
        for (const table of tables) {
            await new Promise((resolve) => db.run(`DELETE FROM ${table}`, () => resolve()));
        }
    });

    test('Should NOT lose existing payments when orders are merged', async () => {
        // 1. Create Order 1 (Total 1000)
        const res1 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                customer_name: 'Audit User',
                items: [{ id: 101, name: 'Item A', qty: 1, price: 1000 }],
                total_amount: 1000,
                shipping_address: 'Dhaka, Bangladesh'
            });
        const orderId1 = res1.body.order.id;

        // 2. Pay ৳200 on Order 1
        await request(app)
            .patch(`/api/oms/orders/${orderId1}/payment`)
            .send({
                amount: 200,
                method: 'bkash',
                notes: 'Initial payment on Order 1'
            });

        // 3. Create Order 2 (Total 500) for same address (Triggers Merge)
        const res2 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 102, name: 'Item B', qty: 1, price: 500 }],
                total_amount: 500,
                shipping_address: 'Dhaka, Bangladesh'
            });
        const orderId2 = res2.body.order.id;

        // 4. Audit Order 2 (The Master)
        const masterRes = await request(app).get(`/api/oms/orders/${orderId2}`);
        const master = masterRes.body.order;

        console.log(`[Audit] Master Order #${orderId2} Total: ${master.total_amount}`);
        console.log(`[Audit] Master Order #${orderId2} Paid: ${master.amount_paid}`);

        // EXPECTATIONS:
        // Total should be 1500 (1000 from Order 1 + 500 from Order 2)
        expect(master.total_amount).toContain('1500');
        
        // Paid should be 200 (Transferred from Order 1)
        // BUG EXPECTED: This will likely be 0 in current implementation
        expect(Number(master.amount_paid)).toBe(200);

        // Verify Order 2 has a linked payment record in its history
        const paymentsRes = await request(app).get(`/api/oms/orders/${orderId2}/payments`);
        expect(paymentsRes.body.payments.some(p => p.amount === 200)).toBe(true);
    });
});
