const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const transaccionSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
    default: Date.now
  },
  concepto: {
    type: String,
    required: true
  },
  moneda: {
    type: String,
    enum: ['USD', 'Bs'],
    required: true
  },
  entrada: {
    type: Number,
    default: 0
  },
  salida: {
    type: Number,
    default: 0
  },
  saldo: {
    type: Number,
    required: true
  }
});

const cajaSchema = new mongoose.Schema({
  transacciones: [transaccionSchema],
  saldos: {
    USD: {
      type: Number,
      default: 0
    },
    Bs: {
      type: Number,
      default: 0
    }
  },
  
});

// Agregar el plugin de paginación
cajaSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Caja', cajaSchema);
