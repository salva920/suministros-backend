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
  console.log('\n=== VALIDACIÓN DE HISTORIAL ===');
  console.log('Datos recibidos:', {
    operacion: this.operacion,
    cantidad: this.cantidad,
    stockAnterior: this.stockAnterior,
    stockNuevo: this.stockNuevo,
    stockLote: this.stockLote,
    costoFinal: this.costoFinal,
    fecha: this.fecha,
    producto: this.producto,
    nombreProducto: this.nombreProducto,
    codigoProducto: this.codigoProducto
  });

  // Validar campos según el tipo de operación
  switch(this.operacion) {
    case 'entrada':
    case 'salida':
    case 'ajuste':
      console.log('\nValidando operación:', this.operacion);
      
      if (!this.cantidad || this.cantidad < 0) {
        console.log('Error: Cantidad inválida:', this.cantidad);
        return next(new Error('Cantidad inválida'));
      }
      
      if (typeof this.stockAnterior !== 'number' || typeof this.stockNuevo !== 'number') {
        console.log('Error: Stock anterior o nuevo inválido:', {
          stockAnterior: this.stockAnterior,
          stockNuevo: this.stockNuevo
        });
        return next(new Error('Stock anterior y nuevo son requeridos'));
      }

      // Validar que el stock nuevo sea consistente
      const stockCalculado = this.operacion === 'entrada' 
        ? this.stockAnterior + this.cantidad 
        : this.operacion === 'salida' 
          ? this.stockAnterior - this.cantidad 
          : this.stockAnterior;
      
      console.log('Cálculo de stock:', {
        operacion: this.operacion,
        stockAnterior: this.stockAnterior,
        cantidad: this.cantidad,
        stockCalculado: stockCalculado,
        stockNuevo: this.stockNuevo,
        diferencia: Math.abs(stockCalculado - this.stockNuevo),
        stockLote: this.stockLote
      });

      // Validación adicional para operaciones de salida
      if (this.operacion === 'salida') {
        console.log('Validación específica para salida:', {
          stockLote: this.stockLote,
          cantidad: this.cantidad,
          stockAnterior: this.stockAnterior,
          stockNuevo: this.stockNuevo
        });

        // Validar que el stockLote sea consistente con la operación
        if (this.stockLote === 0) {
          console.log('Error: stockLote no puede ser 0 en operación de salida');
          return next(new Error('El stockLote debe reflejar el stock del lote que se está modificando'));
        }

        // Validar que la cantidad a vender no exceda el stock disponible
        if (this.cantidad > this.stockAnterior) {
          console.log('Error: La cantidad a vender excede el stock disponible');
          return next(new Error('La cantidad a vender excede el stock disponible'));
        }

        // Validar que el stock nuevo sea menor que el anterior
        if (this.stockNuevo >= this.stockAnterior) {
          console.log('Error: El stock nuevo debe ser menor que el anterior en una salida');
          return next(new Error('El stock nuevo debe ser menor que el anterior en una salida'));
        }

        // Validar que el stockLote sea consistente con el stock anterior
        if (this.stockLote !== this.stockAnterior) {
          console.log('Error: El stockLote debe coincidir con el stock anterior en operaciones de salida');
          return next(new Error('El stockLote debe coincidir con el stock anterior en operaciones de salida'));
        }
      }
      
      if (Math.abs(stockCalculado - this.stockNuevo) > 0.01) {
        console.log('Error: El stock nuevo no coincide con la operación');
        return next(new Error('El stock nuevo no coincide con la operación'));
      }
      break;

    case 'entrada':
    case 'creacion':
      console.log('\nValidando operación:', this.operacion);
      
      if (!this.costoFinal || this.costoFinal < 0) {
        console.log('Error: Costo final inválido:', this.costoFinal);
        return next(new Error('Costo final inválido'));
      }
      
      if (!this.stockLote || this.stockLote < 0) {
        console.log('Error: Stock de lote inválido:', this.stockLote);
        return next(new Error('Stock de lote inválido'));
      }

      console.log('Validación de lote:', {
        costoFinal: this.costoFinal,
        stockLote: this.stockLote,
        stockAnterior: this.stockAnterior,
        stockNuevo: this.stockNuevo
      });
      break;
  }

  console.log('Validación exitosa');
  console.log('=== FIN VALIDACIÓN DE HISTORIAL ===\n');
  next();
});

// Middleware post-save para verificar el resultado
historialSchema.post('save', function(doc) {
  console.log('\n=== REGISTRO GUARDADO EN HISTORIAL ===');
  console.log('Datos guardados:', {
    id: doc._id,
    operacion: doc.operacion,
    cantidad: doc.cantidad,
    stockAnterior: doc.stockAnterior,
    stockNuevo: doc.stockNuevo,
    stockLote: doc.stockLote,
    costoFinal: doc.costoFinal,
    fecha: doc.fecha,
    producto: doc.producto,
    nombreProducto: doc.nombreProducto,
    codigoProducto: doc.codigoProducto
  });

  // Análisis adicional para operaciones de salida
  if (doc.operacion === 'salida') {
    const diferenciaStock = doc.stockAnterior - doc.stockNuevo;
    const esConsistente = diferenciaStock === doc.cantidad;
    const porcentajeDescuento = ((doc.cantidad / doc.stockAnterior) * 100).toFixed(2);
    
    console.log('Análisis de salida:', {
      diferenciaStock,
      cantidadVendida: doc.cantidad,
      stockLote: doc.stockLote,
      esConsistente,
      porcentajeDescuento: porcentajeDescuento + '%',
      stockLoteConsistente: doc.stockLote === doc.stockAnterior
    });

    if (!esConsistente) {
      console.log('Error: La diferencia de stock no coincide con la cantidad vendida');
    }

    if (doc.stockLote === 0) {
      console.log('Error: El registro de salida tiene stockLote en 0');
    }

    if (doc.stockLote !== doc.stockAnterior) {
      console.log('Error: El stockLote no coincide con el stock anterior');
    }
  }

  console.log('=== FIN REGISTRO GUARDADO ===\n');
});

// Índices compuestos para consultas frecuentes
historialSchema.index({ producto: 1, operacion: 1, stockLote: 1 });
historialSchema.index({ fecha: -1 });
historialSchema.index({ producto: 1, fecha: -1 });

historialSchema.plugin(mongoosePaginate);

// Exportar correctamente el modelo
const Historial = mongoose.models.Historial || mongoose.model('Historial', historialSchema);
module.exports = Historial;