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
  const stockAnterior = producto.stock;
  const stockNuevo = operacion === 'entrada' 
    ? stockAnterior + cantidad 
    : operacion === 'salida' 
      ? stockAnterior - cantidad 
      : stockAnterior;

  await Historial.create({
    producto: producto._id,
    nombreProducto: producto.nombre,
    codigoProducto: producto.codigo,
    operacion,
    cantidad,
    stockAnterior,
    stockNuevo,
    fecha: new Date()
  });
};

// Crear un nuevo producto
router.post('/', async (req, res) => {
  try {
    const requiredFields = {
      nombre: 'Nombre es requerido',
      codigo: 'Código es requerido',
      costoInicial: 'Costo inicial debe ser mayor a 0',
      cantidad: 'Cantidad debe ser mayor a 0',
      fechaIngreso: 'Fecha de ingreso es requerida'
    };

    const errors = [];
    Object.entries(requiredFields).forEach(([field, message]) => {
      const value = req.body[field];
      const numericCheck = ['costoInicial', 'cantidad'].includes(field) 
        ? (typeof value !== 'number' || value <= 0)
        : !value;

      if (numericCheck) {
        errors.push({ field, message });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Error de validación',
        errors: errors.map(e => e.message)
      });
    }

    const codigo = req.body.codigo.trim();
    const productoExistente = await Producto.findOne({ codigo });
    
    if (productoExistente) {
      return res.status(400).json({
        message: `El código ${codigo} ya existe`,
        field: 'codigo'
      });
    }

    const nuevoProducto = new Producto({
      ...req.body,
      codigo: codigo,
      stock: req.body.cantidad
    });

    await nuevoProducto.save();
    
    const historialData = {
      producto: nuevoProducto._id,
      nombreProducto: nuevoProducto.nombre,
      codigoProducto: nuevoProducto.codigo,
      operacion: 'creacion',
      cantidad: nuevoProducto.cantidad,
      stockAnterior: 0,
      stockNuevo: nuevoProducto.stock,
      fecha: nuevoProducto.fechaIngreso,
      stockLote: Number(nuevoProducto.cantidad),
      costoFinal: nuevoProducto.costoFinal,
      detalles: `Creación de producto - Cantidad inicial: ${nuevoProducto.cantidad}`
    };

    await Historial.create(historialData);
    res.status(201).json(nuevoProducto.toObject());
  } catch (error) {
    res.status(500).json({
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener todos los productos con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 1000, busqueda } = req.query;
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
    const productosTransformados = result.docs.map(doc => doc.toObject());

    res.json({
      productos: productosTransformados,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page
    });
  } catch (error) {
    res.status(500).json({ message: 'Error en el servidor', details: error.message });
  }
});

// Obtener un producto por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producto inválido' });
    }
    
    const producto = await Producto.findById(id);
    
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    const productoObjeto = producto.toObject();
    productoObjeto.id = productoObjeto._id.toString();
    
    res.json(productoObjeto);
  } catch (error) {
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producto inválido' });
    }

    const productoActual = await Producto.findById(id);
    if (!productoActual) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const stockOriginal = productoActual.stock;
    const cantidadOriginal = productoActual.cantidad;

    const datosActualizados = {
      ...req.body,
      fechaIngreso: moment.utc(req.body.fechaIngreso).toDate()
    };

    if (datosActualizados.cantidad !== undefined && datosActualizados.cantidad !== cantidadOriginal) {
      const diferenciaCantidad = datosActualizados.cantidad - cantidadOriginal;

      if (diferenciaCantidad > 0) {
        datosActualizados.stock = stockOriginal + diferenciaCantidad;
      } 
      else if (diferenciaCantidad < 0 && stockOriginal >= Math.abs(diferenciaCantidad)) {
        datosActualizados.stock = stockOriginal + diferenciaCantidad;
      } 
      else if (diferenciaCantidad < 0) {
        return res.status(400).json({
          message: `No hay suficiente stock para reducir la cantidad. Stock actual: ${stockOriginal}`
        });
      }
    } else {
      datosActualizados.stock = stockOriginal;
    }

    const productoActualizado = await Producto.findByIdAndUpdate(
      id, 
      datosActualizados,
      { new: true, runValidators: true }
    );

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
    }

    res.json(productoActualizado);
  } catch (error) {
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
router.post('/:id/entradas', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const producto = await Producto.findById(req.params.id).session(session);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }
    
    const cantidad = Number(req.body.cantidad) || 0;
    if (cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }
    
    const fechaHora = req.body.fechaHora ? new Date(req.body.fechaHora) : new Date();
    if (isNaN(fechaHora.getTime())) {
      throw new Error('Fecha inválida');
    }

    const stockAnterior = producto.stock || 0;
    const cantidadAnterior = producto.cantidad || 0;
    
    producto.stock = stockAnterior + cantidad;
    producto.cantidad = cantidadAnterior + cantidad;
    
    const costoInicial = Number(req.body.costoUnitario) || producto.costoInicial || 0;
    const acarreo = Number(req.body.acarreo) || 0;
    const flete = Number(req.body.flete) || 0;
    const costoFinalEntrada = ((costoInicial * cantidad) + acarreo + flete) / cantidad;

    const ultimoLote = await Historial.findOne({
      producto: producto._id,
      operacion: { $in: ['creacion', 'entrada'] },
      stockLote: { $gt: 0 }
    }).sort({ fecha: -1 }).session(session);

    const stockLoteAnterior = ultimoLote?.stockLote || 0;
    const nuevoStockLote = stockLoteAnterior + cantidad;

    await producto.save({ session });
    
    const historialData = {
      producto: producto._id,
      nombreProducto: producto.nombre,
      codigoProducto: producto.codigo,
      operacion: 'entrada',
      cantidad: cantidad,
      stockAnterior: stockAnterior,
      stockNuevo: producto.stock,
      fecha: fechaHora,
      stockLote: Number(cantidad),
      costoFinal: costoFinalEntrada,
      detalles: `Entrada de stock - Cantidad: ${cantidad}`
    };

    const historialEntry = await Historial.create([historialData], { session });

    if (!historialEntry || historialEntry.length === 0) {
      throw new Error('Error al crear el registro en el historial');
    }

    await session.commitTransaction();
    
    res.json({
      producto: producto,
      historial: historialEntry[0],
      lote: {
        anterior: stockLoteAnterior,
        nuevo: nuevoStockLote
      }
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ 
      message: 'Error en entrada de stock', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    session.endSession();
  }
});

// GET /:id/lotes
router.get('/:id/lotes', async (req, res) => {
  try {
    const productoId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productoId)) {
      return res.status(400).json({ 
        message: 'ID de producto inválido',
        error: 'INVALID_ID',
        lotes: [],
        totales: {
          stockTotal: 0,
          costoPromedio: 0,
          cantidadLotes: 0
        }
      });
    }

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ 
        message: 'Producto no encontrado',
        error: 'PRODUCT_NOT_FOUND',
        lotes: [],
        totales: {
          stockTotal: 0,
          costoPromedio: 0,
          cantidadLotes: 0
        }
      });
    }

    const lotes = await Historial.aggregate([
      {
        $match: {
          producto: new mongoose.Types.ObjectId(productoId),
          operacion: { $in: ['creacion', 'entrada'] },
          stockLote: { $gt: 0 }
        }
      },
      {
        $addFields: {
          loteId: "$_id",
          fechaFormateada: {
            $dateToString: { format: "%Y-%m-%d", date: "$fecha" }
          },
          costoFormateado: {
            $round: ["$costoFinal", 2]
          }
        }
      },
      {
        $project: {
          _id: 1,
          loteId: 1,
          fecha: 1,
          fechaFormateada: 1,
          stockLote: 1,
          costoFinal: 1,
          costoFormateado: 1,
          operacion: 1,
          detalles: 1
        }
      },
      { $sort: { fecha: 1 } }
    ]).exec();

    const lotesArray = Array.isArray(lotes) ? lotes : [];
    
    const totales = lotesArray.reduce((acc, lote) => ({
      stockTotal: acc.stockTotal + (lote.stockLote || 0),
      costoPromedio: acc.costoPromedio + (lote.costoFinal || 0)
    }), { stockTotal: 0, costoPromedio: 0 });

    totales.costoPromedio = lotesArray.length > 0 ? totales.costoPromedio / lotesArray.length : 0;
    
    const response = {
      lotes: lotesArray,
      totales: {
        stockTotal: totales.stockTotal,
        costoPromedio: Math.round(totales.costoPromedio * 100) / 100,
        cantidadLotes: lotesArray.length
      },
      producto: {
        id: producto._id,
        nombre: producto.nombre,
        stock: producto.stock
      }
    };

    if (lotesArray.length === 0) {
      return res.json({
        ...response,
        message: 'No hay lotes disponibles para este producto',
        error: 'NO_LOTS_AVAILABLE'
      });
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener lotes',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      lotes: [],
      totales: {
        stockTotal: 0,
        costoPromedio: 0,
        cantidadLotes: 0
      }
    });
  }
});

module.exports = router;