const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

// Definir el esquema
const listaPrecioSchema = new Schema({
  nombreProducto: {
    type: String,
    required: [true, 'El nombre del producto es obligatorio'],
    trim: true
  },
  // Campo para compatibilidad con la base de datos existente
  producto: {
    type: String,
    default: null
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
  },
  fechaCreacion: {
    type: Date,
    default: Date.now,
    index: true // Índice para mejorar rendimiento en consultas por fecha
  },
  mes: {
    type: Number,
    default: function() {
      return new Date().getMonth() + 1; // Los meses en JS son 0-11, sumamos 1 para obtener 1-12
    },
    index: true
  },
  anio: {
    type: Number,
    default: function() {
      return new Date().getFullYear();
    },
    index: true
  }
}, { 
  timestamps: true,
  versionKey: false,
  strict: false  // Permitir campos adicionales para compatibilidad
});

// Aplicar el plugin de paginación
listaPrecioSchema.plugin(mongoosePaginate);

// Índice para búsquedas por nombre
listaPrecioSchema.index({ nombreProducto: 'text' });
// Índice compuesto para búsquedas por mes y año
listaPrecioSchema.index({ mes: 1, anio: 1 });

// Pre-hook para garantizar que los precios sean números y asignar valores
listaPrecioSchema.pre('save', function(next) {
  // Asegurar que los precios sean números válidos
  this.precio1 = isNaN(this.precio1) ? 0 : Number(this.precio1);
  this.precio2 = isNaN(this.precio2) ? 0 : Number(this.precio2);
  this.precio3 = isNaN(this.precio3) ? 0 : Number(this.precio3);
  
  // Asignar un valor único a producto para evitar duplicados
  if (!this.producto) {
    this.producto = this.nombreProducto + '_' + Date.now();
  }
  
  // Asignar fecha, mes y año si no están definidos
  if (!this.fechaCreacion) {
    this.fechaCreacion = new Date();
  }
  
  // Obtener mes y año de la fecha de creación
  const fecha = new Date(this.fechaCreacion);
  this.mes = fecha.getMonth() + 1; // Ajustar para que sea 1-12
  this.anio = fecha.getFullYear();
  
  next();
});

const ListaPrecio = mongoose.model('ListaPrecio', listaPrecioSchema);

// Inicializar índices
const initIndexes = async () => {
  try {
    // Eliminar el índice problemático si existe
    await ListaPrecio.collection.dropIndex('producto_1').catch(err => {
      // Si el índice no existe, ignoramos el error
      if (err.code !== 27) console.error('Error al eliminar índice:', err);
    });
    
    console.log('Índices de ListaPrecio inicializados correctamente');
  } catch (error) {
    console.error('Error al inicializar índices:', error);
  }
};

// Ejecutar inicialización de índices
initIndexes();

module.exports = ListaPrecio;