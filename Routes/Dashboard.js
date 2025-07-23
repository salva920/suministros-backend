// Routes/Dashboard.js
const express = require('express');
const router = express.Router();
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const EstadisticasMensuales = require('../models/EstadisticasMensuales');
const FacturaPendiente = require('../models/FacturaPendiente');

// Middleware para manejar errores
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    res.status(500).json({ 
      success: false, 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
    });
  });
};

const obtenerMesActual = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
};

const reiniciarConteosMensuales = async (mesAnterior) => {
  const inicioMes = new Date(mesAnterior);
  const finMes = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 0);

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

  await EstadisticasMensuales.create({
    mes: mesAnterior,
    totalVentas: ventas[0]?.totalVentas || 0,
    totalProductosVendidos: ventas[0]?.totalProductos || 0,
    totalClientesNuevos: clientes,
    productosBajoStock: productos[0]?.bajoStock || 0
  });

  await Promise.all([
    Venta.updateMany({}, { $set: { contadorMes: 0 } }),
    Producto.updateMany({}, { $set: { contadorMes: 0 } }),
    Cliente.updateMany({}, { $set: { contadorMes: 0 } })
  ]);
};

router.get('/', asyncHandler(async (req, res) => {
  const ventaMasReciente = await Venta.findOne()
    .sort({ fecha: -1 })
    .lean();

  if (!ventaMasReciente) {
    return res.json({
      success: true,
      data: {
        ventasTotales: 0,
        ventasMesActual: 0,
        ventasMesAnterior: 0,
        porcentajeCrecimiento: 0,
        productosBajoStock: [],
        totalClientes: 0,
        totalFacturasPendientes: 0,
        ultimasVentas: []
      }
    });
  }

  const fechaReferencia = new Date(ventaMasReciente.fecha);
  const anioActual = fechaReferencia.getFullYear();
  const mesActual = fechaReferencia.getMonth();

  const primerDiaMesActual = new Date(anioActual, mesActual, 1);
  const primerDiaMesSiguiente = new Date(anioActual, mesActual + 1, 1);
  const primerDiaMesAnterior = new Date(anioActual, mesActual - 1, 1);

  const [
    ventasMesActualData,
    ventasMesAnteriorData,
    ventasTotalesData,
    productosBajoStock,
    totalClientes,
    totalFacturasPendientes,
    ultimasVentas
  ] = await Promise.all([
    Venta.aggregate([
      { 
        $match: { 
          fecha: { $gte: primerDiaMesActual, $lt: primerDiaMesSiguiente } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: "$total" } 
        } 
      }
    ]),
    Venta.aggregate([
      { 
        $match: { 
          fecha: { $gte: primerDiaMesAnterior, $lt: primerDiaMesActual } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: "$total" } 
        } 
      }
    ]),
    Venta.aggregate([
      { 
        $group: { 
          _id: null, 
          total: { $sum: "$total" } 
        } 
      }
    ]),
    Producto.find({ stock: { $lt: 5 } })
      .select('nombre stock')
      .lean(),
    Cliente.estimatedDocumentCount(),
    FacturaPendiente.countDocuments({ saldo: { $gt: 0 } }),
    Venta.find()
      .sort({ fecha: -1 })
      .limit(5)
      .select('cliente total fecha estado')
      .lean()
  ]);

  const ventasMesActual = ventasMesActualData[0]?.total || 0;
  const ventasMesAnterior = ventasMesAnteriorData[0]?.total || 0;
  const porcentajeCrecimiento = ventasMesAnterior > 0 
    ? ((ventasMesActual - ventasMesAnterior) / ventasMesAnterior) * 100 
    : 0;

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
      totalFacturasPendientes,
      ultimasVentas: ultimasVentas || []
    }
  });
}));

module.exports = router;