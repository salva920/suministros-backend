const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const Joi = require('joi');

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
    
    // Ordenar transacciones por fecha descendente
    const transaccionesOrdenadas = caja.transacciones.sort((a, b) => 
      new Date(b.fecha) - new Date(a.fecha)
    );

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
    
    const nuevaTransaccion = {
      fecha: formatDateToUTC(fecha),
      concepto,
      moneda,
      entrada: tipo === 'entrada' ? parseFloat(monto) : 0,
      salida: tipo === 'salida' ? parseFloat(monto) : 0,
      tasaCambio: parseFloat(tasaCambio),
      saldo: caja.saldos[moneda] + (tipo === 'entrada' ? parseFloat(monto) : -parseFloat(monto))
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
      success: true,
      transacciones: updated.transacciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
      saldos: updated.saldos
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
    console.log('ID recibido:', id); // Para debugging
    
    // Validar el ID
    if (!isValidObjectId(id)) {
      console.log('ID inválido:', id); // Para debugging
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
    console.log('Índice de transacción:', transaccionIndex); // Para debugging
    
    if (transaccionIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Transacción no encontrada' 
      });
    }

    const { fecha, concepto, moneda, tipo, monto, tasaCambio } = req.body;
    
    // Guardar valores antiguos para ajuste de saldo
    const transaccionOriginal = caja.transacciones[transaccionIndex];
    const montoOriginal = transaccionOriginal.entrada - transaccionOriginal.salida;
    const montoNuevo = tipo === 'entrada' ? parseFloat(monto) : -parseFloat(monto);
    const diferencia = montoNuevo - montoOriginal;

    // Actualizar transacción
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

    // Actualizar documento
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

    res.json({
      success: true,
      transacciones: updated.transacciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
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
    console.log('ID a eliminar:', id); // Para debugging
    
    if (!isValidObjectId(id)) {
      console.log('ID inválido:', id); // Para debugging
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

    // Eliminar y recalcular saldos
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

    res.json({
      success: true,
      transacciones: updated.transacciones,
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

// Importar Excel
router.post('/importar-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha subido ningún archivo' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '', header: 1 });

    const transacciones = data.slice(16).map((row) => {
      try {
        // Procesamiento de fecha
        let fecha;
        if (typeof row[3] === 'string') {
          const dateParts = row[3].split('/');
          if (dateParts.length === 3) {
            const [day, month, year] = dateParts;
            const fullYear = year.length === 2 ? `20${year}` : year;
            fecha = new Date(Date.UTC(fullYear, month - 1, day, 12, 0, 0));
          }
        }
        
        if (!fecha || isNaN(fecha.getTime())) {
          console.error('Fecha inválida:', row[3]);
          return null;
        }

        // Procesamiento de montos
        const procesarNumero = (valor) => {
          if (typeof valor === 'number') return valor;
          if (!valor) return 0;
          const limpio = String(valor).replace(/[^\d.,-]/g, '').replace(',', '.');
          return parseFloat(limpio) || 0;
        };

        const entrada = procesarNumero(row[5]);
        const salida = procesarNumero(row[6]);

        return {
          fecha,
          concepto: String(row[4]).trim(),
          moneda: 'USD',
          entrada,
          salida,
          tasaCambio: 1 // Valor temporal, se actualizará después
        };
      } catch (error) {
        console.error('Error procesando fila:', row, error);
        return null;
      }
    }).filter(t => t !== null);

    if (transacciones.length === 0) {
      return res.status(400).json({ 
        message: 'No se encontraron transacciones válidas en el archivo'
      });
    }

    // Obtener la caja actual
    const caja = await Caja.findOne();
    if (!caja) {
      return res.status(404).json({ message: 'No se encontró la caja' });
    }

    // Obtener la tasa de cambio más reciente
    const ultimaTasa = caja.transacciones.length > 0 
      ? caja.transacciones[caja.transacciones.length - 1].tasaCambio 
      : 1;

    // Asignar tasas de cambio y calcular saldos
    let currentSaldoUSD = caja.saldos.USD;
    const transaccionesConSaldo = transacciones.map(t => {
      t.tasaCambio = ultimaTasa;
      currentSaldoUSD += t.entrada - t.salida;
      return { ...t, saldo: currentSaldoUSD };
    });

    // Actualizar la caja
    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      { 
        $push: { transacciones: { $each: transaccionesConSaldo } },
        $set: { 'saldos.USD': currentSaldoUSD }
      },
      { new: true }
    );

    res.json({
      message: 'Datos importados correctamente',
      transacciones: updated.transacciones,
      saldos: updated.saldos
    });

  } catch (error) {
    console.error('Error al importar Excel:', error);
    res.status(500).json({ 
      message: 'Error al importar el archivo', 
      error: error.message
    });
  }
});

module.exports = router;