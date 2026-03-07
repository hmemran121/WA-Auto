const PNF = require('google-libphonenumber').PhoneNumberFormat;
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();

const isValidPhoneNumber = (number) => {
    if (!number || typeof number !== 'string') return false;
    let cleaned = number.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);

    const regions = ['BD', 'SA', 'MY', 'AE', 'GB', 'US'];

    try {
        // 1. Try as pure international (with + or auto-prepended +)
        const intlTry = cleaned.startsWith('+') ? cleaned : '+' + cleaned;
        const parsedIntl = phoneUtil.parse(intlTry);
        if (phoneUtil.isValidNumber(parsedIntl)) return true;

        // 2. Try regional fallbacks for common user locations
        for (const region of regions) {
            try {
                const parsed = phoneUtil.parseAndKeepRawInput(cleaned, region);
                if (phoneUtil.isValidNumber(parsed)) return true;
            } catch (e) { }
        }

        // 3. Last resort: If it's a "possible" number and length is reasonable (7-15)
        // This prevents discarding valid numbers that libphonenumber might be too strict about,
        // but still filters out the 14+ digit LIDs.
        if (cleaned.length >= 7 && cleaned.length <= 15) {
            const possibleIntl = phoneUtil.parse(cleaned.startsWith('+') ? cleaned : '+' + cleaned);
            if (phoneUtil.isPossibleNumber(possibleIntl)) return true;
        }

    } catch (e) { }

    return false;
};

/**
 * Intelligent and Dynamic phone number formatter (Production Grade)
 * @param {string} number - The raw number input
 * @param {string} defaultRegion - The default region code (e.g., 'BD')
 * @returns {string} - WhatsApp formatted number (e.g., '8801712345678')
 */
const formatNumber = (number, defaultRegion = 'BD') => {
    if (!number || typeof number !== 'string') return '';

    try {
        // 1. Initial Cleaning
        let cleaned = number.trim();
        cleaned = cleaned.replace(/[^\d+]/g, '');
        if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
        if (!cleaned) return '';

        // 2. Handle Group IDs & Non-Standard Identifiers
        // If it looks like a group ID or extremely long ID (>15), return as is
        if (cleaned.length > 15 && !cleaned.includes('@')) {
            return cleaned;
        }

        // 3. Handle Local Shortcuts (e.g., Bangladesh local 017...)
        if (cleaned.startsWith('0') && cleaned.length === 11) {
            cleaned = '88' + cleaned;
        }

        let phoneNumber;

        // 4. Case: International with +
        if (cleaned.startsWith('+')) {
            try {
                phoneNumber = phoneUtil.parse(cleaned);
                if (phoneUtil.isValidNumber(phoneNumber)) {
                    return phoneUtil.format(phoneNumber, PNF.E164).replace('+', '');
                }
            } catch (e) { }
        }

        // 5. Dynamic Auto-Detection
        if (!cleaned.startsWith('+')) {
            try {
                const globalTry = phoneUtil.parse('+' + cleaned);
                if (phoneUtil.isValidNumber(globalTry)) {
                    return phoneUtil.format(globalTry, PNF.E164).replace('+', '');
                }
            } catch (e) { }
        }

        // 6. Regional Fallback
        try {
            phoneNumber = phoneUtil.parseAndKeepRawInput(cleaned, defaultRegion);
            if (phoneUtil.isValidNumber(phoneNumber)) {
                return phoneUtil.format(phoneNumber, PNF.E164).replace('+', '');
            }
        } catch (e) { }

        // 7. Final Fallback
        return cleaned.replace('+', '');

    } catch (e) {
        return number.replace(/\D/g, '');
    }
};

module.exports = { formatNumber, isValidPhoneNumber };
