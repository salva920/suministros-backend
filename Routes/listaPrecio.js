const express = require('express');
const router = express.Router();
const ListaPrecio = require('../models/ListaPrecio');

// Middleware para manejar errores
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error('Error en API ListaPrecio:', err);
    res.status(500).json({
      mensaje: 'Error interno del servidor',
      error: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
  });
};

// Obtener todas las listas de precios con paginación
router.get('/', asyncHandler(async (req, res) => {
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
}));

// Obtener una lista de precios por ID
router.get('/:id', asyncHandler(async (req, res) => {
  const listaPrecio = await ListaPrecio.findById(req.params.id);
  
  if (!listaPrecio) {
    return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
  }
  
  res.status(200).json(listaPrecio);
}));

// Crear una nueva lista de precios
router.post('/', asyncHandler(async (req, res) => {
  console.log('Body recibido:', req.body);

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
  
  // Crear nueva lista con valores seguros
  const nuevaLista = new ListaPrecio({
    nombreProducto,
    precio1: Number(precio1) || 0,
    precio2: Number(precio2) || 0,
    precio3: Number(precio3) || 0
  });
  
  await nuevaLista.save();
  
  res.status(201).json({ 
    mensaje: 'Lista de precios creada correctamente',
    listaPrecio: nuevaLista
  });
}));

// Actualizar una lista de precios
router.put('/:id', asyncHandler(async (req, res) => {
  console.log('Actualizando ID:', req.params.id);
  console.log('Body de actualización:', req.body);

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
  
  // Verificar que el ID existe
  const existeListaPrecio = await ListaPrecio.findById(req.params.id);
  if (!existeListaPrecio) {
    return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
  }
  
  // Actualizar lista con valores seguros
  const listaActualizada = await ListaPrecio.findByIdAndUpdate(
    req.params.id,
    {
      nombreProducto,
      precio1: Number(precio1) || 0,
      precio2: Number(precio2) || 0,
      precio3: Number(precio3) || 0
    },
    { new: true, runValidators: true }
  );
  
  res.status(200).json({ 
    mensaje: 'Lista de precios actualizada correctamente',
    listaPrecio: listaActualizada
  });
}));

// Eliminar una lista de precios
router.delete('/:id', asyncHandler(async (req, res) => {
  const listaEliminada = await ListaPrecio.findByIdAndDelete(req.params.id);
  
  if (!listaEliminada) {
    return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
  }
  
  res.status(200).json({ 
    mensaje: 'Lista de precios eliminada correctamente',
    listaPrecio: listaEliminada
  });
}));

// Actualizar precios masivamente con un porcentaje
router.post('/ajuste-masivo', asyncHandler(async (req, res) => {
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
}));

module.exports = router;
