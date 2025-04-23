const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');

// En routes/caja.js
router.get('/', async (req, res) => {
  try {
    let caja = await Caja.findOne();
    if (!caja) {
      // Crear documento inicial correctamente
      caja = await Caja.create({ 
        transacciones: [], 
        saldos: { USD: 0, Bs: 0 } 
      });
    }
    res.json(caja); // Asegurar respuesta consistente
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener la caja', 
      error: error.message 
    });
  }
});

router.get('/transacciones', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { fecha: -1 }
    };

    const result = await Caja.paginate({}, {
      ...options,
      select: 'transacciones',
      populate: { path: 'transacciones' }
    });

    res.json({
      transacciones: result.docs[0].transacciones,
      total: result.totalDocs,
      totalPages: result.totalPages
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener transacciones', error: error.message });
  }
});

router.post('/transacciones', async (req, res) => {
  try {
    const { fecha, concepto, moneda, entrada, salida, tasaCambio } = req.body;
    
    // Validar tasa de cambio
    const tasa = parseFloat(tasaCambio);
    if (isNaN(tasa) || tasa <= 0) {
      return res.status(400).json({ message: 'Tasa de cambio inválida' });
    }

    // Validar otros campos requeridos
    if (!fecha || !concepto || !moneda) {
      return res.status(400).json({ message: 'Fecha, concepto y moneda son requeridos' });
    }

    // Validación de datos
    if (!['USD', 'Bs'].includes(moneda)) {
      return res.status(400).json({ message: 'Moneda inválida' });
    }
    
    const caja = await Caja.findOne();
    if (!caja) throw new Error('Registro de caja no encontrado');

    // Convertir a números
    const entradaNum = parseFloat(entrada) || 0;
    const salidaNum = parseFloat(salida) || 0;

    const nuevoSaldo = caja.saldos[moneda] + entradaNum - salidaNum;
    
    const nuevaTransaccion = {
      fecha:  new Date(fecha).toISOString(),
      concepto,
      moneda,
      entrada: entradaNum,
      salida: salidaNum,
      saldo: nuevoSaldo,
      tasaCambio: tasa
    };

    // Actualización atómica
    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      {
        $push: { transacciones: nuevaTransaccion },
        $set: { [`saldos.${moneda}`]: nuevoSaldo }
      },
      { new: true }
    );

    res.json({
      transacciones: updated.transacciones,
      saldos: updated.saldos
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Error al agregar transacción',
      error: error.message
    });
  }
});

module.exports = router;