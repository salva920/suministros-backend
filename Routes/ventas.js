const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const mongoose = require('mongoose');
const moment = require('moment'); // Asegúrate de que esta línea esté presente

// Crear una nueva venta (POST /api/ventas)
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Validar datos de entrada
    if (!req.body.productos || !Array.isArray(req.body.productos) || req.body.productos.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto' });
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
        precioUnitario: parseFloat(p.precioUnitario), // Asegurar tipo numérico
        gananciaUnitaria: parseFloat(p.gananciaUnitaria), // Agregar
        gananciaTotal: parseFloat(p.gananciaTotal) // Agregar
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
      
      if (producto.stock < item.cantidad) {
        throw new Error(`Stock insuficiente para el producto: ${producto.nombre}`);
      }

      producto.stock -= item.cantidad;
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
  const { 
    page = 1, 
    limit = 10, 
    sort = 'fecha', 
    order = 'desc',
    cliente: clienteId,
    saldoPendiente,
    fechaInicio,
    fechaFin
  } = req.query;

  // Construir query de filtrado
  const query = {};

  // Validar ID de cliente
  if (clienteId) {
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Formato de ID de cliente inválido' 
      });
    }
    query.cliente = new mongoose.Types.ObjectId(clienteId);
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
    limit: parseInt(limit),
    sort: { [sort]: order === 'asc' ? 1 : -1 },
    populate: [
      { 
        path: 'cliente', 
        select: 'nombre rif telefono email direccion municipio' // ✅ Todos los campos
      },
      { 
        path: 'productos.producto',
        select: 'nombre costoFinal'
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
    const ventaEliminada = await Venta.findByIdAndDelete(req.params.id);

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