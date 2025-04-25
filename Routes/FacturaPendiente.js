const express = require('express');
const FacturaPendiente = require('../models/FacturaPendiente');
const router = express.Router();

// Obtener todas las facturas pendientes
router.get('/facturas-pendientes', async (req, res) => {
  try {
    const facturas = await FacturaPendiente.find().sort({ fecha: -1 });
    res.json(facturas);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las facturas pendientes' });
  }
});

// Crear una nueva factura pendiente
router.post('/facturas-pendientes', async (req, res) => {
  const { fecha, concepto, monto } = req.body;

  if (!concepto || !monto) {
    return res.status(400).json({ message: 'Concepto y monto son requeridos' });
  }

  try {
    const nuevaFactura = new FacturaPendiente({
      fecha: fecha || new Date(),
      concepto,
      monto
    });
    
    await nuevaFactura.save();
    res.status(201).json(nuevaFactura);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear la factura pendiente' });
  }
});

// Registrar un abono
router.post('/facturas-pendientes/:id/abonos', async (req, res) => {
  const { monto } = req.body;
  const facturaId = req.params.id;

  if (!monto || monto <= 0) {
    return res.status(400).json({ message: 'Monto inválido' });
  }

  try {
    const factura = await FacturaPendiente.findById(facturaId);
    
    if (!factura) {
      return res.status(404).json({ message: 'Factura no encontrada' });
    }
    
    if (monto > factura.saldo) {
      return res.status(400).json({ message: 'El abono supera el saldo' });
    }
    
    factura.abono += monto;
    await factura.save();
    
    res.status(200).json(factura);
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar el abono' });
  }
});

module.exports = router;
