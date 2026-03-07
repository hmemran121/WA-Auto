/**
 * Determines if the current local time falls within any of the provided time windows.
 * Assumes the windows are provided in local time "HH:MM" format.
 */
export const isCurrentlyInsideActiveWindow = (
    windows: { start: string, end: string }[],
    globalEnableWindows: string = 'true',
    timezoneOffsetHours: number = 0 // Synchronized with db settings.timezone_offset
): boolean => {
    // If windows are globally disabled or no windows exist, we are "outside" (or don't enforce)
    if (globalEnableWindows === 'false' || !windows || windows.length === 0) return false;

    // Use pure UTC basis + Admin's DB offset to prevent Browser-vs-Server Drift
    const nowUtc = new Date();
    const serverDriftedNow = new Date(nowUtc.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));

    const currentH = serverDriftedNow.getUTCHours();
    const currentM = serverDriftedNow.getUTCMinutes();
    const currentTimeMinutes = currentH * 60 + currentM;

    for (const w of windows) {
        if (!w.start || !w.end) continue;
        const [sh, sm] = w.start.split(':').map(Number);
        const [eh, em] = w.end.split(':').map(Number);
        const startTotal = sh * 60 + sm;
        const endTotal = eh * 60 + em;

        if (startTotal <= endTotal) {
            // Standard Daytime Window (e.g. 09:00 to 17:00)
            if (currentTimeMinutes >= startTotal && currentTimeMinutes <= endTotal) {
                return true;
            }
        } else {
            // Overnight Window spanning midnight (e.g. 22:00 to 06:00)
            if (currentTimeMinutes >= startTotal || currentTimeMinutes <= endTotal) {
                return true;
            }
        }
    }

    return false;
};
