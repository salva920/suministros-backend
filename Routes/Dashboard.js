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
    // Consultas optimizadas con Promise.all
    const [ventasData, productosData, clientesData] = await Promise.all([
      Venta.aggregate([
        { 
          $group: { 
            _id: null, 
            total: { $sum: "$total" },
            count: { $sum: 1 }
          }
        }
      ]),
      Producto.find({ stock: { $lt: 5 } }).lean(),
      Cliente.estimatedDocumentCount()
    ]);

    // Estructura de respuesta estandarizada
    const response = {
      success: true,
      data: {
        ventasTotales: ventasData[0]?.total || 0,
        productosBajoStock: productosData,
        totalClientes: clientesData
      }
    };

    // Validación final de estructura
    if (typeof responseData.ventasTotales !== 'number' || 
        !Array.isArray(responseData.productosBajoStock)) {
      throw new Error('Estructura de datos inválida');
    }

    // Respuesta con estructura consistente
    res.json(response);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error en dashboard:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: 'DASHBOARD_FETCH_ERROR'
    });
  }
});

module.exports = router;