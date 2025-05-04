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
    const fecha = new Date();
    // Primer y último día del mes actual
    const primerDiaMesActual = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    const primerDiaMesSiguiente = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1);
    // Primer y último día del mes anterior
    const primerDiaMesAnterior = new Date(fecha.getFullYear(), fecha.getMonth() - 1, 1);
    const primerDiaMesActualCopia = new Date(fecha.getFullYear(), fecha.getMonth(), 1);

    // Ventas del mes actual
    const ventasMesActualData = await Venta.aggregate([
      { $match: { fecha: { $gte: primerDiaMesActual, $lt: primerDiaMesSiguiente } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);

    // Ventas del mes anterior
    const ventasMesAnteriorData = await Venta.aggregate([
      { $match: { fecha: { $gte: primerDiaMesAnterior, $lt: primerDiaMesActualCopia } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);

    // Ventas totales (histórico)
    const ventasTotalesData = await Venta.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);

    // Productos con bajo stock (actual)
    const productosBajoStock = await Producto.find({ stock: { $lt: 5 } }).lean();

    // Total de clientes (histórico)
    const totalClientes = await Cliente.estimatedDocumentCount();

    // Calcular porcentaje de crecimiento
    const ventasMesActual = ventasMesActualData[0]?.total || 0;
    const ventasMesAnterior = ventasMesAnteriorData[0]?.total || 0;
    let porcentajeCrecimiento = 0;
    if (ventasMesAnterior > 0) {
      porcentajeCrecimiento = ((ventasMesActual - ventasMesAnterior) / ventasMesAnterior) * 100;
    }

    res.json({
      success: true,
      data: {
        ventasTotales: ventasTotalesData[0]?.total || 0,
        ventasMesActual,
        ventasMesAnterior,
        porcentajeCrecimiento,
        productosBajoStock,
        totalClientes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;