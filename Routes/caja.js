const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const mongoose = require('mongoose');
const Joi = require('joi');

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
  return transacciones.sort((a, b) => {
    // Primero comparar por fecha (descendente)
    const dateDiff = new Date(b.fecha) - new Date(a.fecha);
    if (dateDiff !== 0) return dateDiff;
    
    // Si es el mismo día, ordenar por timestamp del ID (ascendente)
    return b._id.getTimestamp() - a._id.getTimestamp();
  });
};

// Obtener una transacción específica
router.get('/transacciones/:id', async (req, res) => {
  try {
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener la transacción',
      error: error.message
    });
  }
});

// Obtener caja con transacciones ordenadas
router.get('/', async (req, res) => {
  try {
    const caja = await Caja.findOne() || 
      await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 }});
    
    // Usar la nueva función de ordenamiento
    const transaccionesOrdenadas = ordenarTransacciones(caja.transacciones);

    res.json({
      success: true,
      transacciones: transaccionesOrdenadas,
      saldos: caja.saldos,
      id: caja._id
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener la caja', 
      error: error.message 
    });
  }
});

// Registrar nueva transacción
router.post('/transacciones', async (req, res) => {
  try {
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
      caja = await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 } });
    }

    const { fecha, concepto, moneda, tipo, monto, tasaCambio } = req.body;
    
    // Validar y convertir valores numéricos
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

    // Agregar la nueva transacción
    caja.transacciones.push(nuevaTransaccion);

    // Ordenar transacciones por fecha
    caja.transacciones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Recalcular saldos
    let saldos = { USD: 0, Bs: 0 };
    caja.transacciones.forEach(t => {
      if (t.moneda === 'USD' || t.moneda === 'Bs') {
        saldos[t.moneda] += t.entrada - t.salida;
        t.saldo = saldos[t.moneda];
      }
    });

    // Actualizar saldos en el documento
    caja.saldos = saldos;

    // Guardar cambios
    await caja.save();

    // Ordenar transacciones para la respuesta
    const transaccionesOrdenadas = ordenarTransacciones(caja.transacciones);

    res.json({ 
      success: true, 
      transacciones: transaccionesOrdenadas, 
      saldos: caja.saldos 
    });
  } catch (error) {
    console.error('Error al procesar transacción:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al procesar la transacción', 
      error: error.message 
    });
  }
});

// Obtener transacciones paginadas
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

// Función auxiliar para validar ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

// Actualizar transacción
router.put('/transacciones/:id', async (req, res) => {
  try {
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
    
    // Actualizar la transacción
    caja.transacciones[transaccionIndex] = {
      ...caja.transacciones[transaccionIndex],
      fecha: formatDateToUTC(fecha),
      concepto,
      moneda,
      entrada: tipo === 'entrada' ? parseFloat(monto) : 0,
      salida: tipo === 'salida' ? parseFloat(monto) : 0,
      tasaCambio: parseFloat(tasaCambio)
    };

    caja.transacciones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    let saldos = { USD: 0, Bs: 0 };
    caja.transacciones.forEach(t => {
      saldos[t.moneda] += t.entrada - t.salida;
      t.saldo = saldos[t.moneda];
    });

    caja.saldos = saldos;
    await caja.save();

    const transaccionesOrdenadas = ordenarTransacciones(caja.transacciones);
    res.json({ 
      success: true, 
      transacciones: transaccionesOrdenadas, 
      saldos: caja.saldos 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error al actualizar transacción', 
      error: error.message 
    });
  }
});

// Eliminar transacción
router.delete('/transacciones/:id', async (req, res) => {
  try {
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
    caja.transacciones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    let saldos = { USD: 0, Bs: 0 };
    caja.transacciones.forEach(t => {
      saldos[t.moneda] += t.entrada - t.salida;
      t.saldo = saldos[t.moneda];
    });

    caja.saldos = saldos;
    await caja.save();

    const transaccionesOrdenadas = ordenarTransacciones(caja.transacciones);
    res.json({ 
      success: true, 
      transacciones: transaccionesOrdenadas, 
      saldos: caja.saldos 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error al eliminar la transacción', 
      error: error.message 
    });
  }
});

module.exports = router;