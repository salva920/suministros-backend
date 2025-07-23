const express = require('express');
const router = express.Router();
const Gasto = require('../models/Gasto');
const mongoose = require('mongoose');

// Middleware para manejar errores de MongoDB
const handleMongoError = (error, res) => {
  console.error('Error de MongoDB:', error);
  if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
    return res.status(503).json({ 
      error: 'Error de conexión con la base de datos',
      detalles: 'La operación tardó demasiado tiempo'
    });
  }
  return res.status(500).json({ 
    error: 'Error en el servidor',
    detalles: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Crear nuevo gasto
router.post('/', async (req, res) => {
  try {
    const { descripcion, monto, categoria, fecha } = req.body;
    
    // Validaciones mejoradas
    if (!descripcion || !monto || !categoria || !fecha) {
      return res.status(400).json({ 
        error: 'Campos requeridos faltantes',
        detalles: {
          descripcion: !descripcion,
          monto: !monto,
          categoria: !categoria,
          fecha: !fecha
        }
      });
    }

    // Validar formato de fecha
    const fechaObj = new Date(fecha);
    if (isNaN(fechaObj.getTime())) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    // Validar monto
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    // Validar categoría
    const categoriasValidas = ['empresariales', 'personales'];
    if (!categoriasValidas.includes(categoria)) {
      return res.status(400).json({ 
        error: 'Categoría inválida',
        categoriasValidas 
      });
    }

    const nuevoGasto = new Gasto({
      descripcion,
      monto: montoNum,
      categoria,
      fecha: fechaObj
    });

    const gastoGuardado = await nuevoGasto.save();
    res.status(201).json(gastoGuardado);
  } catch (error) {
    handleMongoError(error, res);
  }
});

// Obtener gastos
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      getAll = false // Nuevo parámetro para obtener todos los registros
    } = req.query;

    let result;
    if (getAll === 'true') {
      // Si getAll es true, obtener todos los registros sin paginación
      const gastos = await Gasto.find({})
        .sort({ fecha: -1 });

      result = {
        docs: gastos,
        total: gastos.length,
        totalPages: 1,
        page: 1
      };
    } else {
      // Usar paginación normal
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));

      const options = {
        page: pageNum,
        limit: limitNum,
        sort: { fecha: -1 }
      };

      console.log('Parámetros de paginación:', options);

      result = await Gasto.paginate({}, options);
    }
    
    // Validar resultado
    if (!result || !result.docs) {
      throw new Error('Error al obtener los gastos');
    }

    res.json({
      gastos: result.docs,
      total: result.totalDocs || result.total || result.docs.length,
      limit: result.limit || result.docs.length,
      page: result.page || 1,
      pages: result.totalPages || result.pages || 1,
      hasNextPage: result.hasNextPage || false,
      hasPrevPage: result.hasPrevPage || false
    });
  } catch (error) {
    console.error('Error al obtener gastos:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Parámetros de paginación inválidos',
        detalles: 'El número de página y el límite deben ser números positivos'
      });
    }
    handleMongoError(error, res);
  }
});

// Obtener gasto por ID
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const gasto = await Gasto.findById(req.params.id);
    if (!gasto) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.json(gasto);
  } catch (error) {
    handleMongoError(error, res);
  }
});

// Eliminar gasto
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const gastoEliminado = await Gasto.findByIdAndDelete(req.params.id);
    if (!gastoEliminado) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json({ 
      message: 'Gasto eliminado correctamente',
      gasto: gastoEliminado
    });
  } catch (error) {
    handleMongoError(error, res);
  }
});

module.exports = router;