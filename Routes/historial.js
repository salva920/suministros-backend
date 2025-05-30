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


module.exports = router;