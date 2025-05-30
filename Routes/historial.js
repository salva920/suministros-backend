const express = require('express');
const router = express.Router();
const Historial = require('../models/historial');
const mongoose = require('mongoose');
const Producto = require('../models/Producto');

// Obtener historial de operaciones
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      search,
      startDate,
      endDate,
      tipo = 'entrada',
      producto,
      getAll = false
    } = req.query;


    // Validar tipo de operación
    const tiposValidos = ['entrada', 'salida', 'creacion', 'ajuste', 'eliminacion'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ 
        error: 'Tipo de operación inválido',
        tiposValidos 
      });
    }

    // Construir query
    const query = { operacion: tipo };
    
    // Validar y agregar filtro de producto
    if (producto) {
      if (!mongoose.Types.ObjectId.isValid(producto)) {
        return res.status(400).json({ error: 'ID de producto inválido' });
      }
      query.producto = producto;
    }
    
    // Agregar filtros de búsqueda con límite de caracteres
    if (search) {
      if (search.length > 50) {
        return res.status(400).json({ error: 'Término de búsqueda demasiado largo' });
      }
      query.$or = [
        { nombreProducto: { $regex: search, $options: 'i' } },
        { codigoProducto: { $regex: search, $options: 'i' } }
      ];
    }

    // Validar y agregar filtros de fecha
    if (startDate || endDate) {
      query.fecha = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({ error: 'Fecha de inicio inválida' });
        }
        query.fecha.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({ error: 'Fecha de fin inválida' });
        }
        query.fecha.$lte = end;
      }
    }


    let result;
    if (getAll === 'true') {
      // Si getAll es true, obtener todos los registros sin paginación
      console.log('Obteniendo todos los registros sin paginación...');
      const historial = await Historial.find(query)
        .sort({ fecha: -1 })
        .select('-__v')
        .lean();


      result = {
        docs: historial,
        totalDocs: historial.length,
        totalPages: 1,
        page: 1
      };
    } else {
      // Validar y ajustar límites de paginación
      const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
      const pageNum = Math.max(parseInt(page) || 1, 1);

      result = await Historial.paginate(query, {
        page: pageNum,
        limit: limitNum,
        sort: { fecha: -1 },
        select: '-__v'
      });
    }

    // Calcular totales por tipo de operación
    const totales = await Historial.aggregate([
      { $match: query },
      { 
        $group: { 
          _id: null,
          totalCantidad: { $sum: "$cantidad" },
          totalStock: { $sum: "$stockLote" }
        } 
      }
    ]);

    res.json({
      historial: result.docs,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page,
      totales: totales[0] || { totalCantidad: 0, totalStock: 0 }
    });
    
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ 
      error: 'Error al obtener historial',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Ruta para corregir inconsistencia en historial
router.post('/corregir-inconsistencia', async (req, res) => {
  console.log('Recibida petición de corrección');
  console.log('Body recibido:', req.body);
  
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    console.log('Sesión de MongoDB iniciada');

    const { productoId } = req.body;
    console.log('Producto ID recibido:', productoId);
    
    if (!productoId) {
      throw new Error('ID de producto no proporcionado');
    }

    if (!mongoose.Types.ObjectId.isValid(productoId)) {
      throw new Error('ID de producto inválido');
    }

    // Verificar que el producto existe
    const productoExiste = await Producto.findById(productoId).session(session);
    if (!productoExiste) {
      throw new Error('Producto no encontrado');
    }
    console.log('Producto encontrado:', productoExiste.nombre);

    console.log('Buscando salidas posteriores al 27 de mayo...');
    const salidas = await Historial.find({
      producto: productoId,
      operacion: 'salida',
      fecha: { $gte: new Date('2025-05-27T14:47:37.757+00:00') }
    })
    .sort({ fecha: 1 })
    .session(session);

    console.log(`Encontradas ${salidas.length} salidas para corregir`);

    // Calcular el total de salidas
    const totalSalidas = salidas.reduce((sum, salida) => sum + salida.cantidad, 0);
    console.log('Total de salidas:', totalSalidas);

    // Obtener la última salida para saber el stock final deseado
    const ultimaSalida = salidas[salidas.length - 1];
    const stockFinalDeseado = ultimaSalida.stockNuevo;
    console.log('Stock final deseado:', stockFinalDeseado);

    // Calcular el stock inicial necesario
    const stockInicialNecesario = totalSalidas + stockFinalDeseado;
    console.log('Stock inicial necesario:', stockInicialNecesario);

    // Buscar la entrada del 19 de enero
    console.log('Buscando entrada del 19 de enero...');
    const ultimaEntrada = await Historial.findOne({
      producto: productoId,
      operacion: { $in: ['creacion', 'entrada'] },
      fecha: new Date('2025-01-19T00:00:00.000+00:00')
    })
    .session(session);

    if (!ultimaEntrada) {
      throw new Error('No se encontró la entrada del 19 de enero');
    }

    // Actualizar el stock de la entrada inicial
    ultimaEntrada.stockNuevo = stockInicialNecesario;
    ultimaEntrada.detalles = `Ajuste de stock inicial para corregir inconsistencias - Stock anterior: ${ultimaEntrada.stockNuevo}`;
    await ultimaEntrada.save({ session });

    console.log('Entrada actualizada:', {
      fecha: ultimaEntrada.fecha,
      stockNuevo: ultimaEntrada.stockNuevo,
      operacion: ultimaEntrada.operacion
    });

    let stockActual = stockInicialNecesario;
    console.log('Stock inicial ajustado:', stockActual);

    // Corregir cada salida
    for (const salida of salidas) {
      console.log('Corrigiendo salida:', {
        id: salida._id,
        fecha: salida.fecha,
        cantidad: salida.cantidad,
        stockAnterior: salida.stockAnterior,
        stockNuevo: salida.stockNuevo
      });

      salida.stockAnterior = stockActual;
      salida.stockNuevo = stockActual - salida.cantidad;
      salida.detalles = `Venta #${salida.detalles.split('#')[1]} - Lote anterior: ${stockActual}`;
      
      await salida.save({ session });
      stockActual = salida.stockNuevo;

      console.log('Salida corregida:', {
        stockAnterior: salida.stockAnterior,
        stockNuevo: salida.stockNuevo,
        stockActual
      });
    }

    // Actualizar el stock del producto
    const producto = await Producto.findById(productoId).session(session);
    if (producto) {
      console.log('Stock del producto antes de actualizar:', producto.stock);
      producto.stock = stockActual;
      await producto.save({ session });
      console.log('Stock del producto actualizado:', producto.stock);
    }

    await session.commitTransaction();
    console.log('=== Corrección completada exitosamente ===');
    console.log('Stock final:', stockActual);
    console.log('Salidas corregidas:', salidas.length);

    res.json({ 
      message: 'Inconsistencia corregida exitosamente',
      stockInicial: stockInicialNecesario,
      stockFinal: stockActual,
      salidasCorregidas: salidas.length,
      detalles: {
        totalSalidas,
        stockFinalDeseado,
        stockInicialAjustado: stockInicialNecesario
      }
    });

  } catch (error) {
    console.error('Error detallado:', error);
    if (session) {
      await session.abortTransaction();
    }
    res.status(500).json({ 
      error: 'Error al corregir inconsistencia',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    if (session) {
      session.endSession();
    }
  }
});

module.exports = router;