const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const productoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  codigo: {
    type: String,
    required: true,
    trim: true
  },
  proveedor: {
    type: String,
    trim: true
  },
  costoInicial: {
    type: Number,
    required: true,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  acarreo: {
    type: Number,
    default: 0,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  flete: {
    type: Number,
    default: 0,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  cantidad: {
    type: Number,
    required: true,
    min: 1,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  costoFinal: {
    type: Number,
    required: true,
    min: 0,
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  stock: {
    type: Number,
    required: true,
    default: function() { return this.cantidad|| 0;},
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Stock debe ser un número entero'
    }
  },
  fechaIngreso: {
    type: Date,
    required: true,
    set: (value) => {
      // Convertir a Date si es un string
      if (typeof value === 'string') {
        return new Date(value);
      }
      return value;
    }
  }
}, {
  toJSON: { 
    virtuals: true,
    getters: true
  },
  toObject: {
    getters: true
  },
  timestamps: false
});



// Aplicar el plugin de paginación
productoSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Producto', productoSchema);