/**
 * windowHelper.js
 * Centralized logic for timezone-aware execution windows
 */

'use strict';

/**
 * Calculates window status based on timezone offset
 * @param {Array} windows Array of { start: "HH:mm", end: "HH:mm" }
 * @param {number} offsetMinutes Timezone offset from UTC in minutes (e.g., 360 for +6)
 * @returns {Object} { isOpen, currentEvaluationTime, nextOpeningAt, msUntilOpen }
 */
const getWindowStatus = (windows, offsetMinutes = 0) => {
    if (!windows || windows.length === 0) {
        return { isOpen: true, currentEvaluationTime: null, nextOpeningAt: null, msUntilOpen: 0 };
    }

    // 1. Get current time mapped absolutely to the Target Timezone (ignoring Server Local Time)
    const targetDate = new Date(Date.now() + (offsetMinutes * 60000));

    // Use exclusively UTC getters to avoid NodeJS falling back to local server timezone shift
    const currentH = targetDate.getUTCHours();
    const currentM = targetDate.getUTCMinutes();
    const currentTimeMinutes = currentH * 60 + currentM;

    const evaluationTimeStr = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;

    // 2. Check if inside any window (Supporting Overnight ranges e.g. 22:00 to 06:00)
    let isOpen = false;
    for (const w of windows) {
        const [startH, startM] = w.start.split(':').map(Number);
        const [endH, endM] = w.end.split(':').map(Number);
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        if (startTotal <= endTotal) {
            // Standard Daytime Window (e.g. 09:00 to 17:00)
            if (currentTimeMinutes >= startTotal && currentTimeMinutes <= endTotal) {
                isOpen = true;
                break;
            }
        } else {
            // Overnight Window spanning midnight (e.g. 22:00 to 06:00)
            if (currentTimeMinutes >= startTotal || currentTimeMinutes <= endTotal) {
                isOpen = true;
                break;
            }
        }
    }

    if (isOpen) {
        return { isOpen: true, currentEvaluationTime: evaluationTimeStr, nextOpeningAt: null, msUntilOpen: 0 };
    }

    // 3. Find next opening time (Iterate through all ranges to find the closest upcoming mathematically)
    let nextOpenMinutes = null;
    let isTomorrow = false;

    // We only care about when the window OPENS for the "Wait Time"
    const sortedStarts = [...windows].map(w => {
        const [h, m] = w.start.split(':').map(Number);
        return h * 60 + m;
    }).sort((a, b) => a - b);

    // Find first window that starts specifically AFTER the current time today
    for (const startTotal of sortedStarts) {
        if (startTotal > currentTimeMinutes) {
            nextOpenMinutes = startTotal;
            break;
        }
    }

    // If no window starts after the current time today, we must wait for the absolute earliest window tomorrow
    if (nextOpenMinutes === null) {
        nextOpenMinutes = sortedStarts[0];
        isTomorrow = true;
    }

    // Calculate MS until open
    let minutesUntil = 0;
    if (isTomorrow) {
        minutesUntil = (1440 - currentTimeMinutes) + nextOpenMinutes;
    } else {
        minutesUntil = nextOpenMinutes - currentTimeMinutes;
    }

    // Subtract targetDate's seconds and ms for exact sync precision
    const msToStartOfMinute = (60 - targetDate.getUTCSeconds()) * 1000 - targetDate.getUTCMilliseconds();
    const msUntilOpen = (minutesUntil - 1) * 60000 + msToStartOfMinute;

    const nextH = Math.floor(nextOpenMinutes / 60);
    const nextM = nextOpenMinutes % 60;
    const nextOpeningAt = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}${isTomorrow ? ' (Tomorrow)' : ''}`;

    return {
        isOpen: false,
        currentEvaluationTime: evaluationTimeStr,
        nextOpeningAt,
        msUntilOpen: Math.max(0, msUntilOpen)
    };
};

module.exports = { getWindowStatus };
