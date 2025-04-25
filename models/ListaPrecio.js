const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const listaPrecioSchema = new Schema({
  nombreProducto: {
    type: String,
    required: [true, 'El nombre del producto es obligatorio'],
    trim: true
  },
  precio1: {
    type: Number,
    default: 0
  },
  precio2: {
    type: Number,
    default: 0
  },
  precio3: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true,
  versionKey: false 
});

// Aplicar el plugin de paginación
listaPrecioSchema.plugin(mongoosePaginate);

// Índice para búsquedas por nombre
listaPrecioSchema.index({ nombreProducto: 'text' });

module.exports = mongoose.model('ListaPrecio', listaPrecioSchema);