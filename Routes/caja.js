const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const moment = require('moment-timezone');

// Ruta para obtener la caja
router.get('/', async (req, res) => {
  try {
    // Buscar la caja existente o crear una nueva si no existe
    const caja = await Caja.findOne() || await Caja.create({ transacciones: [], saldos: { USD: 0, Bs: 0 }});
    
    // Asegurar que la respuesta tenga la estructura correcta
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

// Registrar nueva transacción con corrección de zona horaria
router.post('/transacciones', async (req, res) => {
  try {
    const { fecha, concepto, moneda, entrada, salida, tasaCambio } = req.body;
    
    // Validación de campos
    const validacion = validarCampos(req.body);
    if (validacion.error) return res.status(400).json(validacion);

    const caja = await Caja.findOne();
    const nuevaTransaccion = crearTransaccion(fecha, concepto, moneda, entrada, salida, tasaCambio, caja);

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        $push: { transacciones: nuevaTransaccion },
        $set: { [`saldos.${moneda}`]: nuevaTransaccion.saldo }
      },
      { new: true }
    );

    res.json({ transacciones: updated.transacciones, saldos: updated.saldos });
  } catch (error) {
    res.status(500).json({ message: 'Error al agregar transacción', error: error.message });
  }
});

// Ruta para eliminar una transacción
router.delete('/transacciones/:id', async (req, res) => {
  try {
    const caja = await Caja.findOne();
    const transaccion = caja.transacciones.id(req.params.id);
    
    if (!transaccion) {
      return res.status(404).json({ message: 'Transacción no encontrada' });
    }

    // Recalcular saldos
    const moneda = transaccion.moneda;
    const saldoActual = caja.saldos[moneda];
    const nuevoSaldo = saldoActual - transaccion.entrada + transaccion.salida;

    // Eliminar la transacción y actualizar saldos
    await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        $pull: { transacciones: { _id: req.params.id } },
        $set: { [`saldos.${moneda}`]: nuevoSaldo }
      },
      { new: true }
    );

    const updated = await Caja.findOne();
    res.json({ transacciones: updated.transacciones, saldos: updated.saldos });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la transacción', error: error.message });
  }
});

// Ruta para actualizar una transacción
router.put('/transacciones/:id', async (req, res) => {
  try {
    const { fecha, concepto, moneda, entrada, salida, tasaCambio } = req.body;
    
    const validacion = validarCampos(req.body);
    if (validacion.error) return res.status(400).json(validacion);

    const caja = await Caja.findOne();
    const transaccion = caja.transacciones.id(req.params.id);
    
    if (!transaccion) {
      return res.status(404).json({ message: 'Transacción no encontrada' });
    }

    // Asegurarnos de que la fecha se maneje correctamente
    const fechaFormateada = moment.tz(fecha, 'America/Caracas').startOf('day').toDate();

    // Actualizar la transacción existente
    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id, 'transacciones._id': req.params.id },
      { 
        $set: {
          'transacciones.$.fecha': fechaFormateada,
          'transacciones.$.concepto': concepto,
          'transacciones.$.moneda': moneda,
          'transacciones.$.entrada': parseFloat(entrada) || 0,
          'transacciones.$.salida': parseFloat(salida) || 0,
          'transacciones.$.tasaCambio': parseFloat(tasaCambio)
        }
      },
      { new: true }
    );

    // Recalcular saldos
    const saldos = { USD: 0, Bs: 0 };
    updated.transacciones.forEach(t => {
      saldos[t.moneda] += t.entrada - t.salida;
    });

    // Actualizar saldos y ordenar transacciones
    const final = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        $set: { 
          saldos,
          transacciones: updated.transacciones.sort((a, b) => 
            new Date(b.fecha) - new Date(a.fecha)
          )
        }
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

// Funciones auxiliares
const validarCampos = ({ tasaCambio, fecha, concepto, moneda }) => {
  const errors = {};
  if (!moment(fecha).isValid()) errors.fecha = 'Fecha inválida';
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
  
  // Asegurar que la fecha se guarde en la zona horaria correcta
  const fechaFormateada = moment.tz(fecha, 'America/Caracas')
    .startOf('day')
    .toDate();
  
  return {
    fecha: fechaFormateada,
    concepto,
    moneda,
    entrada: entradaNum,
    salida: salidaNum,
    saldo: caja.saldos[moneda] + entradaNum - salidaNum,
    tasaCambio: parseFloat(tasaCambio)
  };
};

module.exports = router;