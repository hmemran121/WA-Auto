
// FORCE TEST MODE
process.env.NODE_ENV = 'test';
process.env.JEST_WORKER_ID = '2'; // Unique ID for real-data test

const db = require('../../db');
const CampaignService = require('../../campaign-service');
const windowHelper = require('../../utils/windowHelper');

// Mock windowHelper to be always open for real data test
jest.mock('../../utils/windowHelper', () => ({
    getWindowStatus: jest.fn().mockReturnValue({ isOpen: true, msUntilOpen: 0 })
}));

let mockIo;
let cancelledProcesses;
let pausedProcesses;
let service;

// Helper to wait for a specific emission with data capture
const waitForEmit = async (mockFunc, title, statusDetail, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const found = mockFunc.mock.calls.find(call =>
            call[0] === title && (!statusDetail || call[1].statusDetail === statusDetail)
        );
        if (found) return found[1];
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for emit ${title} (status: ${statusDetail})`);
};

describe('Real Data Integration - Scheduled Campaign Flows', () => {
    beforeEach(async () => {
        mockIo = {
            emit: jest.fn(),
            on: jest.fn()
        };
        cancelledProcesses = new Map();
        pausedProcesses = new Map();
        service = new CampaignService(mockIo, db, cancelledProcesses, pausedProcesses);
    });

    afterEach(async () => {
        jest.clearAllMocks();
    });

    // Cleanup: Ensure test executions are removed from DB
    afterAll(async () => {
        await db.removeActiveExecution('real-text-test');
        await db.removeActiveExecution('real-media-test');
        await db.removeActiveExecution('real-voice-test');
        await db.removeActiveExecution('real-vcard-test');
    });

    const TEST_GROUP_ID = 3;
    const TEMPLATE_IDS = {
        text: 13,   // Ai Ramadan Spintax
        media: 5,   // Multi-Med_with_desc
        voice: 7,   // Voice Temp
        vcard: 12   // vCard
    };

    it('Scenario 1: AI Ramadan Spintax (Text/Spintax)', async () => {
        const groupContacts = await db.getContactsByGroup(TEST_GROUP_ID);
        const template = await db.getTemplateById(TEMPLATE_IDS.text);

        expect(groupContacts.length).toBeGreaterThan(0);
        expect(template).toBeDefined();

        const data = {
            targets: groupContacts,
            text: template.content,
            templateId: template.id,
            delayMin: 10,
            delayMax: 20,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('real-text-test', data);

        // Verify spintax was parsed (check service_send_message call)
        const sendCall = mockIo.emit.mock.calls.find(c => c[0] === 'service_send_message');
        expect(sendCall).toBeDefined();
        const sentText = sendCall[1].text;

        // Spintax check: ensure no curly braces remain
        expect(sentText).not.toMatch(/{|}/);
        console.log(`[REAL-DATA-TEST] Sent Text (Spintax Parsed): ${sentText}`);
    });

    it('Scenario 2: Multi-Med_with_desc (Media + Caption)', async () => {
        const groupContacts = await db.getContactsByGroup(TEST_GROUP_ID);
        const template = await db.getTemplateById(TEMPLATE_IDS.media);

        const data = {
            targets: [groupContacts[0]], // Single target for quick test
            text: template.content,
            templateId: template.id,
            attachments: template.attachments,
            delayMin: 10,
            delayMax: 20,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('real-media-test', data);

        const sendCall = mockIo.emit.mock.calls.find(c => c[0] === 'service_send_message');
        expect(sendCall).toBeDefined();
        expect(sendCall[1].attachments.length).toBeGreaterThan(0);
        expect(sendCall[1].text).toBe(template.content);
        console.log(`[REAL-DATA-TEST] Sent Media with Caption: ${template.content}`);
    });

    it('Scenario 3: Voice Temp (Audio/PTT)', async () => {
        const groupContacts = await db.getContactsByGroup(TEST_GROUP_ID);
        const template = await db.getTemplateById(TEMPLATE_IDS.voice);

        const data = {
            targets: [groupContacts[0]],
            text: template.content,
            templateId: template.id,
            attachments: template.attachments,
            delayMin: 10,
            delayMax: 20,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('real-voice-test', data);

        const sendCall = mockIo.emit.mock.calls.find(c => c[0] === 'service_send_message');
        expect(sendCall).toBeDefined();
        // For voice, ensure attachments exist and media type reflects audio
        expect(sendCall[1].attachments[0].type).toMatch(/audio|voice/i);
        console.log(`[REAL-DATA-TEST] Sent Voice Note (ID: ${template.id})`);
    });

    it('Scenario 4: vCard (Contact Card)', async () => {
        const groupContacts = await db.getContactsByGroup(TEST_GROUP_ID);
        const template = await db.getTemplateById(TEMPLATE_IDS.vcard);

        const data = {
            targets: [groupContacts[0]],
            text: template.content,
            templateId: template.id,
            attachments: template.attachments,
            delayMin: 10,
            delayMax: 20,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('real-vcard-test', data);

        const sendCall = mockIo.emit.mock.calls.find(c => c[0] === 'service_send_message');
        expect(sendCall).toBeDefined();
        expect(sendCall[1].attachments[0].type).toBe('vcard');
        console.log(`[REAL-DATA-TEST] Sent vCard Attachment`);
    });
});
