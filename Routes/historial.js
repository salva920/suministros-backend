const express = require('express');
const router = express.Router();
const Historial = require('../models/historial');

// Obtener historial de entradas
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      search,
      startDate,
      endDate,
      tipo = 'entrada'
    } = req.query;

    const query = { operacion: tipo };
    
    // Agregar filtros de búsqueda
    if (search) {
      query.$or = [
        { nombreProducto: { $regex: search, $options: 'i' } },
        { codigoProducto: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtrar por fecha
    if (startDate || endDate) {
      query.fecha = {};
      if (startDate) query.fecha.$gte = new Date(startDate);
      if (endDate) query.fecha.$lte = new Date(endDate);
    }

    const result = await Historial.paginate(query, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { fecha: -1 }
    });

    res.json({
      historial: result.docs,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page
    });
    
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

module.exports = router;