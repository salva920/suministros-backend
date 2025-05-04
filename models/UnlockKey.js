// ferreteria-backend/models/UnlockKey.js
const mongoose = require('mongoose');

const unlockKeySchema = new mongoose.Schema({
  key: { type: String, required: true }
});

module.exports = mongoose.model('UnlockKey', unlockKeySchema);