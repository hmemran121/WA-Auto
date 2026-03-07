process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../../server');
const db = require('../../db');

describe('Templates API Integration Tests', () => {
    let testTemplateId;

    beforeAll(async () => {
        // Wait a bit for DB init if necessary
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        if (db.close) {
            await db.close();
        }
    });

    it('should create a new template', async () => {
        const res = await request(app)
            .post('/api/templates')
            .send({
                title: 'Test Template',
                content: 'Hello {{name}}, this is a test.',
                category: 'Test'
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBeDefined();
        testTemplateId = res.body.id;
    });

    it('should get all templates', async () => {
        const res = await request(app).get('/api/templates');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBe(true);
        const template = res.body.find(t => t.id === testTemplateId);
        expect(template).toBeDefined();
        expect(template.title).toBe('Test Template');
    });

    it('should get a specific template by id', async () => {
        const res = await request(app).get(`/api/templates/${testTemplateId}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.template.title).toBe('Test Template');
    });

    it('should update a template', async () => {
        const res = await request(app)
            .put(`/api/templates/${testTemplateId}`)
            .send({
                title: 'Updated Test Template',
                content: 'Updated content',
                category: 'Test Update'
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);

        const checkRes = await request(app).get(`/api/templates/${testTemplateId}`);
        expect(checkRes.body.template.title).toBe('Updated Test Template');
    });

    it('should delete a template', async () => {
        const res = await request(app).delete(`/api/templates/${testTemplateId}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);

        const checkRes = await request(app).get(`/api/templates/${testTemplateId}`);
        expect(checkRes.statusCode).toEqual(404);
    });

    it('should return 400 when creating template without title', async () => {
        const res = await request(app)
            .post('/api/templates')
            .send({
                content: 'No title'
            });
        expect(res.statusCode).toEqual(400);
    });
});
