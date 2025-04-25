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
  versionKey: false,
  strict: true  // Asegura que solo se guarden los campos definidos
});

// Aplicar el plugin de paginación
listaPrecioSchema.plugin(mongoosePaginate);

// Índice para búsquedas por nombre
listaPrecioSchema.index({ nombreProducto: 'text' });

// Pre-hook para garantizar que los precios sean números
listaPrecioSchema.pre('save', function(next) {
  // Asegurar que los precios sean números válidos
  this.precio1 = isNaN(this.precio1) ? 0 : Number(this.precio1);
  this.precio2 = isNaN(this.precio2) ? 0 : Number(this.precio2);
  this.precio3 = isNaN(this.precio3) ? 0 : Number(this.precio3);
  next();
});

const ListaPrecio = mongoose.model('ListaPrecio', listaPrecioSchema);

module.exports = ListaPrecio;