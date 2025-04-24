const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const moment = require('moment');

const productoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  codigo: {
    type: String,
    required: true,
    trim: true
  },
  proveedor: {
    type: String,
    trim: true
  },
  costoInicial: {
    type: Number,
    required: true,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  acarreo: {
    type: Number,
    default: 0,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  flete: {
    type: Number,
    default: 0,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  cantidad: {
    type: Number,
    required: true,
    min: 1,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  costoFinal: {
    type: Number,
    required: true,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  stock: {
    type: Number,
    required: true,
    default: function() { return this.cantidad|| 0;},
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Stock debe ser un número entero'
    }
  },
  fechaIngreso: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return moment(v, moment.ISO_8601, true).isValid(); // Validar formato ISO 8601
      },
      message: 'Formato de fecha inválido (YYYY-MM-DD)'
    },
    contadorMes: {  // <- Nuevo campo necesario
      type: Number,
      default: 0
    },
  }
}, {
  toJSON: { 
    virtuals: true,
    getters: true
  },
  toObject: {
    getters: true
  },
  timestamps: false
});

// Aplicar el plugin de paginación
productoSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Producto', productoSchema);