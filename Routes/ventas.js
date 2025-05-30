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

    // Validación mejorada de montos
    const total = parseFloat(req.body.total.toFixed(2));
    const montoAbonado = parseFloat((req.body.montoAbonado || 0).toFixed(2));
    const saldoPendiente = parseFloat((req.body.saldoPendiente || 0).toFixed(2));

    if (isNaN(total) || total < 0) {
      return res.status(400).json({ error: 'Total inválido' });
    }

    if (isNaN(montoAbonado) || montoAbonado < 0) {
      return res.status(400).json({ error: 'Monto abonado inválido' });
    }

    // Validar que los montos coincidan
    const diferencia = Math.abs(total - montoAbonado - saldoPendiente);
    if (diferencia > 0.05) {
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

    // Formatear productos con precisión decimal
    const productos = req.body.productos.map(p => ({
      producto: p.producto,
      cantidad: parseFloat(p.cantidad.toFixed(2)),
      precioUnitario: parseFloat(p.precioUnitario.toFixed(2)),
      costoInicial: parseFloat(p.costoInicial.toFixed(2)),
      gananciaUnitaria: parseFloat(p.gananciaUnitaria.toFixed(2)),
      gananciaTotal: parseFloat(p.gananciaTotal.toFixed(2))
    }));

    // Cálculo de verificación
    const totalVerificado = parseFloat(productos.reduce((sum, p) => 
      sum + (p.precioUnitario * p.cantidad), 0).toFixed(2));
      
    if (Math.abs(total - totalVerificado) > 0.05) {
      return res.status(400).json({ 
        error: 'Discrepancia en cálculo de total',
        detalles: {
          total,
          totalVerificado,
          diferencia: Math.abs(total - totalVerificado)
        }
      });
    }

    // Crear venta con datos formateados
    const ventaData = {
      fecha: new Date(req.body.fecha),
      cliente: req.body.cliente,
      productos,
      total,
      tipoPago: req.body.tipoPago,
      metodoPago: req.body.metodoPago,
      nrFactura: req.body.nrFactura,
      banco: req.body.metodoPago !== 'efectivo' ? req.body.banco : undefined,
      montoAbonado,
      saldoPendiente,
      estado: 'activa',
      estadoCredito: saldoPendiente > 0 ? 'vigente' : 'pagado'
    };

    const venta = new Venta(ventaData);
    await venta.save({ session });

    // Proceso de actualización de stock
    for (const item of productos) {
      const producto = await Producto.findById(item.producto).session(session);
      
      if (!producto) {
        throw new Error(`Producto no encontrado: ${item.producto}`);
      }

      // Solo aplicar la lógica especial para el producto con inconsistencia
      if (producto._id.toString() === '6834774f5e6ceeeab51f6937') {
        let cantidadRestante = item.cantidad;

        // Obtener el último registro de entrada para mantener la consistencia
        const ultimaEntrada = await Historial.findOne({
          producto: producto._id,
          operacion: { $in: ['creacion', 'entrada'] },
          fecha: { $lt: new Date('2025-05-27T14:47:37.757+00:00') }
        })
        .sort({ fecha: -1 })
        .lean()
        .session(session);

        if (!ultimaEntrada) {
          throw new Error(`No hay registros de entrada para el producto: ${producto.nombre}`);
        }

        // Optimizar consulta de lotes con índices
        const lotes = await Historial.find({
          producto: producto._id,
          operacion: { $in: ['creacion', 'entrada'] },
          stockLote: { $gt: 0 },
          fecha: { $lt: new Date('2025-05-27T14:47:37.757+00:00') }
        })
        .sort({ fecha: 1 })
        .lean()
        .session(session);

        // Verificar stock total
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
          stockAnterior: ultimaEntrada.stockNuevo,
          stockNuevo: ultimaEntrada.stockNuevo - item.cantidad,
          fecha: new Date(),
          detalles: `Venta #${venta._id} - Lote anterior: ${ultimaEntrada.stockNuevo}`,
          stockLote: 0
        });
        await historialSalida.save({ session });

        // Descontar de los lotes manteniendo el stockLote
        for (const lote of lotes) {
          if (cantidadRestante <= 0) break;
          const cantidadUsar = Math.min(lote.stockLote, cantidadRestante);
          
          await Historial.updateOne(
            { _id: lote._id },
            { 
              $inc: { 
                stockLote: -cantidadUsar,
                stockNuevo: -cantidadUsar 
              }
            }
          ).session(session);
          
          cantidadRestante -= cantidadUsar;
        }

        // Actualizar stock del producto
        producto.stock = historialSalida.stockNuevo;
        await producto.save({ session });
      } else {
        // Lógica normal para otros productos
        let cantidadRestante = item.cantidad;
        const lotes = await Historial.find({
          producto: producto._id,
          operacion: { $in: ['creacion', 'entrada'] },
          stockLote: { $gt: 0 }
        })
        .sort({ fecha: 1 })
        .lean()
        .session(session);

        const stockTotalLotes = lotes.reduce((total, lote) => total + lote.stockLote, 0);
        if (stockTotalLotes < item.cantidad) {
          throw new Error(`Stock insuficiente en los lotes para el producto: ${producto.nombre}`);
        }

        const historialSalida = new Historial({
          producto: producto._id,
          nombreProducto: producto.nombre,
          codigoProducto: producto.codigo,
          operacion: 'salida',
          cantidad: item.cantidad,
          stockAnterior: stockTotalLotes,
          stockNuevo: stockTotalLotes - item.cantidad,
          fecha: new Date(),
          detalles: `Venta #${venta._id}`,
          stockLote: 0
        });
        await historialSalida.save({ session });

        for (const lote of lotes) {
          if (cantidadRestante <= 0) break;
          const cantidadUsar = Math.min(lote.stockLote, cantidadRestante);
          await Historial.updateOne(
            { _id: lote._id },
            { $inc: { stockLote: -cantidadUsar } }
          ).session(session);
          cantidadRestante -= cantidadUsar;
        }

        producto.stock = stockTotalLotes - item.cantidad;
        await producto.save({ session });
      }
    }

    await session.commitTransaction();
    res.status(201).json(venta);
  } catch (error) {
    await session.abortTransaction();
    console.error('Error en transacción:', error);
    res.status(500).json({ 
      error: error.message,
      detalles: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
      saldoPendiente,
      getAll = false // Nuevo parámetro para obtener todos los registros
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

    // Validar y normalizar ID del cliente
    if (cliente) {
      if (!mongoose.Types.ObjectId.isValid(cliente)) {
        return res.status(400).json({ error: 'ID de cliente inválido' });
      }
      query.cliente = new mongoose.Types.ObjectId(cliente);
    }

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

    let result;
    if (getAll === 'true') {
      // Si getAll es true, obtener todos los registros sin paginación
      const ventas = await Venta.find(query)
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .populate([
          { 
            path: 'cliente', 
            select: 'nombre rif telefono email direccion municipio'
          },
          { 
            path: 'productos.producto',
            select: 'nombre costoFinal'
          }
        ]);

      result = {
        docs: ventas,
        totalDocs: ventas.length,
        totalPages: 1,
        page: 1
      };
    } else {
      // Usar paginación normal
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

      result = await Venta.paginate(query, options);
    }

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
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    console.log('=== Inicio de actualización de venta ===');
    console.log('ID de venta recibido:', req.params.id);
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));

    // Validar ID de venta
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error('ID de venta inválido:', req.params.id);
      return res.status(400).json({ error: 'ID de venta inválido' });
    }

    // Buscar la venta existente
    const venta = await Venta.findById(req.params.id).session(session);
    if (!venta) {
      console.error('Venta no encontrada:', req.params.id);
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Validar y normalizar los datos recibidos
    const montoAbonado = parseFloat(req.body.montoAbonado || 0);
    const total = parseFloat(req.body.total || venta.total);
    const saldoPendiente = parseFloat(req.body.saldoPendiente || 0);
    const fecha = req.body.fecha ? new Date(req.body.fecha) : venta.fecha;

    console.log('Montos normalizados:', {
      montoAbonado,
      total,
      saldoPendiente,
      fecha,
      tipoMontoAbonado: typeof montoAbonado,
      tipoTotal: typeof total
    });

    // Validaciones básicas
    if (isNaN(montoAbonado) || montoAbonado < 0) {
      console.error('Monto abonado inválido:', montoAbonado);
      return res.status(400).json({ error: 'Monto abonado inválido' });
    }

    if (montoAbonado > total) {
      console.error('Abono excede el total:', { montoAbonado, total });
      return res.status(400).json({ error: 'El abono no puede exceder el total' });
    }

    // Actualizar los campos
    venta.montoAbonado = montoAbonado;
    venta.saldoPendiente = saldoPendiente;
    venta.estadoCredito = saldoPendiente > 0 ? 'vigente' : 'pagado';
    venta.fecha = fecha;

    console.log('Datos actualizados:', {
      nuevoMontoAbonado: venta.montoAbonado,
      nuevoSaldoPendiente: venta.saldoPendiente,
      nuevoEstadoCredito: venta.estadoCredito,
      nuevaFecha: venta.fecha
    });

    // Guardar cambios
    await venta.save({ session });

    // Poblar los campos relacionados
    await venta.populate([
      { 
        path: 'cliente',
        select: 'nombre rif telefono email direccion municipio'
      },
      { 
        path: 'productos.producto',
        select: 'nombre costoFinal'
      }
    ]);

    console.log('Venta actualizada exitosamente:', {
      id: venta._id,
      montoAbonado: venta.montoAbonado,
      saldoPendiente: venta.saldoPendiente,
      estadoCredito: venta.estadoCredito,
      fecha: venta.fecha
    });

    await session.commitTransaction();
    res.json(venta);
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al actualizar venta:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      params: req.params
    });
    res.status(500).json({ 
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    session.endSession();
    console.log('=== Fin de actualización de venta ===');
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