// FORCE TEST MODE
process.env.NODE_ENV = 'test';
process.env.JEST_WORKER_ID = '3';

const CampaignService = require('../../campaign-service');

// Mock MUST be at the absolute top for hoisting
jest.mock('../../utils/windowHelper', () => ({
    getWindowStatus: jest.fn().mockReturnValue({ isOpen: true, msUntilOpen: 0 })
}));

describe('Direct Launch - Enterprise Bulk/Load Test', () => {
    let mockIo;
    let mockDb;
    let cancelledProcesses;
    let pausedProcesses;
    let service;

    beforeEach(() => {
        mockIo = {
            emit: jest.fn(),
            on: jest.fn()
        };
        // Mock DB heavily for load performance
        mockDb = {
            getAllSettings: jest.fn().mockResolvedValue({
                enable_batching: 'true',
                batch_min: 50,
                batch_max: 100,
                enable_jitter: 'true',
                enable_windows: 'false',
                scheduler_delay_min_ms: '5',
                scheduler_delay_max_ms: '10'
            }),
            isDailyLimitReached: jest.fn().mockResolvedValue({ reached: false, sent: 0, limit: 100000 }),
            saveActiveExecution: jest.fn().mockResolvedValue({}),
            removeActiveExecution: jest.fn().mockResolvedValue({}),
            updateActiveExecutionProgress: jest.fn().mockResolvedValue({}),
            createScheduledCampaign: jest.fn().mockResolvedValue({ id: 999 }),
            updateScheduledCampaignStatus: jest.fn().mockResolvedValue({})
        };
        cancelledProcesses = new Map();
        pausedProcesses = new Map();
        service = new CampaignService(mockIo, mockDb, cancelledProcesses, pausedProcesses);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should gracefully handle 500 bulk targets without Memory Leaks', async () => {
        const TARGET_COUNT = 500;
        const targets = [];
        for (let i = 0; i < TARGET_COUNT; i++) {
            targets.push({
                name: `Load User ${i}`,
                phone: `880170000${String(i).padStart(4, '0')}`
            });
        }

        const data = {
            targets,
            text: 'Hello {{name}}, this is bulk test! {A|B|C}',
            delayMin: 2, // Will hit HARD_MIN_DELAY of 10ms in test mode
            delayMax: 5,
            respectExecutionWindows: false
        };

        const initialMemory = process.memoryUsage().heapUsed;

        // Run the bulk campaign
        await service.runInstantCampaign('bulk-test-1', data);

        const finalMemory = process.memoryUsage().heapUsed;
        const diffMB = (finalMemory - initialMemory) / 1024 / 1024;

        console.log(`[BULK TEST] Processed ${TARGET_COUNT} targets. Memory Diff: ${diffMB.toFixed(2)} MB`);

        // Assertions
        const sendCalls = mockIo.emit.mock.calls.filter(c => c[0] === 'service_send_message');
        expect(sendCalls.length).toBe(TARGET_COUNT);

        // Verify Spintax and Variables on the last sent message
        const lastCall = sendCalls[TARGET_COUNT - 1];
        expect(lastCall[1].text).toMatch(/Hello Load User 499/);
        expect(lastCall[1].text).not.toMatch(/{|}/);

        // Verify completion emission
        const endCall = mockIo.emit.mock.calls.find(c => c[0] === 'process_end');
        expect(endCall).toBeDefined();
        expect(endCall[1].status).toBe('completed');
        expect(endCall[1].message).toMatch(new RegExp(`${TARGET_COUNT} messages sent`));

        // Memory leak check (allow up to 100MB growth during test, V8 GC is lazy)
        expect(diffMB).toBeLessThan(100);
    }, 300000); // Allow up to 300 seconds for 2500 items
});
