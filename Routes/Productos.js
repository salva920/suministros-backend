const express = require('express');
const router = express.Router();
const Producto = require('../models/Producto');
const mongoose = require('mongoose');
const Historial = require('../models/historial');
const moment = require('moment');

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
    
    // Registrar creación en el historial
    await Historial.create({
      producto: nuevoProducto._id,
      nombreProducto: nuevoProducto.nombre,
      codigoProducto: nuevoProducto.codigo,
      operacion: 'creacion',
      cantidad: nuevoProducto.cantidad,
      stockAnterior: 0,
      stockNuevo: nuevoProducto.stock,
      fecha: nuevoProducto.fechaIngreso,
      stockLote: nuevoProducto.cantidad,
      costoFinal: nuevoProducto.costoFinal
    });
    
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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producto inválido' });
    }
    
    // Buscar el producto por ID
    const producto = await Producto.findById(id);
    
    // Verificar si se encontró el producto
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    // Convertir el documento mongoose a un objeto plano
    const productoObjeto = producto.toObject();
    
    // Agregar propiedad id (además de _id) para compatibilidad
    productoObjeto.id = productoObjeto._id.toString();
    
    res.json(productoObjeto);
  } catch (error) {
    console.error('Error al obtener producto por ID:', error);
    res.status(500).json({ 
      message: 'Error al obtener producto', 
      error: error.message 
    });
  }
});

// Actualizar un producto
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producto inválido' });
    }

    // Obtener el producto actual
    const productoActual = await Producto.findById(id);
    if (!productoActual) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Mantener valores originales para comparación
    const stockOriginal = productoActual.stock;
    const cantidadOriginal = productoActual.cantidad;

    // Preparar datos actualizados
    const datosActualizados = {
      ...req.body,
      fechaIngreso: moment.utc(req.body.fechaIngreso).toDate()
    };

    // Si la cantidad está siendo actualizada, validar y ajustar el stock
    if (datosActualizados.cantidad !== undefined && datosActualizados.cantidad !== cantidadOriginal) {
      console.log(`Cantidad cambiada de ${cantidadOriginal} a ${datosActualizados.cantidad}`);

      // Calcular diferencia y ajustar stock si es necesario
      const diferenciaCantidad = datosActualizados.cantidad - cantidadOriginal;

      // Si la cantidad aumentó, aumentar también el stock
      if (diferenciaCantidad > 0) {
        datosActualizados.stock = stockOriginal + diferenciaCantidad;
      } 
      // Si disminuyó y hay suficiente stock, reducir el stock
      else if (diferenciaCantidad < 0 && stockOriginal >= Math.abs(diferenciaCantidad)) {
        datosActualizados.stock = stockOriginal + diferenciaCantidad;
      } 
      // Si no hay suficiente stock, mantener el stock original y advertir
      else if (diferenciaCantidad < 0) {
        return res.status(400).json({
          message: `No hay suficiente stock para reducir la cantidad. Stock actual: ${stockOriginal}`
        });
      }
    } else {
      // Si no se cambia la cantidad, mantener el stock actual
      datosActualizados.stock = stockOriginal;
    }

    console.log('Datos actualizados:', datosActualizados);

    // Actualizar el producto
    const productoActualizado = await Producto.findByIdAndUpdate(
      id, 
      datosActualizados,
      { new: true, runValidators: true }
    );

    // Registrar cambio en el historial si el stock cambió
    if (productoActualizado.stock !== stockOriginal) {
      const diferencia = productoActualizado.stock - stockOriginal;
      const historialData = {
        producto: productoActualizado._id,
        nombreProducto: productoActualizado.nombre,
        codigoProducto: productoActualizado.codigo,
        operacion: diferencia > 0 ? 'entrada' : 'salida',
        cantidad: Math.abs(diferencia),
        stockAnterior: stockOriginal,
        stockNuevo: productoActualizado.stock,
        fecha: new Date(),
        detalles: 'Ajuste mediante edición de producto'
      };
      if (diferencia > 0) {
        historialData.stockLote = diferencia;
      }
      await Historial.create(historialData);
      console.log(`Historial creado: ${diferencia > 0 ? 'entrada' : 'salida'} de ${Math.abs(diferencia)} unidades`);
    }

    res.json(productoActualizado);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ 
      message: 'Error al actualizar producto',
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
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    const cantidad = Number(req.body.cantidad) || 0;
    if (cantidad <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
    }
    
    const fechaHora = req.body.fechaHora ? new Date(req.body.fechaHora) : new Date();

    // Validar fecha
    if (isNaN(fechaHora.getTime())) {
      return res.status(400).json({ message: 'Fecha inválida' });
    }

    // Guardar valores anteriores para el historial
    const stockAnterior = producto.stock;
    const cantidadAnterior = producto.cantidad;
    
    // Actualizar tanto stock como cantidad
    producto.stock += cantidad;
    producto.cantidad += cantidad; // Actualizar también la cantidad total
    
    // Calcular el costo final de la entrada
    const costoInicial = req.body.costoUnitario || producto.costoInicial;
    const acarreo = req.body.acarreo || 0;
    const flete = req.body.flete || 0;
    const costoFinalEntrada = ((costoInicial * cantidad) + acarreo + flete) / cantidad;
    
    // Guardar los cambios
    await producto.save();
    
    // Registrar en el historial
    await Historial.create({
      producto: producto._id,
      nombreProducto: producto.nombre,
      codigoProducto: producto.codigo,
      operacion: 'entrada',
      cantidad: cantidad,
      stockAnterior: stockAnterior,
      stockNuevo: producto.stock,
      fecha: fechaHora,
      stockLote: cantidad,
      costoFinal: costoFinalEntrada
    });
    
    res.json(producto);
  } catch (error) {
    console.error('Error en entrada de stock:', error);
    res.status(500).json({ message: 'Error en entrada de stock', error: error.message });
  }
});

// GET /:id/lotes
router.get('/:id/lotes', async (req, res) => {
  const lotes = await Historial.find({
    producto: req.params.id,
    operacion: { $in: ['creacion', 'entrada'] },
    stockLote: { $gt: 0 }
  }).sort({ fecha: 1 }); // FIFO
  res.json(lotes);
});

module.exports = router;