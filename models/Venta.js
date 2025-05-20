const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const moment = require('moment');

const ventaSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    default: () => moment().utc().toDate(),
    required: true,
    validate: {
      validator: function(v) {
        return v <= moment().utc().toDate();
      },
      message: 'La fecha no puede ser futura'
    },
    index: true
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true,
    index: true
  },
  productos: [{
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: true
    },
    cantidad: {
      type: Number,
      required: true,
      min: [0.01, 'La cantidad debe ser mayor a 0'],
      validate: {
        validator: Number.isFinite,
        message: 'La cantidad debe ser un número válido'
      }
    },
    precioUnitario: {
      type: Number,
      required: true,
      min: [0, 'El precio no puede ser negativo'],
      validate: {
        validator: Number.isFinite,
        message: 'El precio debe ser un número válido'
      }
    },
    gananciaUnitaria: {
      type: Number,
      required: true,
      min: [0, 'La ganancia no puede ser negativa'],
      validate: {
        validator: Number.isFinite,
        message: 'La ganancia debe ser un número válido'
      }
    },
    gananciaTotal: {
      type: Number,
      required: true,
      min: [0, 'La ganancia total no puede ser negativa'],
      validate: {
        validator: Number.isFinite,
        message: 'La ganancia total debe ser un número válido'
      }
    }
  }],
  total: {
    type: Number,
    required: true,
    min: [0, 'El total no puede ser negativo'],
    validate: {
      validator: Number.isFinite,
      message: 'El total debe ser un número válido'
    }
  },
  tipoPago: {
    type: String,
    enum: ['contado', 'credito'],
    required: true,
    index: true
  },
  metodoPago: {
    type: String,
    enum: ['efectivo', 'transferencia', 'tarjeta'],
    required: true
  },
  banco: {
    type: String,
    required: function() {
      return this.metodoPago === 'transferencia';
    }
  },
  montoAbonado: {
    type: Number,
    default: 0,
    min: [0, 'El monto abonado no puede ser negativo'],
    validate: {
      validator: Number.isFinite,
      message: 'El monto abonado debe ser un número válido'
    }
  },
  saldoPendiente: {
    type: Number,
    default: 0,
    min: [0, 'El saldo pendiente no puede ser negativo'],
    validate: {
      validator: Number.isFinite,
      message: 'El saldo pendiente debe ser un número válido'
    }
  },
  nrFactura: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  contadorMes: {
    type: Number,
    default: 0,
    min: [0, 'El contador no puede ser negativo']
  },
  estadoCredito: {
    type: String,
    enum: ['vigente', 'vencido', 'pagado'],
    default: 'vigente',
    index: true
  },
  estado: {
    type: String,
    enum: ['activa', 'anulada', 'devuelta'],
    default: 'activa',
    index: true
  }
});

// Validaciones pre-save
ventaSchema.pre('save', function(next) {
  // Validar que el monto abonado no exceda el total
  if (this.montoAbonado > this.total) {
    return next(new Error('El monto abonado no puede exceder el total'));
  }

  // Validar que el saldo pendiente sea correcto
  const saldoCalculado = this.total - this.montoAbonado;
  if (Math.abs(saldoCalculado - this.saldoPendiente) > 0.01) {
    return next(new Error('El saldo pendiente no coincide con el total y monto abonado'));
  }

  // Actualizar estado de crédito
  if (this.saldoPendiente <= 0) {
    this.estadoCredito = 'pagado';
  } else if (moment().diff(this.fecha, 'days') > 30) {
    this.estadoCredito = 'vencido';
  }

  // Validar que la suma de ganancias coincida con la diferencia entre el total y el costo total
  const gananciaTotalCalculada = this.productos.reduce((sum, p) => sum + p.gananciaTotal, 0);
  const costoTotal = this.productos.reduce((sum, p) => sum + (p.costoInicial * p.cantidad), 0);
  const gananciaEsperada = this.total - costoTotal;
  const diferencia = Math.abs(gananciaTotalCalculada - gananciaEsperada);

  if (diferencia > 0.05) { // Mayor tolerancia para decimales
    return next(new Error(`Discrepancia de ganancias: ${diferencia.toFixed(2)}. Ganancia calculada: ${gananciaTotalCalculada.toFixed(2)}, Ganancia esperada: ${gananciaEsperada.toFixed(2)}`));
  }

  next();
});

// Índices compuestos para consultas frecuentes
ventaSchema.index({ fecha: -1, estado: 1 });
ventaSchema.index({ cliente: 1, fecha: -1 });
ventaSchema.index({ estadoCredito: 1, fecha: -1 });
ventaSchema.index({ tipoPago: 1, fecha: -1 });
ventaSchema.index({ nrFactura: 1 }, { unique: true });
ventaSchema.index({ 'productos.producto': 1 });

// Configurar paginación
ventaSchema.plugin(mongoosePaginate);

// Transformación de IDs al convertir a JSON
ventaSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  }
});

const Venta = mongoose.model('Venta', ventaSchema);

module.exports = Venta;