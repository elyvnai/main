// server/bridge/utils/optOut.js

const OPT_OUT_WORDS = ['stop', 'unsubscribe', 'cancel', 'quit', 'end', 'opt out'];

function isOptOut(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return OPT_OUT_WORDS.some(word => lower === word || lower.includes(word));
}

module.exports = { isOptOut };
