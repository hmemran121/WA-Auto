const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEM_THRESHOLD_MB = 800; // Limit for individual node processes
const CHECK_INTERVAL_MS = 60000; // 1 minute

console.log('🚀 [Resource-Watchdog] Active. Monitoring system pulse...');

const cleanupZombies = () => {
    console.log('🧹 [Watchdog] Hunting for zombie browser processes...');
    if (process.platform === 'win32') {
        try {
            // Kill any chrome/chromium that doesn't belong to an active session
            // or is orphaned (no parent or parent is gone)
            execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name LIKE \'%chrome%\' OR Name LIKE \'%chromium%\'\\" | Where-Object { $_.CommandLine -like \'*session-wa-auto-client*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"');
        } catch (e) {}
    }
};

const clearFileLocks = () => {
    const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session-wa-auto-client');
    if (fs.existsSync(sessionPath)) {
        const locks = ['SingletonLock', 'DevToolsActivePort'];
        locks.forEach(lock => {
            const lockPath = path.join(sessionPath, lock);
            if (fs.existsSync(lockPath)) {
                try {
                    fs.unlinkSync(lockPath);
                    console.log(`✅ [Watchdog] Cleared stale lock: ${lock}`);
                } catch (e) {}
            }
        });
    }
};

const monitorMemory = () => {
    // This is a simple version. In a real smart system, we'd use 'tree-kill' or 'pstree'
    // For now, we'll just log and rely on the services' internal GC if we enable --expose-gc
    const usage = process.memoryUsage();
    const rss = Math.round(usage.rss / 1024 / 1024);
    
    if (rss > MEM_THRESHOLD_MB) {
        console.warn(`⚠️ [Watchdog] High Memory Detected: ${rss}MB. Requesting Global GC...`);
        if (global.gc) {
            global.gc();
        }
    }
};

// Initial cleanup
cleanupZombies();
clearFileLocks();

// Periodic tasks
setInterval(monitorMemory, CHECK_INTERVAL_MS);
setInterval(cleanupZombies, 1000 * 60 * 60); // Every hour
setInterval(clearFileLocks, 1000 * 60 * 30); // Every 30 mins

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
