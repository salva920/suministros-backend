const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const moment = require('moment-timezone');

const transaccionSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
    get: (v) => moment.utc(v).tz('America/Caracas').format('YYYY-MM-DD HH:mm:ss'),
    index: -1
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

// Habilitar getters en las queries
transaccionSchema.set('toObject', { getters: true });
transaccionSchema.set('toJSON', { getters: true });

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
