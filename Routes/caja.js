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

// Obtener caja con transacciones ordenadas y paginadas
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, moneda } = req.query;
    const skip = (page - 1) * limit;

    // Construir el pipeline de agregación
    const pipeline = [
      {
        $facet: {
          transacciones: [
            { $sort: { fecha: -1, _id: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
          ],
          total: [
            { $count: 'count' }
          ],
          saldos: [
            {
              $group: {
                _id: '$moneda',
                entradas: { $sum: '$entrada' },
                salidas: { $sum: '$salida' }
              }
            }
          ]
        }
      }
    ];

    // Agregar filtro por moneda si se especifica
    if (moneda && moneda !== 'TODAS') {
      pipeline.unshift({
        $match: { moneda }
      });
    }

    const caja = await Caja.findOne() || 
      await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 }});

    const [result] = await Caja.aggregate(pipeline);

    // Calcular saldos finales
    const saldos = {
      USD: 0,
      Bs: 0
    };

    result.saldos.forEach(s => {
      saldos[s._id] = s.entradas - s.salidas;
    });

    res.json({
      success: true,
      transacciones: result.transacciones,
      saldos,
      total: result.total[0]?.count || 0,
      totalPages: Math.ceil((result.total[0]?.count || 0) / limit),
      currentPage: parseInt(page)
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

    // Obtener o crear caja
    let caja = await Caja.findOne() || await Caja.create({ 
      transacciones: [], 
      saldos: { USD: 0, Bs: 0 }
    });

    // Agregar nueva transacción
    caja.transacciones.push(nuevaTransaccion);
    
    // Ordenar cronológicamente
    caja.transacciones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Recalcular saldos desde cero
    let saldos = { USD: 0, Bs: 0 };
    caja.transacciones.forEach((t, index) => {
      if (t.moneda === 'USD' || t.moneda === 'Bs') {
        saldos[t.moneda] += t.entrada - t.salida;
        caja.transacciones[index].saldo = saldos[t.moneda];
      }
    });

    // Actualizar saldos generales
    caja.saldos = saldos;
    
    // Guardar cambios
    await caja.save();

    // Obtener transacciones paginadas para la respuesta
    const pipeline = [
      {
        $facet: {
          transacciones: [
            { $sort: { fecha: -1, _id: -1 } },
            { $limit: 50 }
          ],
          saldos: [
            {
              $group: {
                _id: '$moneda',
                entradas: { $sum: '$entrada' },
                salidas: { $sum: '$salida' }
              }
            }
          ]
        }
      }
    ];

    const [result] = await Caja.aggregate(pipeline);

    res.json({
      success: true,
      transacciones: result.transacciones,
      saldos: caja.saldos
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Actualizar transacción
router.put('/transacciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
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

    // Obtener transacciones paginadas para la respuesta
    const pipeline = [
      {
        $facet: {
          transacciones: [
            { $sort: { fecha: -1, _id: -1 } },
            { $limit: 50 }
          ],
          saldos: [
            {
              $group: {
                _id: '$moneda',
                entradas: { $sum: '$entrada' },
                salidas: { $sum: '$salida' }
              }
            }
          ]
        }
      }
    ];

    const [result] = await Caja.aggregate(pipeline);

    res.json({ 
      success: true, 
      transacciones: result.transacciones, 
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
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
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

    // Obtener transacciones paginadas para la respuesta
    const pipeline = [
      {
        $facet: {
          transacciones: [
            { $sort: { fecha: -1, _id: -1 } },
            { $limit: 50 }
          ],
          saldos: [
            {
              $group: {
                _id: '$moneda',
                entradas: { $sum: '$entrada' },
                salidas: { $sum: '$salida' }
              }
            }
          ]
        }
      }
    ];

    const [result] = await Caja.aggregate(pipeline);

    res.json({ 
      success: true, 
      transacciones: result.transacciones, 
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