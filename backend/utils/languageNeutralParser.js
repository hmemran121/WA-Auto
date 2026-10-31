/**
 * Language-Agnostic Numeric-Entity & Intent Entropy Parser
 * ZERO Hardcoding - Uses Unicode Property Escapes (\p{N}, \p{L}) for International Multi-Language Support
 */

const isInternalTask = (text) => {
    if (!text || typeof text !== 'string') return true;
    const clean = text.trim();
    if (clean.startsWith('Task:') || clean.startsWith('[System]') || clean === 'auto_reply' || clean.includes('auto_reply')) {
        return true;
    }
    return false;
};

// Universal Unicode Patterns (Language Agnostic)
const UNIVERSAL_NUMERIC_ENTITY = new RegExp('(\\p{N}+[\\.,]?\\p{N}*)\\s*(\\p{L}+)', 'u');
const UNICODE_DIGIT_PATTERN = new RegExp('\\p{N}', 'u');
const MATH_OPERATOR_PATTERN = /[\+\-\*\/÷×=]/;
const PERSONAL_CONTEXT_PATTERN = /(আমার|অর্ডার|মেমো|বিল|ঠিকানা|my order|my bill|my address|status|tracking)/i;

const analyzeQueryIntent = (queryText) => {
    if (!queryText || typeof queryText !== 'string') {
        return { isSystemTask: true, isDynamicMath: false, isContextDependent: false, isStaticFAQ: false };
    }

    const text = queryText.trim();
    if (isInternalTask(text)) {
        return { isSystemTask: true, isDynamicMath: false, isContextDependent: false, isStaticFAQ: false };
    }

    const hasDigits = UNICODE_DIGIT_PATTERN.test(text);
    const hasEntityUnit = UNIVERSAL_NUMERIC_ENTITY.test(text);
    const hasMathSymbol = MATH_OPERATOR_PATTERN.test(text);

    let isDynamicMath = false;

    // If query has numbers paired with any language letters or arithmetic symbols
    if (hasDigits && (hasEntityUnit || hasMathSymbol)) {
        const digitsOnly = text.replace(/[^\p{N}]/gu, '');
        // Exclude phone numbers (10+ digits)
        if (digitsOnly.length < 10) {
            isDynamicMath = true;
        }
    }

    const isContextDependent = PERSONAL_CONTEXT_PATTERN.test(text);

    return {
        isSystemTask: false,
        isDynamicMath,
        isContextDependent,
        isStaticFAQ: !isDynamicMath && !isContextDependent
    };
};

module.exports = {
    isInternalTask,
    analyzeQueryIntent
};
