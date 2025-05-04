// Routes/Dashboard.js
const express = require('express');
const router = express.Router();
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const EstadisticasMensuales = require('../models/EstadisticasMensuales');
const FacturaPendiente = require('../models/FacturaPendiente');

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
    // 1. Buscar la venta más reciente
    const ventaMasReciente = await Venta.findOne().sort({ fecha: -1 }).lean();

    if (!ventaMasReciente) {
      // Si no hay ventas, responde con ceros
      return res.json({
        success: true,
        data: {
          ventasTotales: 0,
          ventasMesActual: 0,
          ventasMesAnterior: 0,
          porcentajeCrecimiento: 0,
          productosBajoStock: [],
          totalClientes: 0
        }
      });
    }

    // 2. Tomar el mes y año de la venta más reciente
    const fechaReferencia = new Date(ventaMasReciente.fecha);
    const anioActual = fechaReferencia.getFullYear();
    const mesActual = fechaReferencia.getMonth(); // 0 = enero

    // 3. Calcular rangos de fechas
    const primerDiaMesActual = new Date(anioActual, mesActual, 1);
    const primerDiaMesSiguiente = new Date(anioActual, mesActual + 1, 1);
    const primerDiaMesAnterior = new Date(anioActual, mesActual - 1, 1);

    // 4. Ventas del mes actual (según la venta más reciente)
    const ventasMesActualData = await Venta.aggregate([
      { $match: { fecha: { $gte: primerDiaMesActual, $lt: primerDiaMesSiguiente } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);

    // 5. Ventas del mes anterior
    const ventasMesAnteriorData = await Venta.aggregate([
      { $match: { fecha: { $gte: primerDiaMesAnterior, $lt: primerDiaMesActual } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);

    // 6. Ventas totales (histórico)
    const ventasTotalesData = await Venta.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);

    // 7. Productos con bajo stock (actual)
    const productosBajoStock = await Producto.find({ stock: { $lt: 5 } }).lean();

    // 8. Total de clientes (histórico)
    const totalClientes = await Cliente.estimatedDocumentCount();

    // 9. Calcular porcentaje de crecimiento
    const ventasMesActual = ventasMesActualData[0]?.total || 0;
    const ventasMesAnterior = ventasMesAnteriorData[0]?.total || 0;
    let porcentajeCrecimiento = 0;
    if (ventasMesAnterior > 0) {
      porcentajeCrecimiento = ((ventasMesActual - ventasMesAnterior) / ventasMesAnterior) * 100;
    }

    const totalFacturasPendientes = await FacturaPendiente.countDocuments({ saldo: { $gt: 0 } });

    res.json({
      success: true,
      data: {
        ventasTotales: ventasTotalesData[0]?.total || 0,
        ventasMesActual,
        ventasMesAnterior,
        porcentajeCrecimiento,
        productosBajoStock,
        totalClientes,
        mesReferencia: `${anioActual}-${(mesActual + 1).toString().padStart(2, '0')}`,
        totalFacturasPendientes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;