const express = require('express');
const router = express.Router();
const ListaPrecio = require('../models/ListaPrecio');

// Obtener todas las listas de precios con paginación
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      busqueda = '' 
    } = req.query;
    
    // Crear filtro basado en búsqueda
    let filtro = {};
    if (busqueda) {
      filtro = {
        nombreProducto: { $regex: busqueda, $options: 'i' }
      };
    }
    
    // Opciones de paginación
    const opciones = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { nombreProducto: 1 }
    };
    
    // Obtener listas de precios paginadas
    const resultado = await ListaPrecio.paginate(filtro, opciones);
    
    res.status(200).json({
      listasPrecios: resultado.docs,
      totalDocs: resultado.totalDocs,
      totalPages: resultado.totalPages,
      page: resultado.page,
      limit: resultado.limit,
      hasPrevPage: resultado.hasPrevPage,
      hasNextPage: resultado.hasNextPage,
      prevPage: resultado.prevPage,
      nextPage: resultado.nextPage
    });
  } catch (error) {
    console.error('Error al obtener listas de precios:', error);
    res.status(500).json({ 
      mensaje: 'Error al obtener listas de precios', 
      error: error.message 
    });
  }
});

// Obtener una lista de precios por ID
router.get('/:id', async (req, res) => {
  try {
    const listaPrecio = await ListaPrecio.findById(req.params.id);
    
    if (!listaPrecio) {
      return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
    }
    
    res.status(200).json(listaPrecio);
  } catch (error) {
    console.error('Error al obtener lista de precios:', error);
    res.status(500).json({ 
      mensaje: 'Error al obtener lista de precios', 
      error: error.message 
    });
  }
});

// Crear una nueva lista de precios
router.post('/', async (req, res) => {
  try {
    const {
      nombreProducto,
      precio1,
      precio2,
      precio3
    } = req.body;
    
    // Validar campo requerido
    if (!nombreProducto) {
      return res.status(400).json({ 
        mensaje: 'El nombre del producto es obligatorio'
      });
    }
    
    // Crear nueva lista
    const nuevaLista = new ListaPrecio({
      nombreProducto,
      precio1: precio1 || 0,
      precio2: precio2 || 0,
      precio3: precio3 || 0
    });
    
    await nuevaLista.save();
    
    res.status(201).json({ 
      mensaje: 'Lista de precios creada correctamente',
      listaPrecio: nuevaLista
    });
  } catch (error) {
    console.error('Error al crear lista de precios:', error);
    res.status(500).json({ 
      mensaje: 'Error al crear lista de precios', 
      error: error.message 
    });
  }
});

// Actualizar una lista de precios
router.put('/:id', async (req, res) => {
  try {
    const {
      nombreProducto,
      precio1,
      precio2,
      precio3
    } = req.body;
    
    // Validar campo requerido
    if (!nombreProducto) {
      return res.status(400).json({ 
        mensaje: 'El nombre del producto es obligatorio'
      });
    }
    
    // Actualizar lista
    const listaActualizada = await ListaPrecio.findByIdAndUpdate(
      req.params.id,
      {
        nombreProducto,
        precio1: precio1 || 0,
        precio2: precio2 || 0,
        precio3: precio3 || 0
      },
      { new: true, runValidators: true }
    );
    
    if (!listaActualizada) {
      return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
    }
    
    res.status(200).json({ 
      mensaje: 'Lista de precios actualizada correctamente',
      listaPrecio: listaActualizada
    });
  } catch (error) {
    console.error('Error al actualizar lista de precios:', error);
    res.status(500).json({ 
      mensaje: 'Error al actualizar lista de precios', 
      error: error.message 
    });
  }
});

// Eliminar una lista de precios
router.delete('/:id', async (req, res) => {
  try {
    const listaEliminada = await ListaPrecio.findByIdAndDelete(req.params.id);
    
    if (!listaEliminada) {
      return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
    }
    
    res.status(200).json({ 
      mensaje: 'Lista de precios eliminada correctamente',
      listaPrecio: listaEliminada
    });
  } catch (error) {
    console.error('Error al eliminar lista de precios:', error);
    res.status(500).json({ 
      mensaje: 'Error al eliminar lista de precios', 
      error: error.message 
    });
  }
});

// Actualizar precios masivamente con un porcentaje
router.post('/ajuste-masivo', async (req, res) => {
  try {
    const { porcentaje, tiposPrecio = [] } = req.body;
    
    if (!porcentaje || isNaN(porcentaje)) {
      return res.status(400).json({ mensaje: 'Se requiere un porcentaje válido' });
    }
    
    if (tiposPrecio.length === 0) {
      return res.status(400).json({ mensaje: 'Debe seleccionar al menos un tipo de precio' });
    }
    
    // Convertir el porcentaje a un factor multiplicador
    const factor = 1 + (porcentaje / 100);

    // Actualizar todos los precios seleccionados
    const updateObj = {};
    tiposPrecio.forEach(tipo => {
      if (['precio1', 'precio2', 'precio3'].includes(tipo)) {
        updateObj[tipo] = { $mul: factor };
      }
    });
    
    const resultado = await ListaPrecio.updateMany({}, updateObj);
    
    res.status(200).json({ 
      mensaje: `Se actualizaron ${resultado.modifiedCount} listas de precios con un ${porcentaje > 0 ? 'aumento' : 'descuento'} del ${Math.abs(porcentaje)}%`,
      resultado
    });
  } catch (error) {
    console.error('Error al actualizar precios masivamente:', error);
    res.status(500).json({ 
      mensaje: 'Error al actualizar precios masivamente', 
      error: error.message 
    });
  }
});

module.exports = router;
