const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const mongoose = require('mongoose');
const Joi = require('joi');

// Middleware para manejar errores
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
};

// Helper para formatear fecha consistente
const formatDateToUTC = (dateString) => {
  const date = new Date(dateString);
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12, 0, 0, 0
  ));
};

// Validación de transacciones
const validateTransaction = (data) => {
  const schema = Joi.object({
    fecha: Joi.date().required(),
    concepto: Joi.string().trim().required().min(3).max(100),
    moneda: Joi.string().valid('USD', 'Bs').required(),
    tipo: Joi.string().valid('entrada', 'salida').required(),
    monto: Joi.number().positive().required(),
    tasaCambio: Joi.number().positive().required()
  });

  return schema.validate(data, { 
    abortEarly: false,
    allowUnknown: false
  });
};

// Función de ordenamiento común para todos los endpoints
const ordenarTransacciones = (transacciones) => {
  return [...transacciones].sort((a, b) => {
    const dateDiff = new Date(b.fecha) - new Date(a.fecha);
    if (dateDiff !== 0) return dateDiff;

    const aTimestamp = typeof a._id?.getTimestamp === 'function'
      ? a._id.getTimestamp()
      : new Date(a.fecha).getTime();
    const bTimestamp = typeof b._id?.getTimestamp === 'function'
      ? b._id.getTimestamp()
      : new Date(b.fecha).getTime();

    return bTimestamp - aTimestamp;
  });
};

const ordenarTransaccionesAsc = (transacciones) => {
  return transacciones.sort((a, b) => {
    const dateDiff = new Date(a.fecha) - new Date(b.fecha);
    if (dateDiff !== 0) return dateDiff;

    const aTimestamp = typeof a._id?.getTimestamp === 'function'
      ? a._id.getTimestamp()
      : new Date(a.fecha).getTime();
    const bTimestamp = typeof b._id?.getTimestamp === 'function'
      ? b._id.getTimestamp()
      : new Date(b.fecha).getTime();

    return aTimestamp - bTimestamp;
  });
};

// Función auxiliar para validar ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Función para recalcular saldos
const recalcularSaldos = (transacciones) => {
  const saldos = { USD: 0, Bs: 0 };
  transacciones.forEach(t => {
    if (t.moneda === 'USD' || t.moneda === 'Bs') {
      saldos[t.moneda] += t.entrada - t.salida;
      t.saldo = saldos[t.moneda];
    }
  });
  return saldos;
};

// Obtener una transacción específica
router.get('/transacciones/:id', asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'ID de transacción inválido'
    });
  }

  const caja = await Caja.findOne({ 
    'transacciones._id': new mongoose.Types.ObjectId(req.params.id) 
  });

  if (!caja) {
    return res.status(404).json({
      success: false,
      message: 'No se encontró la caja con esta transacción'
    });
  }

  const transaccion = caja.transacciones.find(t => t._id.toString() === req.params.id);

  if (!transaccion) {
    return res.status(404).json({
      success: false,
      message: 'Transacción no encontrada'
    });
  }

  res.json({
    success: true,
    transaccion
  });
}));

// Obtener caja con transacciones ordenadas
router.get('/', asyncHandler(async (req, res) => {
  const caja = await Caja.findOne() || 
    await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 }});
  
  const resumen = {
    USD: { entradas: 0, salidas: 0, saldo: 0 },
    Bs: { entradas: 0, salidas: 0, saldo: 0 }
  };

  caja.transacciones.forEach(t => {
    if (t.moneda === 'USD' || t.moneda === 'Bs') {
      resumen[t.moneda].entradas += t.entrada;
      resumen[t.moneda].salidas += t.salida;
      resumen[t.moneda].saldo = resumen[t.moneda].entradas - resumen[t.moneda].salidas;
    }
  });

  res.json({
    success: true,
    transacciones: ordenarTransacciones(caja.transacciones),
    saldos: caja.saldos,
    id: caja._id
  });
}));

// Registrar nueva transacción
router.post('/transacciones', asyncHandler(async (req, res) => {
  const { error } = validateTransaction(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false,
      message: 'Errores de validación',
      details: error.details.map(d => d.message)
    });
  }

  const { fecha, concepto, moneda, tipo, monto, tasaCambio } = req.body;
  const montoNumerico = parseFloat(monto);
  const tasaCambioNumerica = parseFloat(tasaCambio);

  if (isNaN(montoNumerico) || isNaN(tasaCambioNumerica)) {
    return res.status(400).json({
      success: false,
      message: 'Valores numéricos inválidos'
    });
  }

  const nuevaTransaccion = {
    fecha: formatDateToUTC(fecha),
    concepto: concepto.trim(),
    moneda,
    entrada: tipo === 'entrada' ? montoNumerico : 0,
    salida: tipo === 'salida' ? montoNumerico : 0,
    tasaCambio: tasaCambioNumerica
  };

  let caja = await Caja.findOne() || await Caja.create({ 
    transacciones: [], 
    saldos: { USD: 0, Bs: 0 }
  });

  caja.transacciones.push(nuevaTransaccion);
  ordenarTransaccionesAsc(caja.transacciones);
  caja.saldos = recalcularSaldos(caja.transacciones);
  
  await caja.save();

  res.json({
    success: true,
    transacciones: ordenarTransacciones(caja.transacciones),
    saldos: caja.saldos
  });
}));

// Obtener transacciones paginadas
router.get('/transacciones', asyncHandler(async (req, res) => {
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
}));

// Actualizar transacción
router.put('/transacciones/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: 'ID de transacción inválido'
    });
  }

  const { error } = validateTransaction(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false,
      message: 'Errores de validación',
      details: error.details.map(d => d.message)
    });
  }

  let caja = await Caja.findOne();
  if (!caja) {
    return res.status(404).json({ 
      success: false,
      message: 'Caja no encontrada' 
    });
  }

  const transaccionIndex = caja.transacciones.findIndex(t => t._id.toString() === id);
  if (transaccionIndex === -1) {
    return res.status(404).json({ 
      success: false,
      message: 'Transacción no encontrada' 
    });
  }

  const { fecha, concepto, moneda, tipo, monto, tasaCambio } = req.body;
  
  caja.transacciones[transaccionIndex] = {
    ...caja.transacciones[transaccionIndex],
    fecha: formatDateToUTC(fecha),
    concepto,
    moneda,
    entrada: tipo === 'entrada' ? parseFloat(monto) : 0,
    salida: tipo === 'salida' ? parseFloat(monto) : 0,
    tasaCambio: parseFloat(tasaCambio)
  };

  ordenarTransaccionesAsc(caja.transacciones);
  caja.saldos = recalcularSaldos(caja.transacciones);
  await caja.save();

  res.json({ 
    success: true, 
    transacciones: ordenarTransacciones(caja.transacciones), 
    saldos: caja.saldos 
  });
}));

// Eliminar transacción
router.delete('/transacciones/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: 'ID de transacción inválido'
    });
  }

  let caja = await Caja.findOne();
  if (!caja) {
    return res.status(404).json({ 
      success: false,
      message: 'Caja no encontrada' 
    });
  }

  caja.transacciones = caja.transacciones.filter(t => t._id.toString() !== id);
  ordenarTransaccionesAsc(caja.transacciones);
  caja.saldos = recalcularSaldos(caja.transacciones);
  await caja.save();

  res.json({ 
    success: true, 
    transacciones: ordenarTransacciones(caja.transacciones), 
    saldos: caja.saldos 
  });
}));

module.exports = router;