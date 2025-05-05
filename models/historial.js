const mongoose = require('mongoose'); // Importar mongoose
const mongoosePaginate = require('mongoose-paginate-v2');


const historialSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
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
  operacion: {
    type: String,
    enum: ['creacion', 'entrada', 'ajuste', 'eliminacion'],
    required: true
  },
  cantidad: {
    type: Number,
    min: 0
  },
  stockAnterior: Number,
  stockNuevo: Number,
  fecha: {
    type: Date,
    default: Date.now
  },
  costoFinal: {
    type: Number,
    required: false, // Solo requerido para entradas
    min: 0
  },
  stockLote: {
    type: Number,
    required: true,
    min: 0
  },
});

// Validación pre-save
historialSchema.pre('save', function(next) {
  if (this.operacion === 'entrada') {
    if (!this.cantidad || !this.stockAnterior || !this.stockNuevo) {
      return next(new Error('Faltan campos requeridos para entrada de stock'));
    }
  }
  next();
});

historialSchema.plugin(mongoosePaginate);

// Exportar correctamente el modelo
const Historial = mongoose.models.Historial || mongoose.model('Historial', historialSchema);
module.exports = Historial;