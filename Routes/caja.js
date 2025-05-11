const express = require('express');
const router = express.Router();
const Caja = require('../models/caja');
const moment = require('moment-timezone');
const multer = require('multer');
const xlsx = require('xlsx');

// Cambiar la configuración de multer para usar memoria en lugar de disco
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // límite de 5MB
  }
});

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
    
    // Validación y obtención de transacción existente
    const validacion = validarCampos(req.body);
    if (validacion.error) return res.status(400).json(validacion);

    const caja = await Caja.findOne();
    const transaccionIndex = caja.transacciones.findIndex(t => t._id.toString() === req.params.id);
    
    if (transaccionIndex === -1) {
      return res.status(404).json({ message: 'Transacción no encontrada' });
    }

    // Convertir fecha a UTC explícitamente
    const fechaUTC = new Date(fecha);
    fechaUTC.setUTCHours(12, 0, 0, 0);

    // Actualizar datos principales con fecha UTC
    caja.transacciones[transaccionIndex] = {
      ...caja.transacciones[transaccionIndex].toObject(),
      fecha: fechaUTC,
      concepto,
      moneda,
      entrada: parseFloat(entrada) || 0,
      salida: parseFloat(salida) || 0,
      tasaCambio: parseFloat(tasaCambio)
    };

    // 1. Reordenar todas las transacciones por fecha usando UTC
    const transaccionesOrdenadas = caja.transacciones.sort((a, b) => {
      const fechaA = new Date(a.fecha);
      const fechaB = new Date(b.fecha);
      return fechaA.getTime() - fechaB.getTime();
    });

    // 2. Recalcular saldos desde cero
    let currentSaldoUSD = 0;
    let currentSaldoBs = 0;
    
    const transaccionesActualizadas = transaccionesOrdenadas.map(t => {
      if (t.moneda === 'USD') {
        currentSaldoUSD += t.entrada - t.salida;
        return { ...t, saldo: currentSaldoUSD };
      } else {
        currentSaldoBs += t.entrada - t.salida;
        return { ...t, saldo: currentSaldoBs };
      }
    });

    // 3. Actualizar documento completo
    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      {
        transacciones: transaccionesActualizadas,
        saldos: {
          USD: currentSaldoUSD,
          Bs: currentSaldoBs
        }
      },
      { new: true }
    );

    res.json({
      transacciones: updated.transacciones,
      saldos: updated.saldos
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar transacción', error: error.message });
  }
});

// Ruta para importar Excel
router.post('/importar-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha subido ningún archivo' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
      header: 1
    });

    console.log('Filas 17 a 34 del Excel:', data.slice(16, 34));

    const transacciones = data
      .slice(16, 34)
      .map((row, idx) => {
        console.log(`Fila ${16 + idx + 1}:`, row);
        try {
          let fecha;
          if (typeof row[3] === 'string' && row[3].includes('/')) {
            // DÍA/MES/AÑO
            const [day, month, year] = row[3].split('/');
            const fullYear = year.length === 2 ? `20${year}` : year;
            fecha = moment.utc(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, 'YYYY-MM-DD');
          }
          if (!fecha || !fecha.isValid()) {
            console.error('Fecha inválida:', row[3]);
            return null;
          }
          const procesarNumero = (valor) => {
            if (typeof valor === 'number') return valor;
            if (!valor) return 0;
            const limpio = String(valor).replace(/[^\d.,-]/g, '').replace(',', '.');
            return parseFloat(limpio) || 0;
          };
          const entrada = procesarNumero(row[5]);
          const salida = procesarNumero(row[6]);
          return {
            fecha: fecha.toDate(),
            concepto: String(row[4]).trim(),
            moneda: 'USD',
            entrada,
            salida,
            saldo: 0
          };
        } catch (error) {
          console.error('Error procesando fila:', row, error);
          return null;
        }
      })
      .filter(t => t !== null);

    console.log('Transacciones detectadas:', transacciones.length, transacciones);

    if (transacciones.length === 0) {
      return res.status(400).json({ 
        message: 'No se encontraron transacciones válidas en el archivo',
        debug: {
          filas: data.slice(16, 34)
        }
      });
    }

    transacciones.sort((a, b) => moment.utc(a.fecha).valueOf() - moment.utc(b.fecha).valueOf());

    let currentSaldo = 0;
    const transaccionesConSaldo = transacciones.map(t => {
      currentSaldo += t.entrada - t.salida;
      return { ...t, saldo: currentSaldo };
    });

    const caja = await Caja.findOne();
    if (!caja) {
      return res.status(404).json({ message: 'No se encontró la caja' });
    }

    const updated = await Caja.findOneAndUpdate(
      { _id: caja._id },
      {
        transacciones: transaccionesConSaldo,
        saldos: {
          USD: currentSaldo,
          Bs: 0
        }
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
      error: error.message,
      details: error.stack 
    });
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
  fechaObj.setUTCHours(12, 0, 0, 0);
  
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
  
  // Convertir fecha a UTC explícitamente
  const fechaUTC = new Date(fecha);
  fechaUTC.setUTCHours(12, 0, 0, 0);
  
  return {
    fecha: fechaUTC,
    concepto,
    moneda,
    entrada: entradaNum,
    salida: salidaNum,
    saldo: caja.saldos[moneda] + entradaNum - salidaNum,
    tasaCambio: parseFloat(tasaCambio)
  };
};

module.exports = router;