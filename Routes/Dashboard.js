// Routes/Dashboard.js
const express = require('express');
const router = express.Router();
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const EstadisticasMensuales = require('../models/EstadisticasMensuales');

const obtenerMesActual = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
};

const reiniciarConteosMensuales = async (mesAnterior) => {
  const inicioMes = new Date(mesAnterior);
  const finMes = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 0);

  // Obtener estadísticas completas
  const [ventas, productos, clientes] = await Promise.all([
    Venta.aggregate([
      { 
        $match: { fecha: { $gte: inicioMes, $lte: finMes } } 
      },
      { 
        $group: { 
          _id: null, 
          totalVentas: { $sum: "$total" },
          totalProductos: { $sum: { $size: "$productos" } }
        } 
      }
    ]),
    Producto.aggregate([
      {
        $group: {
          _id: null,
          bajoStock: { $sum: { $cond: [{ $lt: ["$stock", 5] }, 1, 0] } }
        }
      }
    ]),
    Cliente.countDocuments({ 
      createdAt: { $gte: inicioMes, $lte: finMes } 
    })
  ]);

  // Guardar estadísticas históricas
  const estadisticas = new EstadisticasMensuales({
    mes: mesAnterior,
    totalVentas: ventas[0]?.totalVentas || 0,
    totalProductosVendidos: ventas[0]?.totalProductos || 0,
    totalClientesNuevos: clientes,
    productosBajoStock: productos[0]?.bajoStock || 0
  });

  await estadisticas.save();

  // Reiniciar contadores
  await Promise.all([
    Venta.updateMany({}, { $set: { contadorMes: 0 } }),
    Producto.updateMany({}, { $set: { contadorMes: 0 } }),
    Cliente.updateMany({}, { $set: { contadorMes: 0 } })
  ]);
};

router.get('/', async (req, res) => {
  try {
    const mesActual = obtenerMesActual();
    
    // Verificar cambio de mes
    const ultimoRegistro = await EstadisticasMensuales.findOne()
      .sort({ fechaCierre: -1 })
      .lean();

    if (ultimoRegistro && ultimoRegistro.mes !== mesActual) {
      await reiniciarConteosMensuales(ultimoRegistro.mes);
    }

    // Obtener datos en una sola consulta
    const [datos, historial] = await Promise.all([
      Promise.all([
        Venta.aggregate([{ $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
        Producto.find({ stock: { $lt: 5 } }).select('nombre stock'),
        Cliente.countDocuments()
      ]),
      EstadisticasMensuales.find().sort({ mes: -1 }).limit(12)
    ]);

    res.json({
      ventasTotales: datos[0][0]?.total || 0,
      totalVentas: datos[0][0]?.count || 0,
      productosBajoStock: datos[1],
      totalClientes: datos[2],
      historialMensual: historial,
      mesActual: mesActual
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;