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
    // Optimización de consultas con Promise.all
    const [ventasData, productosData, clientesData, historialData] = await Promise.all([
      // Agregación de ventas
      Venta.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$total" }, // Suma total de ventas
            count: { $sum: 1 }        // Cantidad de ventas
          }
        }
      ]),
      
      // Productos con bajo stock
      Producto.find({ stock: { $lt: 5 } })
        .select('nombre stock')
        .lean(),
      
      // Total de clientes
      Cliente.estimatedDocumentCount(),
      
      // Historial mensual (últimos 12 meses)
      EstadisticasMensuales.find()
        .sort({ mes: -1 })
        .limit(12)
        .lean()
    ]);

    // Respuesta estructurada
    res.json({
      ventasTotales: ventasData[0]?.total || 0, // Total de ventas
      totalVentas: ventasData[0]?.count || 0,   // Cantidad de ventas
      productosBajoStock: productosData,        // Lista de productos con bajo stock
      totalClientes: clientesData,              // Total de clientes
      historialMensual: historialData,          // Historial de los últimos 12 meses
      mesActual: obtenerMesActual()             // Mes actual en formato YYYY-MM
    });

  } catch (error) {
    // Manejo de errores
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;