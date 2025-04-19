// models/EstadisticasMensuales.js
const mongoose = require('mongoose');

const estadisticasMensualesSchema = new mongoose.Schema({
  mes: {
    type: String,
    required: true,
    unique: true,
    match: [/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)']
  },
  totalVentas: {
    type: Number,
    min: 0,
    default: 0
  },
  totalProductosVendidos: {
    type: Number,
    min: 0,
    default: 0
  },
  totalClientesNuevos: {
    type: Number,
    min: 0,
    default: 0
  },
  productosBajoStock: {
    type: Number,
    min: 0,
    default: 0
  },
  fechaCierre: {
    type: Date,
    default: () => new Date()
  }
});

module.exports = mongoose.model('EstadisticasMensuales', estadisticasMensualesSchema);