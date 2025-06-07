const mongoose = require('mongoose'); // Importar mongoose
const mongoosePaginate = require('mongoose-paginate-v2');


const historialSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true,
    index: true
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
    enum: ['creacion', 'entrada', 'salida', 'ajuste', 'eliminacion'],
    required: true,
    index: true
  },
  cantidad: {
    type: Number,
    required: function() {
      return ['entrada', 'salida', 'ajuste'].includes(this.operacion);
    },
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'La cantidad debe ser un número válido'
    }
  },
  stockAnterior: {
    type: Number,
    required: function() {
      return ['entrada', 'salida', 'ajuste'].includes(this.operacion);
    },
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'El stock anterior debe ser un número válido'
    }
  },
  stockNuevo: {
    type: Number,
    required: function() {
      return ['entrada', 'salida', 'ajuste'].includes(this.operacion);
    },
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'El stock nuevo debe ser un número válido'
    }
  },
  fecha: {
    type: Date,
    default: Date.now,
    index: true
  },
  costoFinal: {
    type: Number,
    required: function() {
      return ['entrada', 'creacion'].includes(this.operacion);
    },
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'El costo final debe ser un número válido'
    }
  },
  stockLote: {
    type: Number,
    required: function() {
      return ['entrada', 'creacion'].includes(this.operacion);
    },
    min: 0,
    validate: {
      validator: Number.isFinite,
      message: 'El stock de lote debe ser un número válido'
    }
  },
  detalles: {
    type: String,
    required: false
  }
});

// Validación pre-save
historialSchema.pre('save', function(next) {
  // Validar campos según el tipo de operación
  switch(this.operacion) {
    case 'entrada':
    case 'salida':
    case 'ajuste':
      if (!this.cantidad || this.cantidad < 0) {
        return next(new Error('Cantidad inválida'));
      }
      if (typeof this.stockAnterior !== 'number' || typeof this.stockNuevo !== 'number') {
        return next(new Error('Stock anterior y nuevo son requeridos'));
      }
      // Validar que el stock nuevo sea consistente
      const stockCalculado = this.operacion === 'entrada' 
        ? this.stockAnterior + this.cantidad 
        : this.operacion === 'salida' 
          ? this.stockAnterior - this.cantidad 
          : this.stockAnterior;
      
      if (Math.abs(stockCalculado - this.stockNuevo) > 0.01) {
        return next(new Error('El stock nuevo no coincide con la operación'));
      }
      break;
    case 'entrada':
    case 'creacion':
      if (!this.costoFinal || this.costoFinal < 0) {
        return next(new Error('Costo final inválido'));
      }
      if (!this.stockLote || this.stockLote < 0) {
        return next(new Error('Stock de lote inválido'));
      }
      break;
  }
  next();
});

// Índices compuestos para consultas frecuentes
historialSchema.index({ producto: 1, operacion: 1, stockLote: 1 });
historialSchema.index({ fecha: -1 });
historialSchema.index({ producto: 1, fecha: -1 });

historialSchema.plugin(mongoosePaginate);

// Exportar correctamente el modelo
const Historial = mongoose.models.Historial || mongoose.model('Historial', historialSchema);
module.exports = Historial;