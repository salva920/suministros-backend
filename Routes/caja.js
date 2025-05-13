const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const multer = require('multer');
const xlsx = require('xlsx');
const { validateTransaction } = require('../validators/cajaValidator');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

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

// Obtener caja con transacciones ordenadas
router.get('/', async (req, res) => {
  try {
    const caja = await Caja.findOne() || 
      await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 }});
    
    // Ordenar transacciones por fecha descendente
    const transaccionesOrdenadas = caja.transacciones.sort((a, b) => 
      new Date(b.fecha) - new Date(a.fecha)
    );

    res.json({
      transacciones: transaccionesOrdenadas,
      saldos: caja.saldos,
      id: caja._id
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener la caja', 
      error: error.message 
    });
  }
});

// Registrar nueva transacción con validación mejorada
router.post('/transacciones', async (req, res) => {
  try {
    const { error } = validateTransaction(req.body);
    if (error) return res.status(400).json(error.details);

    const caja = await Caja.findOne();
    if (!caja) return res.status(404).json({ message: 'Caja no encontrada' });

    const { fecha, concepto, moneda, entrada, salida, tasaCambio } = req.body;
    
    const nuevaTransaccion = {
      fecha: formatDateToUTC(fecha),
      concepto,
      moneda,
      entrada: parseFloat(entrada) || 0,
      salida: parseFloat(salida) || 0,
      tasaCambio: parseFloat(tasaCambio),
      saldo: caja.saldos[moneda] + (parseFloat(entrada) || 0) - (parseFloat(salida) || 0)
    };

    // Actualizar saldos
    const saldosActualizados = { ...caja.saldos };
    saldosActualizados[moneda] = nuevaTransaccion.saldo;

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        $push: { transacciones: nuevaTransaccion },
        $set: { saldos: saldosActualizados }
      },
      { new: true }
    );

    res.json({
      transacciones: updated.transacciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
      saldos: updated.saldos
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al agregar transacción', 
      error: error.message 
    });
  }
});

// Validator separado (cajaValidator.js)
const Joi = require('joi');

const transactionSchema = Joi.object({
  fecha: Joi.date().required(),
  concepto: Joi.string().trim().required().min(3).max(100),
  moneda: Joi.string().valid('USD', 'Bs').required(),
  entrada: Joi.number().min(0).default(0),
  salida: Joi.number().min(0).default(0),
  tasaCambio: Joi.number().positive().required()
}).or('entrada', 'salida');

exports.validateTransaction = (data) => {
  return transactionSchema.validate(data, { 
    abortEarly: false,
    allowUnknown: false
  });
};