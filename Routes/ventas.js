const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); 
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const moment = require('moment'); // Asegúrate de que esta línea esté presente
const Historial = require('../models/historial');

// Crear una nueva venta (POST /api/ventas)
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Validar datos de entrada
    if (!req.body.productos || !Array.isArray(req.body.productos) || req.body.productos.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto' });
    }

    // Validar cliente
    if (!req.body.cliente) {
      return res.status(400).json({ error: 'Debe especificar un cliente' });
    }

    // Verificar que todos los IDs de producto sean válidos
    for (const item of req.body.productos) {
      if (!mongoose.Types.ObjectId.isValid(item.producto)) {
        return res.status(400).json({ error: `ID de producto inválido: ${item.producto}` });
      }
    }

    // Crear la venta
    const ventaData = {
      ...req.body,
      cliente: req.body.cliente.id || req.body.cliente,
      productos: req.body.productos.map(p => ({
        producto: p.producto.id || p.producto,
        cantidad: p.cantidad,
        precioUnitario: parseFloat(p.precioUnitario),
        gananciaUnitaria: parseFloat(p.gananciaUnitaria),
        gananciaTotal: parseFloat(p.gananciaTotal)
      }))
    };

    const venta = new Venta(ventaData);
    await venta.save({ session });

    // Actualizar stock de cada producto en la misma transacción
    for (const item of req.body.productos) {
      const producto = await Producto.findById(item.producto).session(session);
      
      if (!producto) {
        throw new Error(`Producto no encontrado: ${item.producto}`);
      }

      // Lógica FIFO para descontar de los lotes
      let cantidadRestante = item.cantidad;
      const lotes = await Historial.find({
        producto: producto._id,
        operacion: { $in: ['creacion', 'entrada'] },
        stockLote: { $gt: 0 }
      }).sort({ fecha: 1 }).session(session);

      // Verificar si hay suficiente stock en los lotes
      const stockTotalLotes = lotes.reduce((total, lote) => total + lote.stockLote, 0);
      if (stockTotalLotes < item.cantidad) {
        throw new Error(`Stock insuficiente en los lotes para el producto: ${producto.nombre}`);
      }

      // Registrar la salida en el historial
      const historialSalida = new Historial({
        producto: producto._id,
        nombreProducto: producto.nombre,
        codigoProducto: producto.codigo,
        operacion: 'salida',
        cantidad: item.cantidad,
        stockAnterior: stockTotalLotes,
        stockNuevo: stockTotalLotes - item.cantidad,
        fecha: new Date(),
        detalles: `Venta #${venta._id}`
      });
      await historialSalida.save({ session });

      // Descontar de los lotes
      for (const lote of lotes) {
        if (cantidadRestante <= 0) break;
        const cantidadDeEsteLote = Math.min(lote.stockLote, cantidadRestante);
        
        lote.stockLote -= cantidadDeEsteLote;
        await lote.save({ session });
        cantidadRestante -= cantidadDeEsteLote;
      }

      // Calcular y actualizar el stock total del producto basado en los lotes
      const stockActual = await Historial.aggregate([
        { 
          $match: { 
            producto: producto._id,
            operacion: { $in: ['creacion', 'entrada'] }
          }
        },
        { $group: { _id: null, total: { $sum: "$stockLote" } } }
      ]).session(session);

      producto.stock = stockActual[0]?.total || 0;
      await producto.save({ session });
    }

    await session.commitTransaction();
    res.status(201).json(venta);
  } catch (error) {
    await session.abortTransaction();
    console.error('Error en transacción:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    session.endSession();
  }
});

// Obtener todas las ventas (GET /api/ventas)
router.get('/', async (req, res) => {
  // Agregar validación de parámetro limit
  if (req.query.limit && isNaN(parseInt(req.query.limit))) {
    return res.status(400).json({ error: 'Parámetro limit inválido' });
  }
  
  // Forzar mínimo 1 y máximo 1000 documentos
  const limit = Math.min(Math.max(parseInt(req.query.limit || 10), 1), 1000);

  const { 
    page = 1, 
    sort = 'fecha', 
    order = 'desc',
    cliente,
    saldoPendiente,
    fechaInicio,
    fechaFin
  } = req.query;

  // Validación de ID
  if (cliente && !mongoose.Types.ObjectId.isValid(cliente)) {
    return res.status(400).json({ 
      success: false,
      error: "ID de cliente inválido" 
    });
  }

  // Construir query de filtrado
  const query = {};

  // Validar ID de cliente
  if (cliente) {
    query.cliente = new mongoose.Types.ObjectId(cliente);
  }

  // Cambiar la condición del filtro saldoPendiente
  if (saldoPendiente === 'true') { 
    query.saldoPendiente = { $gt: 0 }; // Solo mostrar ventas con saldo pendiente
  } else if (saldoPendiente === 'false') {
    query.saldoPendiente = { $lte: 0 }; // Mostrar ventas sin saldo pendiente
  } // Si saldoPendiente no está definido, no se aplica filtro

  // Filtro por fechas
  if (fechaInicio || fechaFin) {
    query.fecha = {};
    if (fechaInicio) query.fecha.$gte = new Date(fechaInicio);
    if (fechaFin) query.fecha.$lte = new Date(fechaFin);
  }

  const options = {
    page: parseInt(page),
    limit: limit, // Usar el límite validado
    sort: { [sort]: order === 'asc' ? 1 : -1 },
    populate: [
      { 
        path: 'cliente', 
        select: 'nombre rif telefono email direccion municipio',
        transform: (doc) => doc ? { 
          id: doc._id.toString(), 
          ...doc.toObject() 
        } : null 
      },
      { 
        path: 'productos.producto',
        select: 'nombre costoFinal', 
        transform: (doc) => doc ? { 
          id: doc._id.toString(), 
          nombre: doc.nombre,
          costoFinal: doc.costoFinal 
        } : null
      }
    ],
    select: '-__v'
  };

  try {
    const result = await Venta.paginate(query, options);

    // Calcular total de deudas
    const totalDeudas = await Venta.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$saldoPendiente" } } }
    ]);

    res.status(200).json({
      ventas: result.docs,
      total: result.totalDocs,
      limit: result.limit,
      page: result.page,
      pages: result.totalPages,
      totalDeudas: totalDeudas[0]?.total || 0
    });
  } catch (error) {
    console.error('Error al obtener las ventas:', error);
    res.status(500).json({ error: 'Error al obtener las ventas' });
  }
});

// Obtener una venta por ID (GET /api/ventas/:id)
router.get('/:id', async (req, res) => {
  try {
    const venta = await Venta.findById(req.params.id)
      .populate('cliente')
      .populate('productos.producto');

    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    res.json(venta);
  } catch (error) {
    console.error('Error al obtener la venta:', error);
    res.status(500).json({ 
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// Actualizar una venta (PUT /api/ventas/:id)
router.put('/:id', async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      cliente: req.body.cliente?.id || req.body.cliente, // Extraer solo el ID del cliente
      productos: req.body.productos?.map(p => ({
        producto: p.producto?.id || p.producto, // Extraer solo el ID del producto
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario,
        gananciaUnitaria: p.gananciaUnitaria,
        gananciaTotal: p.gananciaTotal
      }))
    };

    const ventaActualizada = await Venta.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true } // Devuelve el documento actualizado
    );

    if (!ventaActualizada) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    res.json(ventaActualizada);
  } catch (error) {
    console.error('Error al actualizar la venta:', error);
    res.status(500).json({ 
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null // Proporcionar detalles del error en desarrollo
    });
  }
});

// Eliminar una venta (DELETE /api/ventas/:id)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validación del ID
    if (!mongoose.Types.ObjectId.isValid(id)) { // ✅ Validación correcta en backend
      return res.status(400).json({ message: 'ID inválido' });
    }

    const ventaEliminada = await Venta.findByIdAndDelete(id);

    if (!ventaEliminada) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar la venta:', error);
    res.status(500).json({ 
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

module.exports = router;