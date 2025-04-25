const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
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
  },
  margenGanancia1: {
    type: Number,
    default: 0
  },
  margenGanancia2: {
    type: Number,
    default: 0
  },
  margenGanancia3: {
    type: Number,
    default: 0
  },
  margenGananciaMayorista: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Índices para optimizar búsquedas
listaPrecioSchema.index({ producto: 1 }, { unique: true });
listaPrecioSchema.index({ codigoProducto: 1 });
listaPrecioSchema.index({ nombreProducto: 'text' }); // Índice de texto para búsquedas

// Método para calcular márgenes de ganancia
listaPrecioSchema.methods.calcularMargenes = async function(costoProd) {
  const costo = costoProd || 0;
  if (costo > 0) {
    this.margenGanancia1 = costo > 0 ? ((this.precio1 - costo) / costo) * 100 : 0;
    this.margenGanancia2 = costo > 0 ? ((this.precio2 - costo) / costo) * 100 : 0;
    this.margenGanancia3 = costo > 0 ? ((this.precio3 - costo) / costo) * 100 : 0;
    this.margenGananciaMayorista = costo > 0 ? ((this.precioMayorista - costo) / costo) * 100 : 0;
  }
};

// Agregar plugin de paginación
listaPrecioSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('ListaPrecio', listaPrecioSchema);