const express = require('express');
const FacturaPendiente = require('../models/FacturaPendiente');
const router = express.Router();

// Obtener facturas pendientes con paginación
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      estado, 
      fechaDesde, 
      fechaHasta,
      busqueda
    } = req.query;
    
    // Construir objeto de consulta
    const query = {};
    
    // Filtrar por estado
    if (estado === 'pendientes') {
      query.saldo = { $gt: 0 };
    } else if (estado === 'pagadas') {
      query.saldo = 0;
    } else if (estado === 'parciales') {
      query.abono = { $gt: 0 };
      query.saldo = { $gt: 0 };
    }
    
    // Filtrar por rango de fechas
    if (fechaDesde || fechaHasta) {
      query.fecha = {};
      if (fechaDesde) {
        query.fecha.$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        const fechaHastaObj = new Date(fechaHasta);
        fechaHastaObj.setHours(23, 59, 59, 999);
        query.fecha.$lte = fechaHastaObj;
      }
    }
    
    // Filtrar por término de búsqueda
    if (busqueda) {
      const regex = new RegExp(busqueda, 'i');
      query.$or = [
        { concepto: regex },
        { proveedor: regex },
        { numeroFactura: regex }
      ];
    }
    
    // Opciones de paginación
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { fecha: -1 }
    };
    
    const result = await FacturaPendiente.paginate(query, options);
    
    res.json({
      facturas: result.docs,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      currentPage: result.page,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage,
      prevPage: result.prevPage
    });
  } catch (error) {
    console.error('Error al obtener facturas pendientes:', error);
    res.status(500).json({ message: 'Error al obtener las facturas pendientes' });
  }
});

// Crear una nueva factura pendiente
router.post('/', async (req, res) => {
  const { fecha, concepto, proveedor, numeroFactura, monto } = req.body;

  if (!concepto || !monto) {
    return res.status(400).json({ message: 'Concepto y monto son requeridos' });
  }

  try {
    const nuevaFactura = new FacturaPendiente({
      fecha: fecha || new Date(),
      concepto,
      proveedor,
      numeroFactura,
      monto
    });
    
    await nuevaFactura.save();
    res.status(201).json(nuevaFactura);
  } catch (error) {
    console.error('Error al crear factura pendiente:', error);
    res.status(500).json({ message: 'Error al crear la factura pendiente' });
  }
});

// Registrar un abono
router.post('/:id/abonos', async (req, res) => {
  const { monto, moneda, tasaCambio } = req.body;
  const facturaId = req.params.id;

  if (!monto || monto <= 0) {
    return res.status(400).json({ message: 'Monto inválido' });
  }

  if (!moneda || !['Bs', 'USD'].includes(moneda)) {
    return res.status(400).json({ message: 'Moneda inválida. Debe ser Bs o USD' });
  }

  if (!tasaCambio || tasaCambio <= 0) {
    return res.status(400).json({ message: 'Tasa de cambio inválida' });
  }

  try {
    const factura = await FacturaPendiente.findById(facturaId);
    
    if (!factura) {
      return res.status(404).json({ message: 'Factura no encontrada' });
    }

    // Convertir el monto a Bs si es necesario
    const montoEnBs = moneda === 'Bs' ? monto : monto * tasaCambio;
    const saldoEnBs = factura.saldo;

    // Usar una comparación con tolerancia decimal
    if (montoEnBs > saldoEnBs + 0.0099) { // Tolerancia de 0.01
      return res.status(400).json({ 
        message: `El abono supera el saldo. Saldo disponible: ${saldoEnBs.toFixed(2)} Bs (${(saldoEnBs/tasaCambio).toFixed(2)} USD)`
      });
    }

    // Redondear correctamente
    const montoFinal = Math.round(montoEnBs * 100) / 100;
    
    factura.abono += montoFinal;
    factura.monedaAbono = moneda;
    await factura.save();
    
    res.status(200).json(factura);
  } catch (error) {
    console.error('Error al registrar abono:', error);
    res.status(500).json({ message: 'Error al registrar el abono' });
  }
});

// Eliminar una factura pendiente
router.delete('/:id', async (req, res) => {
  try {
    const facturaId = req.params.id;
    const factura = await FacturaPendiente.findByIdAndDelete(facturaId);
    
    if (!factura) {
      return res.status(404).json({ message: 'Factura no encontrada' });
    }
    
    res.status(200).json({ message: 'Factura eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar factura:', error);
    res.status(500).json({ message: 'Error al eliminar la factura' });
  }
});

// Actualizar una factura pendiente
router.put('/:id', async (req, res) => {
  try {
    const facturaId = req.params.id;
    const { concepto, proveedor, numeroFactura, monto, fecha } = req.body;
    
    const facturaActualizada = await FacturaPendiente.findByIdAndUpdate(
      facturaId,
      { concepto, proveedor, numeroFactura, monto, fecha },
      { new: true, runValidators: true }
    );
    
    if (!facturaActualizada) {
      return res.status(404).json({ message: 'Factura no encontrada' });
    }
    
    res.status(200).json(facturaActualizada);
  } catch (error) {
    console.error('Error al actualizar factura:', error);
    res.status(500).json({ message: 'Error al actualizar la factura' });
  }
});

module.exports = router; 