const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const listaPrecioSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  nombreProducto: {
    type: String,
    required: true
  },
  codigoProducto: {
    type: String,
    required: true
  },
  precio1: {
    type: Number,
    required: true,
    default: 0
  },
  precio2: {
    type: Number,
    default: 0
  },
  precio3: {
    type: Number,
    default: 0
  },
  precioMayorista: {
    type: Number,
    default: 0
  },
  descripcion: {
    type: String,
    default: ''
  },
  activo: {
    type: Boolean,
    default: true
  },
  fechaActualizacion: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Índices para optimizar búsquedas
listaPrecioSchema.index({ producto: 1 }, { unique: true });
listaPrecioSchema.index({ codigoProducto: 1 });

module.exports = mongoose.model('ListaPrecio', listaPrecioSchema);