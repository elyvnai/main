function validatePhoneNumber(phone) {
    if (!phone) return null;
    
    let normalized = phone.replace(/[^\d+]/g, '');
    
    if (normalized.length === 10) {
        normalized = '+1' + normalized;
    } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = '+' + normalized;
    } else if (normalized.startsWith('+')) {
        if (normalized.length < 10) return null;
    } else if (normalized.length >= 10) {
        normalized = '+' + normalized;
    } else {
        return null;
    }
    
    return normalized;
}

function validateEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidCallId(callId) {
    if (!callId || typeof callId !== 'string') return false;
    return callId.length > 0 && callId.length <= 100;
}

function sanitizeString(str, maxLength = 500) {
    if (!str) return '';
    const sanitized = str.trim().substring(0, maxLength);
    return sanitized;
}

function validateJsonBody(body, requiredFields) {
    const missingFields = requiredFields.filter(field => !body[field]);
    return {
        valid: missingFields.length === 0,
        missing: missingFields
    };
}

module.exports = {
    validatePhoneNumber,
    validateEmail,
    isValidCallId,
    sanitizeString,
    validateJsonBody
};