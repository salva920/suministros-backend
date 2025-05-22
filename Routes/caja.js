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

    const caja = await Caja.findOne();
    if (!caja) {
      return res.status(404).json({ 
        success: false,
        message: 'Caja no encontrada' 
      });
    }

    const { fecha, concepto, moneda, tipo, monto, tasaCambio } = req.body;
    const montoNumerico = parseFloat(monto);
    
    // Obtener el último saldo para esta moneda
    const ultimaTransaccion = caja.transacciones
      .filter(t => t.moneda === moneda)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
    
    const saldoAnterior = ultimaTransaccion ? ultimaTransaccion.saldo : 0;
    
    const nuevaTransaccion = {
      fecha: formatDateToUTC(fecha),
      concepto,
      moneda,
      entrada: tipo === 'entrada' ? montoNumerico : 0,
      salida: tipo === 'salida' ? montoNumerico : 0,
      tasaCambio: parseFloat(tasaCambio),
      saldo: tipo === 'entrada' ? 
        saldoAnterior + montoNumerico : 
        saldoAnterior - montoNumerico
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

    // Recalcular todos los saldos para asegurar consistencia
    const transaccionesOrdenadas = ordenarTransacciones(updated.transacciones);
    const saldosRecalculados = { USD: 0, Bs: 0 };
    
    // Calcular saldos por moneda
    transaccionesOrdenadas.forEach(t => {
      if (t.moneda === 'USD') {
        saldosRecalculados.USD += t.entrada - t.salida;
      } else if (t.moneda === 'Bs') {
        saldosRecalculados.Bs += t.entrada - t.salida;
      }
    });

    // Actualizar los saldos recalculados
    await Caja.findOneAndUpdate(
      { _id: caja._id },
      { $set: { saldos: saldosRecalculados } }
    );

    res.json({
      success: true,
      transacciones: transaccionesOrdenadas,
      saldos: saldosRecalculados
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error al agregar transacción', 
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
    console.log('ID recibido:', id);
    
    if (!isValidObjectId(id)) {
      console.log('ID inválido:', id);
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

    const caja = await Caja.findOne();
    if (!caja) {
      return res.status(404).json({ 
        success: false,
        message: 'Caja no encontrada' 
      });
    }

    const transaccionIndex = caja.transacciones.findIndex(t => t._id.toString() === id);
    console.log('Índice de transacción:', transaccionIndex);
    
    if (transaccionIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Transacción no encontrada' 
      });
    }

    const { fecha, concepto, moneda, tipo, monto, tasaCambio } = req.body;
    
    const transaccionOriginal = caja.transacciones[transaccionIndex];
    const montoOriginal = transaccionOriginal.entrada - transaccionOriginal.salida;
    const montoNuevo = tipo === 'entrada' ? parseFloat(monto) : -parseFloat(monto);
    const diferencia = montoNuevo - montoOriginal;

    const transaccionActualizada = {
      _id: new mongoose.Types.ObjectId(id),
      fecha: formatDateToUTC(fecha),
      concepto,
      moneda,
      entrada: tipo === 'entrada' ? parseFloat(monto) : 0,
      salida: tipo === 'salida' ? parseFloat(monto) : 0,
      tasaCambio: parseFloat(tasaCambio),
      saldo: transaccionOriginal.saldo + diferencia
    };

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id, 'transacciones._id': id },
      { 
        $set: { 
          'transacciones.$': transaccionActualizada,
          [`saldos.${moneda}`]: caja.saldos[moneda] + diferencia
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'No se pudo actualizar la transacción'
      });
    }

    // Usar la nueva función de ordenamiento
    const transaccionesOrdenadas = ordenarTransacciones(updated.transacciones);

    res.json({
      success: true,
      transacciones: transaccionesOrdenadas,
      saldos: updated.saldos
    });
  } catch (error) {
    console.error('Error al actualizar:', error);
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
    console.log('ID a eliminar:', id);
    
    if (!isValidObjectId(id)) {
      console.log('ID inválido:', id);
      return res.status(400).json({
        success: false,
        message: 'ID de transacción inválido'
      });
    }

    const caja = await Caja.findOne();
    if (!caja) {
      return res.status(404).json({ 
        success: false,
        message: 'Caja no encontrada' 
      });
    }

    const transaccion = caja.transacciones.id(id);
    if (!transaccion) {
      return res.status(404).json({ 
        success: false,
        message: 'Transacción no encontrada' 
      });
    }

    const transaccionAEliminar = caja.transacciones.find(t => t._id.toString() === id);
    const moneda = transaccionAEliminar.moneda;
    const monto = transaccionAEliminar.entrada - transaccionAEliminar.salida;

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        $pull: { transacciones: { _id: id } },
        $inc: { [`saldos.${moneda}`]: -monto }
      },
      { new: true }
    );

    // Usar la nueva función de ordenamiento
    const transaccionesOrdenadas = ordenarTransacciones(updated.transacciones);

    res.json({
      success: true,
      transacciones: transaccionesOrdenadas,
      saldos: updated.saldos
    });
  } catch (error) {
    console.error('Error al eliminar:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al eliminar la transacción', 
      error: error.message 
    });
  }
});

module.exports = router;