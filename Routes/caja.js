const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const moment = require('moment-timezone');

// Ruta para obtener la caja
router.get('/', async (req, res) => {
  try {
    const caja = await Caja.findOne() || await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 }});
    res.json({
      transacciones: caja.transacciones,
      saldos: caja.saldos,
      _id: caja._id,
      __v: caja.__v
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la caja', error: error.message });
  }
});

// Obtener transacciones con paginación manual
router.get('/transacciones', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const caja = await Caja.findOne().lean();
    
    if (!caja) return res.status(404).json({ message: 'Caja no encontrada' });

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const transacciones = caja.transacciones
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(startIndex, endIndex);

    res.json({
      transacciones,
      total: caja.transacciones.length,
      totalPages: Math.ceil(caja.transacciones.length / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener transacciones', error: error.message });
  }
});

// Registrar nueva transacción
router.post('/transacciones', async (req, res) => {
  try {
    const { fecha, concepto, moneda, entrada, salida, tasaCambio } = req.body;
    
    const validacion = validarCampos(req.body);
    if (validacion.error) return res.status(400).json(validacion);

    const caja = await Caja.findOne();
    const nuevaTransaccion = crearTransaccion(fecha, concepto, moneda, entrada, salida, tasaCambio, caja);

    // Agregar transacción y reordenar
    let transaccionesActualizadas = [...caja.transacciones, nuevaTransaccion];
    transaccionesActualizadas = transaccionesActualizadas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Recalcular saldos secuencialmente
    const { saldos } = recalcularSaldos(transaccionesActualizadas);

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        transacciones: transaccionesActualizadas,
        saldos
      },
      { new: true }
    );

    res.json({ transacciones: updated.transacciones, saldos: updated.saldos });
  } catch (error) {
    res.status(500).json({ message: 'Error al agregar transacción', error: error.message });
  }
});

// Eliminar transacción
router.delete('/transacciones/:id', async (req, res) => {
  try {
    const caja = await Caja.findOne();
    const transaccion = caja.transacciones.id(req.params.id);
    
    if (!transaccion) return res.status(404).json({ message: 'Transacción no encontrada' });

    // Eliminar y reordenar
    let transaccionesActualizadas = caja.transacciones.filter(t => t._id.toString() !== req.params.id);
    transaccionesActualizadas = transaccionesActualizadas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Recalcular saldos
    const { saldos } = recalcularSaldos(transaccionesActualizadas);

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        transacciones: transaccionesActualizadas,
        saldos
      },
      { new: true }
    );

    res.json({ transacciones: updated.transacciones, saldos: updated.saldos });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la transacción', error: error.message });
  }
});

// Actualizar transacción
router.put('/transacciones/:id', async (req, res) => {
  try {
    const { fecha, concepto, moneda, entrada, salida, tasaCambio } = req.body;
    const validacion = validarCampos(req.body);
    if (validacion.error) return res.status(400).json(validacion);

    const caja = await Caja.findOne();
    const index = caja.transacciones.findIndex(t => t._id.toString() === req.params.id);
    
    if (index === -1) return res.status(404).json({ message: 'Transacción no encontrada' });

    // Actualizar transacción
    const updatedTransaccion = crearTransaccion(fecha, concepto, moneda, entrada, salida, tasaCambio, caja);
    let transaccionesActualizadas = [...caja.transacciones];
    transaccionesActualizadas[index] = updatedTransaccion;
    
    // Reordenar por fecha
    transaccionesActualizadas = transaccionesActualizadas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Recalcular saldos secuencialmente
    const { saldos } = recalcularSaldos(transaccionesActualizadas);

    const final = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        transacciones: transaccionesActualizadas,
        saldos
      },
      { new: true }
    );

    res.json({ 
      transacciones: final.transacciones, 
      saldos: final.saldos 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar la transacción', error: error.message });
  }
});

// Función para recalcular saldos
const recalcularSaldos = (transacciones) => {
  let currentSaldoUSD = 0;
  let currentSaldoBs = 0;
  
  const transaccionesConSaldo = transacciones.map(t => {
    if (t.moneda === 'USD') {
      currentSaldoUSD += t.entrada - t.salida;
      return { ...t.toObject ? t.toObject() : t, saldo: currentSaldoUSD };
    } else {
      currentSaldoBs += t.entrada - t.salida;
      return { ...t.toObject ? t.toObject() : t, saldo: currentSaldoBs };
    }
  });

  return {
    transacciones: transaccionesConSaldo,
    saldos: {
      USD: currentSaldoUSD,
      Bs: currentSaldoBs
    }
  };
};

// Funciones auxiliares existentes
const validarCampos = ({ tasaCambio, fecha, concepto, moneda }) => {
  const errors = {};
  const fechaObj = new Date(fecha);
  if (isNaN(fechaObj.getTime())) errors.fecha = 'Fecha inválida';
  if (!concepto) errors.concepto = 'Concepto requerido';
  if (!['USD', 'Bs'].includes(moneda)) errors.moneda = 'Moneda inválida';
  if (isNaN(tasaCambio) || tasaCambio <= 0) errors.tasaCambio = 'Tasa inválida';
  
  return Object.keys(errors).length > 0 
    ? { error: true, message: 'Errores de validación', details: errors }
    : { error: false };
};

const crearTransaccion = (fecha, concepto, moneda, entrada, salida, tasaCambio, caja) => {
  const entradaNum = parseFloat(entrada) || 0;
  const salidaNum = parseFloat(salida) || 0;
  
  const fechaObj = new Date(fecha);
  fechaObj.setHours(12, 0, 0, 0);
  
  return {
    fecha: fechaObj,
    concepto,
    moneda,
    entrada: entradaNum,
    salida: salidaNum,
    saldo: caja.saldos[moneda] + entradaNum - salidaNum,
    tasaCambio: parseFloat(tasaCambio)
  };
};

module.exports = router;