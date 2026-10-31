
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');
const db = require('../db');
const fs = require('fs');
const path = require('path');

// Mock WhatsApp Service to prevent real messages
jest.mock('../whatsapp-service', () => ({
    sendMessage: jest.fn().mockResolvedValue({ id: 'mock_msg_id' }),
    getState: jest.fn().mockReturnValue('ready')
}));

describe('OMS Logic Integrity Suite (QA STRICT MODE)', () => {
    const testCustomer = '8801700000000';
    
    beforeAll(async () => {
        // Ensure we are using test_data.db and it's clean
        // db.js handles the path based on NODE_ENV
        await new Promise(r => setTimeout(r, 1000)); // Wait for DB init
    });

    beforeEach(async () => {
        // Clean up tables for fresh test
        const tables = ['orders', 'customers', 'order_payments', 'outgoing_queue'];
        for (const table of tables) {
            await new Promise((resolve) => db.run(`DELETE FROM ${table}`, () => resolve()));
        }
    });

    /**
     * 🧩 SCENARIO A: The Smart Merge Engine
     */
    test('Scenario A: Should merge items from a pending order into a new order', async () => {
        // 1. Create first order
        const res1 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                customer_name: 'Test User',
                items: [{ id: 1, name: 'Item 1', qty: 1, price: 100 }],
                total_amount: 100
            });
        
        const orderId1 = res1.body.order.id;
        expect(res1.body.success).toBe(true);

        // 2. Create second order for same customer
        const res2 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 2, name: 'Item 2', qty: 1, price: 200 }],
                total_amount: 200
            });
        
        const orderId2 = res2.body.order.id;
        expect(res2.body.success).toBe(true);

        // 3. Verify Order 1 is merged
        const order1 = await request(app).get(`/api/oms/orders/${orderId1}`);
        expect(order1.body.order.status).toBe('merged');
        expect(order1.body.order.order_notes).toContain(`Successor Master Order: #${orderId2}`);

        // 4. Verify Order 2 has combined items
        const order2Items = JSON.parse(res2.body.order.items);
        expect(order2Items.length).toBe(2);
        expect(order2Items.some(i => i.name === 'Item 1')).toBe(true);
        expect(order2Items.some(i => i.name === 'Item 2')).toBe(true);
    });

    /**
     * 💰 SCENARIO B: Debt Transfer & Auto-Settlement
     */
    test('Scenario B: Should transfer debt to new order and auto-settle when paid', async () => {
        // 1. Create Order 1 and mark as delivered with balance
        const res1 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 1, name: 'Item 1', qty: 1, price: 500 }],
                total_amount: 500
            });
        
        const orderId1 = res1.body.order.id;
        
        // Update to delivered (This adds to customer previous_due)
        await request(app)
            .patch(`/api/oms/orders/${orderId1}/status`)
            .send({ status: 'delivered' });
        
        // Verify customer has debt
        const customer = await db.getCustomerByNumber(testCustomer);
        expect(customer.previous_due).toBe(500);

        // 2. Create Order 2 (Should pick up the 500 debt)
        const res2 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 2, name: 'Item 2', qty: 1, price: 300 }],
                total_amount: 800 // 300 + 500 debt
            });
        
        const orderId2 = res2.body.order.id;
        expect(res2.body.order.due_added).toBe(500);

        // 3. Pay Order 2 (৳800)
        await request(app)
            .patch(`/api/oms/orders/${orderId2}/payment`)
            .send({
                payment_status: 'paid',
                amount_paid: 800,
                method: 'cash'
            });
        
        // 4. Verify Order 1 is auto-settled
        const order1 = await request(app).get(`/api/oms/orders/${orderId1}`);
        expect(order1.body.order.payment_status).toBe('paid');
        expect(order1.body.order.amount_paid).toBe(500);
        expect(order1.body.order.order_notes).toContain(`[Auto-Settled] ৳500 settled via payment in New Order #${orderId2}`);
    });

    /**
     * 🔄 SCENARIO C: Debt Restoration
     */
    test('Scenario C: Should restore debt if the successor order is cancelled', async () => {
        // 1. Create Order 1 (Delivered, unpaid)
        const res1 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 1, name: 'Item 1', qty: 1, price: 1000 }],
                total_amount: 1000
            });
        const orderId1 = res1.body.order.id;
        await request(app).patch(`/api/oms/orders/${orderId1}/status`).send({ status: 'delivered' });

        // 2. Create Order 2 (Transfers debt)
        const res2 = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 2, name: 'Item 2', qty: 1, price: 500 }],
                total_amount: 1500
            });
        const orderId2 = res2.body.order.id;

        // 3. Cancel Order 2
        await request(app).patch(`/api/oms/orders/${orderId2}/status`).send({ status: 'cancelled' });

        // 4. Verify Order 1 notes for restoration
        const order1 = await request(app).get(`/api/oms/orders/${orderId1}`);
        expect(order1.body.order.order_notes).toContain(`[Debt Restored]`);
        
        // Verify customer debt is back to 1000
        const customer = await db.getCustomerByNumber(testCustomer);
        expect(customer.previous_due).toBe(1000);
    });

    /**
     * 📊 SCENARIO D: LTV Integration
     */
    test('Scenario D: Should update Lifetime Value (LTV) correctly', async () => {
        // 1. Complete an order
        const res = await request(app)
            .post('/api/oms/orders')
            .send({
                customer_number: testCustomer,
                items: [{ id: 1, name: 'Item 1', qty: 1, price: 1000 }],
                total_amount: 1000,
                shipping_address: 'Test Address'
            });
        const orderId = res.body.order.id;
        
        await request(app).patch(`/api/oms/orders/${orderId}/status`).send({ status: 'delivered' });

        // 2. Verify LTV
        let customer = await db.getCustomerByNumber(testCustomer);
        expect(customer.lifetime_value).toBe(1000);

        // 3. Cancel the order
        await request(app).patch(`/api/oms/orders/${orderId}/status`).send({ status: 'cancelled' });

        // 4. Verify LTV reset
        customer = await db.getCustomerByNumber(testCustomer);
        expect(customer.lifetime_value).toBe(0);
    });
});
