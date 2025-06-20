const express = require('express');
const router = express.Router();
const ListaPrecio = require('../models/ListaPrecio');

// Middleware para manejar errores
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
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
    busqueda = '',
    mes,
    anio = new Date().getFullYear(),
    ordenar = 'nombreProducto',
    direccion = 'asc'
  } = req.query;
  
  let filtro = {};
  
  if (busqueda) {
    filtro.nombreProducto = { $regex: busqueda, $options: 'i' };
  }
  
  if (mes) {
    filtro.mes = parseInt(mes);
    filtro.anio = parseInt(anio);
  }
  
  const opciones = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { 
      [ordenar]: direccion === 'desc' ? -1 : 1 
    }
  };
  
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

// Nueva ruta para obtener estadísticas por mes
router.get('/estadisticas-mensual', asyncHandler(async (req, res) => {
  const { anio = new Date().getFullYear() } = req.query;
  
  const estadisticas = await ListaPrecio.aggregate([
    {
      $match: { anio: parseInt(anio) }
    },
    {
      $group: {
        _id: "$mes",
        cantidad: { $sum: 1 },
        precioPromedio1: { $avg: "$precio1" },
        precioPromedio2: { $avg: "$precio2" },
        precioPromedio3: { $avg: "$precio3" },
      }
    },
    {
      $sort: { _id: 1 }
    },
    {
      $project: {
        mes: "$_id",
        cantidad: 1,
        precioPromedio1: { $round: ["$precioPromedio1", 2] },
        precioPromedio2: { $round: ["$precioPromedio2", 2] },
        precioPromedio3: { $round: ["$precioPromedio3", 2] },
        _id: 0
      }
    }
  ]);
  
  res.status(200).json(estadisticas);
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
  const {
    nombreProducto,
    precio1,
    precio2,
    precio3,
    fecha
  } = req.body;
  
  if (!nombreProducto) {
    return res.status(400).json({ 
      mensaje: 'El nombre del producto es obligatorio'
    });
  }
  
  let fechaCreacion = new Date();
  if (fecha) {
    try {
      fechaCreacion = new Date(fecha);
    } catch (error) {
      fechaCreacion = new Date();
    }
  }
  
  const nuevaLista = new ListaPrecio({
    nombreProducto,
    producto: nombreProducto + '_' + Date.now(),
    precio1: Number(precio1) || 0,
    precio2: Number(precio2) || 0,
    precio3: Number(precio3) || 0,
    fechaCreacion
  });
  
  await nuevaLista.save();
  
  res.status(201).json({ 
    mensaje: 'Lista de precios creada correctamente',
    listaPrecio: nuevaLista
  });
}));

// Actualizar una lista de precios
router.put('/:id', asyncHandler(async (req, res) => {
  const {
    nombreProducto,
    precio1,
    precio2,
    precio3
  } = req.body;
  
  if (!nombreProducto) {
    return res.status(400).json({ 
      mensaje: 'El nombre del producto es obligatorio'
    });
  }
  
  const existeListaPrecio = await ListaPrecio.findById(req.params.id);
  if (!existeListaPrecio) {
    return res.status(404).json({ mensaje: 'Lista de precios no encontrada' });
  }
  
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
  
  const factor = 1 + (porcentaje / 100);

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
