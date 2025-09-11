const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Decimal = require('decimal.js');
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
  proveedor: {
    type: String,
    trim: true
  },
  numeroFactura: {
    type: String,
    trim: true
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  moneda: {
    type: String,
    enum: ['Bs', 'USD'],
    default: 'Bs'
  },
  abono: {
    type: Number,
    default: 0,
    min: 0
  },
  monedaAbono: {
    type: String,
    enum: ['Bs', 'USD'],
    default: 'Bs'
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
  const montoDecimal = new Decimal(this.monto);
  const abonoDecimal = new Decimal(this.abono);
  this.saldo = Math.max(0, montoDecimal.minus(abonoDecimal).toNumber());
  next();
});

// Aplicar el plugin de paginación
facturaPendienteSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('FacturaPendiente', facturaPendienteSchema); 