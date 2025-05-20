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

    // Validar montos y números
    const total = parseFloat(req.body.total);
    const montoAbonado = parseFloat(req.body.montoAbonado || 0);
    const saldoPendiente = parseFloat(req.body.saldoPendiente || 0);

    if (isNaN(total) || total < 0) {
      return res.status(400).json({ error: 'Total inválido' });
    }

    if (isNaN(montoAbonado) || montoAbonado < 0) {
      return res.status(400).json({ error: 'Monto abonado inválido' });
    }

    // Validar que los montos coincidan
    const diferencia = Math.abs(total - montoAbonado - saldoPendiente);
    if (diferencia > 0.01) {
      return res.status(400).json({ 
        error: 'El saldo pendiente no coincide con el total y monto abonado',
        detalles: {
          total,
          montoAbonado,
          saldoPendiente,
          diferencia
        }
      });
    }

    // Verificar que todos los IDs de producto sean válidos
    for (const item of req.body.productos) {
      if (!mongoose.Types.ObjectId.isValid(item.producto)) {
        return res.status(400).json({ error: `ID de producto inválido: ${item.producto}` });
      }

      // Validar montos del producto
      if (isNaN(item.cantidad) || item.cantidad <= 0) {
        return res.status(400).json({ error: `Cantidad inválida para el producto: ${item.producto}` });
      }
      if (isNaN(item.precioUnitario) || item.precioUnitario < 0) {
        return res.status(400).json({ error: `Precio unitario inválido para el producto: ${item.producto}` });
      }
      if (isNaN(item.gananciaUnitaria) || item.gananciaUnitaria < 0) {
        return res.status(400).json({ error: `Ganancia unitaria inválida para el producto: ${item.producto}` });
      }
      if (isNaN(item.gananciaTotal) || item.gananciaTotal < 0) {
        return res.status(400).json({ error: `Ganancia total inválida para el producto: ${item.producto}` });
      }
    }

    // Crear la venta con datos formateados
    const ventaData = {
      fecha: new Date(req.body.fecha),
      cliente: req.body.cliente,
      productos: req.body.productos.map(p => ({
        producto: p.producto,
        cantidad: parseFloat(p.cantidad),
        precioUnitario: parseFloat(p.precioUnitario),
        costoInicial: parseFloat(p.costoInicial),
        gananciaUnitaria: parseFloat(p.gananciaUnitaria),
        gananciaTotal: parseFloat(p.gananciaTotal)
      })),
      total: total,
      tipoPago: req.body.tipoPago,
      metodoPago: req.body.metodoPago,
      nrFactura: req.body.nrFactura,
      banco: req.body.metodoPago !== 'efectivo' ? req.body.banco : undefined,
      montoAbonado: montoAbonado,
      saldoPendiente: saldoPendiente,
      estado: 'activa'
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

      // Actualizar el stock del producto basado en los lotes restantes
      const stockActualizado = await Historial.aggregate([
        { 
          $match: { 
            producto: producto._id,
            operacion: { $in: ['creacion', 'entrada'] }
          }
        },
        { $group: { _id: null, total: { $sum: "$stockLote" } } }
      ]).session(session);

      // Actualizar el stock del producto con el total de los lotes
      producto.stock = stockActualizado[0]?.total || 0;
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

// Anular una venta (PUT /api/ventas/:id/anular)
router.put('/:id/anular', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const venta = await Venta.findById(req.params.id).session(session);
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    if (venta.estado === 'anulada') {
      return res.status(400).json({ error: 'La venta ya está anulada' });
    }

    // Devolver stock a los lotes
    for (const item of venta.productos) {
      const producto = await Producto.findById(item.producto).session(session);
      if (!producto) continue;

      // Buscar el lote más reciente para devolver el stock
      const lote = await Historial.findOne({
        producto: producto._id,
        operacion: { $in: ['creacion', 'entrada'] }
      }).sort({ fecha: -1 }).session(session);

      if (lote) {
        lote.stockLote += item.cantidad;
        await lote.save({ session });
      }

      // Registrar la devolución en el historial
      const historialDevolucion = new Historial({
        producto: producto._id,
        nombreProducto: producto.nombre,
        codigoProducto: producto.codigo,
        operacion: 'entrada',
        cantidad: item.cantidad,
        stockAnterior: producto.stock,
        stockNuevo: producto.stock + item.cantidad,
        fecha: new Date(),
        detalles: `Devolución por anulación de venta #${venta._id}`
      });
      await historialDevolucion.save({ session });

      // Actualizar stock del producto
      producto.stock += item.cantidad;
      await producto.save({ session });
    }

    // Marcar la venta como anulada
    venta.estado = 'anulada';
    await venta.save({ session });

    await session.commitTransaction();
    res.json({ message: 'Venta anulada correctamente', venta });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al anular la venta:', error);
    res.status(500).json({ 
      error: 'Error al anular la venta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
});

// Obtener todas las ventas (GET /api/ventas)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      sort = 'fecha',
      order = 'desc',
      cliente,
      estado,
      estadoCredito,
      tipoPago,
      fechaInicio,
      fechaFin,
      saldoPendiente
    } = req.query;

    // Validar parámetros
    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      return res.status(400).json({ error: 'Límite inválido' });
    }

    if (cliente && !mongoose.Types.ObjectId.isValid(cliente)) {
      return res.status(400).json({ error: 'ID de cliente inválido' });
    }

    // Construir query
    const query = {};

    if (cliente) query.cliente = cliente;
    if (estado) query.estado = estado;
    if (estadoCredito) query.estadoCredito = estadoCredito;
    if (tipoPago) query.tipoPago = tipoPago;
    if (saldoPendiente === 'true') query.saldoPendiente = { $gt: 0 };
    if (saldoPendiente === 'false') query.saldoPendiente = { $lte: 0 };

    // Validar y agregar filtros de fecha
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) {
        const start = new Date(fechaInicio);
        if (isNaN(start.getTime())) {
          return res.status(400).json({ error: 'Fecha de inicio inválida' });
        }
        query.fecha.$gte = start;
      }
      if (fechaFin) {
        const end = new Date(fechaFin);
        if (isNaN(end.getTime())) {
          return res.status(400).json({ error: 'Fecha de fin inválida' });
        }
        query.fecha.$lte = end;
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sort]: order === 'asc' ? 1 : -1 },
      populate: [
        { 
          path: 'cliente', 
          select: 'nombre rif telefono email direccion municipio'
        },
        { 
          path: 'productos.producto',
          select: 'nombre costoFinal'
        }
      ]
    };

    const result = await Venta.paginate(query, options);

    // Calcular totales
    const totales = await Venta.aggregate([
      { $match: query },
      { 
        $group: { 
          _id: null,
          totalVentas: { $sum: "$total" },
          totalSaldoPendiente: { $sum: "$saldoPendiente" }
        } 
      }
    ]);

    res.json({
      ventas: result.docs,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page,
      totales: totales[0] || { totalVentas: 0, totalSaldoPendiente: 0 }
    });
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ 
      error: 'Error al obtener ventas',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener una venta por ID (GET /api/ventas/:id)
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID de venta inválido' });
    }

    const venta = await Venta.findById(req.params.id)
      .populate('cliente')
      .populate('productos.producto');

    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    res.json(venta);
  } catch (error) {
    console.error('Error al obtener la venta:', error);
    res.status(500).json({ 
      error: 'Error al obtener la venta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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