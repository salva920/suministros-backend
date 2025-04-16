const express = require('express');
const router = express.Router(); // Crear el router
const Gasto = require('../models/Gasto'); // Importar el modelo de gastos

// Crear nuevo gasto (simplificado sin transacción y sin creadoPor)
router.post('/', async (req, res) => {
  try {
    const { descripcion, monto, categoria, fecha } = req.body;
    
    // Validar campos requeridos
    if (!descripcion || !monto || !categoria || !fecha) {
      return res.status(400).json({ message: 'Todos los campos son requeridos' });
    }

    // Validar formato de fecha
    if (isNaN(new Date(fecha).getTime())) {
      return res.status(400).json({ message: 'Formato de fecha inválido' });
    }

    // Crear y guardar el nuevo gasto
    const nuevoGasto = new Gasto({
      descripcion,
      monto: parseFloat(monto),
      categoria,
      fecha
    });

    const gastoGuardado = await nuevoGasto.save();
    res.status(201).json(gastoGuardado);
  } catch (error) {
    console.error('Error al registrar el gasto:', error);
    res.status(500).json({ 
      message: 'Error al registrar el gasto',
      error: error.message
    });
  }
});

// Obtener gastos (mantener consistencia en la respuesta)
router.get('/', async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: req.query.sort || '-fecha'
    };

    const result = await Gasto.paginate({}, options);
    
    // Agregar nombre consistente al array de resultados
    res.json({
      gastos: result.docs, // Cambiar de 'docs' a 'gastos'
      total: result.total,
      limit: result.limit,
      page: result.page,
      pages: result.pages
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gastos' });
  }
});

// Eliminado populate en GET por ID
router.get('/:id', async (req, res) => {
  try {
    const gasto = await Gasto.findById(req.params.id);
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json(gasto);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gasto' });
  }
});

module.exports = router; // Exportar el router