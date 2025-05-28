const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
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
  const abono = new Decimal(this.abono).toDecimalPlaces(2);
  const monto = new Decimal(this.monto).toDecimalPlaces(2);
  this.saldo = monto.minus(abono).toNumber();
  next();
});

// Aplicar el plugin de paginación
facturaPendienteSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('FacturaPendiente', facturaPendienteSchema); 