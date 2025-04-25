const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const facturaPendienteSchema = new Schema({
  fecha: {
    type: Date,
    required: true,
    default: Date.now
  },
  concepto: {
    type: String,
    required: true,
    trim: true
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  abono: {
    type: Number,
    default: 0,
    min: 0
  },
  saldo: {
    type: Number,
    default: function() {
      return this.monto;
    }
  }
}, { timestamps: true });

// Middleware para actualizar saldo automáticamente
facturaPendienteSchema.pre('save', function(next) {
  this.saldo = Math.max(0, this.monto - this.abono);
  next();
});

module.exports = mongoose.model('FacturaPendiente', facturaPendienteSchema);
