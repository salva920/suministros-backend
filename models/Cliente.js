const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const clienteSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  telefono: {
    type: String,
    trim: true,
    // Validación más flexible para teléfonos venezolanos
    // Permite formato: 0412-1234567, 0412 1234567, 04121234567
    match: [
      /^(?:0[24][124126]\d[-\s]?\d{7})$/,
      'Formato de teléfono inválido'
    ],
    required: false // Hacer este campo opcional
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        // Permitir email vacío o con formato correcto
        return v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => 'Email inválido'
    },
    required: false // Hacer este campo opcional
  },
  direccion: {
    type: String,
    trim: true
  },
  municipio: {
    type: String,
    trim: true,
    required: false // Hacer este campo opcional
  },
  rif: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        // Validación de RIF y cédula más flexible:
        // V + 6-9 dígitos: V123456, V12345678, etc.
        // E + 6-9 dígitos: E123456, E12345678, etc.
        // J/G + 8-10 dígitos: J12345678, G1234567890, etc.
        return /^[V](\d{6,9})$|^[E](\d{6,9})$|^[JG](\d{8,10})$/.test(v);
      },
      message: props => 'Formato de documento inválido. Debe comenzar con V, E, J o G seguido del número.'
    }
  },
  categorias: {
    type: [String],
    enum: ['Alto Riesgo', 'Agente Retención'],
    default: []
  },
  municipioColor: {
    type: String,
    default: '#ffffff',
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: props => `${props.value} no es un color hexadecimal válido!`
    }
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  },
  contadorMes: {
    type: Number,
    default: 0
  },
  deudaTotal: {
    type: Number,
    default: 0
  },
  ultimaCompra: {
    type: Date
  }
}, {
  timestamps: true
});

// Middleware para actualizar deuda automáticamente
clienteSchema.pre('save', function(next) {
  if (this.isModified('categorias')) {
    if (this.categorias.includes('Alto Riesgo')) {
      this.municipioColor = '#ff0000'; // Rojo para alto riesgo
    }
  }
  next();
});

// Índices para búsquedas frecuentes
clienteSchema.index({ nombre: 1 });
clienteSchema.index({ rif: 1 });
clienteSchema.index({ municipio: 1 });

// Aplicar el plugin de paginación
clienteSchema.plugin(mongoosePaginate);

// Agregar transformación al schema para convertir _id a string
clienteSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;  // Eliminar versión de documento
  }
});

const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;