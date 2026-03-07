
// FORCE TEST MODE BEFORE ANY REQUIRES
process.env.NODE_ENV = 'test';
process.env.JEST_WORKER_ID = '1';

// Mock MUST be at the absolute top for hoisting
jest.mock('../../utils/windowHelper', () => ({
    getWindowStatus: jest.fn()
}));

const windowHelper = require('../../utils/windowHelper');
const CampaignService = require('../../campaign-service');

let mockIo;
let mockDb;
let cancelledProcesses;
let pausedProcesses;
let service;

// Helper to wait for a specific emission
const waitForEmit = async (mockFunc, title, statusDetail, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const found = mockFunc.mock.calls.some(call =>
            call[0] === title && (!statusDetail || call[1].statusDetail === statusDetail)
        );
        if (found) return;
        await new Promise(r => setTimeout(r, 50));
    }
    console.log(`[DEBUG] All emits for ${title}:`, JSON.stringify(mockFunc.mock.calls));
    throw new Error(`Timed out waiting for emit ${title} (status: ${statusDetail})`);
};

describe('Scheduled Campaign Flow Integration Tests', () => {
    beforeEach(() => {
        mockIo = {
            emit: jest.fn(),
            on: jest.fn()
        };
        mockDb = {
            getAllSettings: jest.fn().mockResolvedValue({
                enable_batching: 'true',
                batch_min: 2,
                batch_max: 2,
                enable_jitter: 'true',
                enable_windows: 'true',
                scheduler_delay_min_ms: '10',
                scheduler_delay_max_ms: '20'
            }),
            isDailyLimitReached: jest.fn().mockResolvedValue({ reached: false, sent: 0, limit: 100 }),
            saveActiveExecution: jest.fn().mockResolvedValue({}),
            removeActiveExecution: jest.fn().mockResolvedValue({}),
            updateActiveExecutionProgress: jest.fn().mockResolvedValue({}),
            getTemplateInteractionDetails: jest.fn().mockResolvedValue([]),
            getActiveExecutions: jest.fn().mockResolvedValue([])
        };
        cancelledProcesses = new Map();
        pausedProcesses = new Map();
        service = new CampaignService(mockIo, mockDb, cancelledProcesses, pausedProcesses);

        // Reset mock
        windowHelper.getWindowStatus.mockReset();
        windowHelper.getWindowStatus.mockReturnValue({ isOpen: true, msUntilOpen: 0 });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should handle Human Jitter by waiting between sends', async () => {
        const data = {
            targets: [{ name: 'User 1', phone: '123' }, { name: 'User 2', phone: '456' }],
            text: 'Hello {{name}}',
            delayMin: 10,
            delayMax: 20,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('test-jitter', data);

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            statusDetail: 'jitter_wait'
        }));
    });

    it('should stop campaign when Daily Quota is reached', async () => {
        mockDb.isDailyLimitReached
            .mockResolvedValueOnce({ reached: false, sent: 0, limit: 10 })
            .mockResolvedValue({ reached: true, sent: 10, limit: 10 });

        const data = {
            targets: Array(15).fill({ name: 'User', phone: '123' }),
            text: 'Hello',
            delayMin: 5,
            delayMax: 10,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('test-quota', data);

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('Daily Quota Reached')
        }));
    });

    it('should respect Pause and Resume commands', async () => {
        const data = {
            targets: Array(3).fill({ name: 'User', phone: '123' }),
            text: 'Test Pause',
            delayMin: 500,
            delayMax: 500,
            respectExecutionWindows: false
        };

        const runPromise = service.runInstantCampaign('test-pause', data);

        // Wait for first message send update
        await waitForEmit(mockIo.emit, 'process_update');

        // Pause it
        pausedProcesses.set('test-pause', true);

        // Wait for heartbeat to catch it during jitter
        await waitForEmit(mockIo.emit, 'process_update', 'paused');

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            statusDetail: 'paused'
        }));

        pausedProcesses.delete('test-pause');
        await runPromise;

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            statusDetail: 'active'
        }));
    });

    it('should handle Smart Batching and Take Breaks', async () => {
        mockDb.getAllSettings.mockResolvedValue({
            enable_batching: 'true',
            batch_min: 2,
            batch_max: 2,
            break_min_ms: 1,
            break_max_ms: 2,
            enable_jitter: 'true',
            enable_windows: 'false'
        });

        const data = {
            targets: Array(6).fill({ name: 'U', phone: '1' }),
            text: 'Batch Test',
            delayMin: 1,
            delayMax: 2,
            respectExecutionWindows: false
        };

        await service.runInstantCampaign('test-batch', data);

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            statusDetail: 'batch_break'
        }));
    });

    it('should wait when outside Safety Windows', async () => {
        // Mock closed
        windowHelper.getWindowStatus.mockReturnValueOnce({ isOpen: false, msUntilOpen: 100, nextOpeningAt: '09:00' });

        const data = {
            targets: [{ name: 'U1', phone: '1' }],
            text: 'Window Test',
            delayMin: 1,
            delayMax: 2,
            respectExecutionWindows: true
        };

        const runPromise = service.runInstantCampaign('test-window', data);

        // Wait for loop to hit wait block
        await waitForEmit(mockIo.emit, 'process_update', 'window_wait');

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            statusDetail: 'window_wait'
        }));

        // Now open it
        windowHelper.getWindowStatus.mockReturnValue({ isOpen: true, msUntilOpen: 0 });

        await runPromise;

        expect(mockIo.emit).toHaveBeenCalledWith('process_update', expect.objectContaining({
            statusDetail: 'running'
        }));
    });
});
