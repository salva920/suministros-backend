const express = require('express');
const router = express.Router();
const Producto = require('../models/Producto');
const Historial = require('../models/historial');
const moment = require('moment');
const mongoose = require('mongoose');

// Middleware para manejar errores
const handleErrors = (res, error) => {
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'ID inválido' });
  }
  res.status(500).json({ message: 'Error en el servidor' });
};

// Middleware para registrar en el historial
const registrarEnHistorial = async (producto, operacion, cantidad = 0) => {
  await Historial.create({
    producto: producto._id,
    nombreProducto: producto.nombre,
    codigoProducto: producto.codigo,
    operacion,
    cantidad,
    stockAnterior: producto.stock - (operacion === 'entrada' ? cantidad : 0),
    stockNuevo: producto.stock
  });
};

// Crear un nuevo producto
router.post('/', async (req, res) => {
  try {
    // Validación mejorada
    const requiredFields = {
      nombre: 'Nombre es requerido',
      codigo: 'Código es requerido',
      costoInicial: 'Costo inicial debe ser mayor a 0',
      cantidad: 'Cantidad debe ser mayor a 0',
      fechaIngreso: 'Fecha de ingreso es requerida'
    };

    const errors = [];
    // Validación correcta para campos numéricos:
  Object.entries(requiredFields).forEach(([field, message]) => {
  const value = req.body[field];
  const numericCheck = ['costoInicial', 'cantidad'].includes(field) 
    ? (typeof value !== 'number' || value <= 0)
    : !value;

  if (numericCheck) errors.push({ field, message });
});

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Error de validación',
        errors: errors.map(e => e.message)
      });
    }

    // Trim y validación de código único
    const codigo = req.body.codigo.trim();
    const productoExistente = await Producto.findOne({ codigo });
    
    if (productoExistente) {
      return res.status(400).json({
        message: `El código ${codigo} ya existe`,
        field: 'codigo'
      });
    }

    // Crear producto con código trimmeado
    const nuevoProducto = new Producto({
      ...req.body,
      codigo: codigo,
      stock: req.body.cantidad  // Stock inicial = cantidad ingresada
    });

    await nuevoProducto.save();
    
    // Registrar creación
    await registrarEnHistorial(nuevoProducto, 'creacion', nuevoProducto.cantidad);
    
    res.status(201).json(nuevoProducto.toObject());
  } catch (error) {
    console.error('Error en servidor:', error);
    res.status(500).json({
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener todos los productos con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, busqueda } = req.query;
    const filtro = {};
    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: 'i' } },
        { codigo: { $regex: busqueda, $options: 'i' } },
        { proveedor: { $regex: busqueda, $options: 'i' } }
      ];
    }
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { fechaIngreso: -1 },
      select: 'nombre codigo proveedor costoInicial acarreo flete cantidad costoFinal stock fecha fechaIngreso'
    };
    const result = await Producto.paginate(filtro, options);

    // Convertir a objeto plano con los getters aplicados
    const productosTransformados = result.docs.map(doc => doc.toObject());

    res.json({
      productos: productosTransformados,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error en el servidor', details: error.message });
  }
});

// Obtener un producto por ID
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, busqueda } = req.query;
    const filtro = {};
    if (busqueda) {
      filtro.$or = [
        { nombre: { $regex: busqueda, $options: 'i' } },
        { codigo: { $regex: busqueda, $options: 'i' } },
        { proveedor: { $regex: busqueda, $options: 'i' } }
      ];
    }
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { fechaIngreso: -1 },
      select: 'nombre codigo proveedor costoInicial acarreo flete cantidad costoFinal stock fecha fechaIngreso'
    };
    const result = await Producto.paginate(filtro, options);

    // Convertir a objeto plano con los getters aplicados
    const productosTransformados = result.docs.map(doc => doc.toObject());

    res.json({
      productos: productosTransformados,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error en el servidor', details: error.message });
  }
});

// Actualizar un producto
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Convertir el ID a ObjectId
    const objectId = mongoose.Types.ObjectId(id);

    // Validación de fecha
    if (!moment(req.body.fechaIngreso, moment.ISO_8601, true).isValid()) {
      return res.status(400).json({
        message: 'Formato de fecha inválido. Use ISO 8601 (YYYY-MM-DD)'
      });
    }

    // Convertir fecha a objeto Date UTC
    const fechaUTC = moment.utc(req.body.fechaIngreso).toDate();

    // Validación mejorada
    const requiredFields = {
      nombre: 'Nombre es requerido',
      codigo: 'Código es requerido',
      costoInicial: 'Costo inicial debe ser mayor a 0',
      cantidad: 'Cantidad debe ser mayor a 0',
      fechaIngreso: 'Fecha de ingreso es requerida'
    };

    const errors = [];
    Object.entries(requiredFields).forEach(([field, message]) => {
      if (!req.body[field] || (typeof req.body[field] === 'number' && req.body[field] <= 0)) {
        errors.push({ field, message });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Error de validación',
        errors: errors.map(e => e.message)
      });
    }

    // Verificar código único excluyendo el actual
    const codigo = req.body.codigo.trim();
    const productoExistente = await Producto.findOne({
      codigo,
      _id: { $ne: objectId }
    });

    if (productoExistente) {
      return res.status(400).json({
        message: `El código ${codigo} ya existe`,
        field: 'codigo'
      });
    }

    // Crear el objeto con los datos actualizados
    const datosActualizados = {
      ...req.body,
      fechaIngreso: fechaUTC,
      stock: req.body.stock, // Asegurar que se actualice el stock
      cantidad: req.body.cantidad // Actualizar cantidad si es necesario
    };

    // Actualizar el producto en la base de datos
    const productoActualizado = await Producto.findByIdAndUpdate(
      objectId,
      datosActualizados,
      { 
        new: true, 
        runValidators: true,
        context: 'query'
      }
    );

    if (!productoActualizado) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Registrar ajustes de stock
    if (req.body.stock !== undefined && req.body.stock !== productoActualizado.stock) {
      const originalStock = productoActualizado.stock - (req.body.stock - productoActualizado.stock);
      await registrarEnHistorial(productoActualizado, 'ajuste', 
        productoActualizado.stock - originalStock
      );
    }

    res.json(productoActualizado.toObject());
  } catch (error) {
    console.error('Error al actualizar:', error);
    
    // Mejor manejo de errores de fecha
    if (error.name === 'CastError' && error.path === 'fechaIngreso') {
      return res.status(400).json({
        message: 'Formato de fecha inválido',
        details: 'Use el formato YYYY-MM-DD'
      });
    }
    
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Eliminar un producto
router.delete('/:id', async (req, res) => {
  try {
    const productoEliminado = await Producto.findByIdAndDelete(req.params.id);
    if (!productoEliminado) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    // Registrar eliminación
    await Historial.create({
      producto: productoEliminado._id,
      nombreProducto: productoEliminado.nombre,
      codigoProducto: productoEliminado.codigo,
      operacion: 'eliminacion',
      fecha: new Date()
    });
    
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    handleErrors(res, error);
  }
});

// Endpoint específico para entradas de stock
// En POST /:id/entradas
// Modificar la ruta POST para usar la fecha recibida
router.post('/:id/entradas', async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    const cantidad = Number(req.body.cantidad) || 0;
    const fechaHora = req.body.fechaHora ? new Date(req.body.fechaHora) : new Date();

    // Validar fecha
    if (isNaN(fechaHora.getTime())) {
      return res.status(400).json({ message: 'Fecha inválida' });
    }

    const stockAnterior = producto.stock;
    
    producto.stock += cantidad;
    await producto.save();
    
    await Historial.create({
      producto: producto._id,
      nombreProducto: producto.nombre,
      codigoProducto: producto.codigo,
      operacion: 'entrada',
      cantidad: cantidad,
      stockAnterior: stockAnterior,
      stockNuevo: producto.stock,
      fecha: fechaHora // Usar la fecha recibida del frontend
    });
    
    res.json(producto);
  } catch (error) {
    console.error('Error en entrada de stock:', error);
    res.status(500).json({ message: 'Error en entrada de stock' });
  }
});


module.exports = router;