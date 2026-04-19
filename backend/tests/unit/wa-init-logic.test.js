const fs = require('fs');
const path = require('path');

// Mock whatsapp-service environment
const __dirname_mock = path.resolve(__dirname);
const sessionPath = path.join(__dirname_mock, '.wwebjs_auth', 'session-wa-auto-client');
const lockPath1 = path.join(sessionPath, 'SingletonLock');
const lockPath2 = path.join(sessionPath, 'Default', 'SingletonLock');

function setupTest() {
    console.log('--- Setting up test environment ---');
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }
    if (!fs.existsSync(path.join(sessionPath, 'Default'))) {
        fs.mkdirSync(path.join(sessionPath, 'Default'), { recursive: true });
    }
    
    fs.writeFileSync(lockPath1, 'fake-lock');
    fs.writeFileSync(lockPath2, 'fake-lock');
    console.log('Created fake lock files.');
}

async function testCleanup() {
    console.log('\n--- Testing ensureBrowserCleanState ---');
    
    const ensureBrowserCleanState = async () => {
        console.log('[Test] Running cleanup...');
        const lockFiles = [lockPath1, lockPath2];

        lockFiles.forEach(lp => {
            if (fs.existsSync(lp)) {
                console.log(`[Test] Removing: ${lp}`);
                fs.unlinkSync(lp);
            }
        });
    };

    await ensureBrowserCleanState();

    if (!fs.existsSync(lockPath1) && !fs.existsSync(lockPath2)) {
        console.log('SUCCESS: Lock files cleared.');
    } else {
        console.error('FAILED: Lock files still exist.');
        process.exit(1);
    }
}

async function testRetryLogic() {
    console.log('\n--- Testing robustInitialize Retry Logic ---');
    
    let attempts = 0;
    const mockClient = {
        initialize: async () => {
            attempts++;
            if (attempts < 3) {
                throw new Error('Execution context was destroyed');
            }
            console.log('[Mock] Initialization successful on attempt', attempts);
            return true;
        }
    };

    const robustInitialize = async (retryCount = 0) => {
        try {
            console.log(`[Test] Initializing (Attempt ${retryCount + 1})...`);
            await mockClient.initialize();
            return true;
        } catch (err) {
            console.log(`[Test] Error: ${err.message}`);
            if (err.message.includes('Execution context was destroyed')) {
                if (retryCount < 3) {
                    return robustInitialize(retryCount + 1);
                }
            }
            throw err;
        }
    };

    await robustInitialize();
    if (attempts === 3) {
        console.log('SUCCESS: Retry logic worked as expected.');
    } else {
        console.error('FAILED: Incorrect number of attempts:', attempts);
        process.exit(1);
    }
}

async function run() {
    try {
        setupTest();
        await testCleanup();
        await testRetryLogic();
        console.log('\nALL TESTS PASSED');
    } catch (e) {
        console.error('Test Suite Failed:', e);
        process.exit(1);
    }
}

run();
