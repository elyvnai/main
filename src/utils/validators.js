const TwilioService = require('../services/TwilioService');
function validatePhone(phone) {
    const normalized = TwilioService.normalizePhoneNumber(phone);
    return normalized !== null;
}
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}
module.exports = { validatePhone, validateEmail };