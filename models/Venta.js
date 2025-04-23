const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const moment = require('moment'); // ✅ Importación faltante


const ventaSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    default:  () => moment().utc().toDate(), // Usar fecha UTC
    required: true
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true
  },
  productos: [{
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: true
    },
    cantidad: {
      type: Number,
      required: true
    },
    precioUnitario: {
      type: Number,
      required: true
    },
  gananciaUnitaria: {
    type: Number,
    required: true
  },
  gananciaTotal: {
    type: Number,
    required: true
  }
  }],
  total: {
    type: Number,
    required: true
  },
  tipoPago: {
    type: String,
    enum: ['contado', 'credito'],
    required: true
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
    default: 0
  },
  saldoPendiente: {
    type: Number,
    default: 0
  },
  nrFactura: {
    type: String,
    required: true
  },
  contadorMes: {  // <- Nuevo campo necesario
    type: Number,
    default: 0
  },
  estadoCredito: {  // Nuevo campo de estado
    type: String,
    enum: ['vigente', 'vencido', 'pagado'],
    default: 'vigente'
  }
});

// Actualizar estado automáticamente ✅
ventaSchema.pre('save', function(next) {
  if (this.saldoPendiente <= 0) {
    this.estadoCredito = 'pagado';
  } else if (moment().diff(this.fecha, 'days') > 30) {
    this.estadoCredito = 'vencido';
  }
  next();
});

// Configurar paginación
ventaSchema.plugin(mongoosePaginate);

// Transformación de IDs al convertir a JSON
ventaSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // Crear un campo 'id' a partir de '_id'
    delete ret._id; // Eliminar el campo '_id'
    delete ret.__v; // Eliminar el campo '__v'
  }
});

const Venta = mongoose.model('Venta', ventaSchema);

module.exports = Venta;