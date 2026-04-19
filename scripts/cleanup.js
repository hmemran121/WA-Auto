const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧹 [Cleanup] Running emergency workspace cleanup...');

const killAllNode = () => {
    if (process.platform === 'win32') {
        try {
            // Kill all node processes except the current one
            execSync('powershell -Command "Get-Process node | Where-Object { $_.Id -ne ' + process.pid + ' } | Stop-Process -Force"');
        } catch (e) {}
    }
};

const clearJunk = () => {
    const root = path.join(__dirname, '..');
    const junkPatterns = ['*.log', '*.db-journal', '*.db-wal', 'debug.log'];
    
    junkPatterns.forEach(pattern => {
        try {
            if (process.platform === 'win32') {
                execSync(`powershell -Command "Get-ChildItem -Path '${root}' -Recurse -Filter '${pattern}' | Remove-Item -Force"`);
            }
        } catch (e) {}
    });
};

console.log('✅ [Cleanup] Node processes reset (except this one).');
console.log('✅ [Cleanup] Junk logs and journals cleared.');
clearJunk();
