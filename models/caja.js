const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const transaccionSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
    index: -1
  },
  concepto: {
    type: String,
    required: true,
    trim: true
  },
  moneda: {
    type: String,
    enum: ['USD', 'Bs'],
    required: true
  },
  entrada: {
    type: Number,
    default: 0,
    min: 0
  },
  salida: {
    type: Number,
    default: 0,
    min: 0
  },
  saldo: {
    type: Number,
    required: true
  },
  tasaCambio: {
    type: Number,
    required: true,
    min: 0.01
  }
}, { timestamps: false });

transaccionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
  }
});

const cajaSchema = new mongoose.Schema({
  transacciones: [transaccionSchema],
  saldos: {
    USD: {
      type: Number,
      default: 0,
      min: 0
    },
    Bs: {
      type: Number,
      default: 0,
      min: 0
    }
  }
});

cajaSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Caja', cajaSchema);