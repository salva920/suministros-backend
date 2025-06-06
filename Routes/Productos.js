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
    console.log('\n=== INICIO CREACIÓN DE PRODUCTO ===');
    console.log('Datos recibidos:', {
      nombre: req.body.nombre,
      codigo: req.body.codigo,
      cantidad: req.body.cantidad,
      costoInicial: req.body.costoInicial,
      fechaIngreso: req.body.fechaIngreso
    });

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

      if (numericCheck) {
        console.log(`Error de validación en campo ${field}:`, value);
        errors.push({ field, message });
      }
    });

    if (errors.length > 0) {
      console.log('Errores de validación encontrados:', errors);
      return res.status(400).json({
        message: 'Error de validación',
        errors: errors.map(e => e.message)
      });
    }

    // Trim y validación de código único
    const codigo = req.body.codigo.trim();
    console.log('Código normalizado:', codigo);

    const productoExistente = await Producto.findOne({ codigo });
    
    if (productoExistente) {
      console.log('Producto con código duplicado encontrado:', productoExistente._id);
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

    console.log('Nuevo producto a crear:', {
      nombre: nuevoProducto.nombre,
      codigo: nuevoProducto.codigo,
      cantidad: nuevoProducto.cantidad,
      stock: nuevoProducto.stock,
      costoInicial: nuevoProducto.costoInicial,
      costoFinal: nuevoProducto.costoFinal
    });

    await nuevoProducto.save();
    console.log('Producto guardado exitosamente');
    
    // Registrar creación en el historial
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

    console.log('Registro de historial a crear:', historialData);

    const historialCreado = await Historial.create(historialData);
    console.log('Registro de historial creado:', {
      id: historialCreado._id,
      stockAnterior: historialCreado.stockAnterior,
      stockNuevo: historialCreado.stockNuevo,
      stockLote: historialCreado.stockLote
    });
    
    console.log('=== FIN CREACIÓN DE PRODUCTO ===\n');
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
router.post('/:id/entradas', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('\n=== INICIO ENTRADA DE STOCK ===');
    console.log('ID del producto:', req.params.id);
    console.log('Datos recibidos:', {
      cantidad: req.body.cantidad,
      costoUnitario: req.body.costoUnitario,
      acarreo: req.body.acarreo,
      flete: req.body.flete,
      fechaHora: req.body.fechaHora
    });

    const producto = await Producto.findById(req.params.id).session(session);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }

    console.log('Producto encontrado:', {
      nombre: producto.nombre,
      stockActual: producto.stock,
      cantidadActual: producto.cantidad
    });
    
    const cantidad = Number(req.body.cantidad) || 0;
    if (cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }
    
    const fechaHora = req.body.fechaHora ? new Date(req.body.fechaHora) : new Date();
    if (isNaN(fechaHora.getTime())) {
      throw new Error('Fecha inválida');
    }

    // Guardar valores anteriores para el historial
    const stockAnterior = producto.stock || 0;
    const cantidadAnterior = producto.cantidad || 0;
    
    // Actualizar stock y cantidad
    producto.stock = stockAnterior + cantidad;
    producto.cantidad = cantidadAnterior + cantidad;
    
    // Calcular el costo final de la entrada
    const costoInicial = Number(req.body.costoUnitario) || producto.costoInicial || 0;
    const acarreo = Number(req.body.acarreo) || 0;
    const flete = Number(req.body.flete) || 0;
    const costoFinalEntrada = ((costoInicial * cantidad) + acarreo + flete) / cantidad;

    console.log('Cálculos de costos:', {
      costoInicial,
      acarreo,
      flete,
      costoFinalEntrada
    });

    // Buscar el último lote activo
    const ultimoLote = await Historial.findOne({
      producto: producto._id,
      operacion: { $in: ['creacion', 'entrada'] },
      stockLote: { $gt: 0 }
    }).sort({ fecha: -1 }).session(session);

    console.log('Último lote encontrado:', ultimoLote ? {
      fecha: ultimoLote.fecha,
      stockLote: ultimoLote.stockLote,
      operacion: ultimoLote.operacion
    } : 'No hay lotes anteriores');

    // Calcular el nuevo stock del lote
    const stockLoteAnterior = ultimoLote?.stockLote || 0;
    const nuevoStockLote = stockLoteAnterior + cantidad;
    
    console.log('Datos calculados:', {
      stockAnterior,
      cantidadAnterior,
      nuevoStock: producto.stock,
      nuevaCantidad: producto.cantidad,
      stockLoteAnterior,
      nuevoStockLote,
      costoFinalEntrada
    });

    // Guardar los cambios en el producto
    await producto.save({ session });
    console.log('Producto actualizado exitosamente');
    
    // Registrar en el historial
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

    console.log('Registro de historial a crear:', historialData);

    const historialEntry = await Historial.create([historialData], { session });

    // Verificar que el historial se creó correctamente
    if (!historialEntry || historialEntry.length === 0) {
      throw new Error('Error al crear el registro en el historial');
    }

    console.log('Registro de historial creado:', {
      id: historialEntry[0]._id,
      stockAnterior: historialEntry[0].stockAnterior,
      stockNuevo: historialEntry[0].stockNuevo,
      stockLote: historialEntry[0].stockLote
    });

    await session.commitTransaction();
    console.log('=== FIN ENTRADA DE STOCK ===\n');
    
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
    console.error('Error en entrada de stock:', error);
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

    // Validar que el ID sea un ObjectId válido
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

    // Verificar que el producto existe
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

    // Asegurar que lotes sea un array
    const lotesArray = Array.isArray(lotes) ? lotes : [];
    
    // Calcular totales
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

    // Si no hay lotes, enviar respuesta con array vacío pero no como error
    if (lotesArray.length === 0) {
      return res.json({
        ...response,
        message: 'No hay lotes disponibles para este producto',
        error: 'NO_LOTS_AVAILABLE'
      });
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error al obtener lotes:', error);
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