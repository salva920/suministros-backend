const mongoose = require('mongoose');

const tasaCambioSchema = new mongoose.Schema({
  tasa: {
    type: Number,
    required: true,
    min: 0
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  
});

module.exports = mongoose.model('TasaCambio', tasaCambioSchema);