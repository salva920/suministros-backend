const express = require('express');
const router = express.Router();
const ListaPrecio = require('../models/ListaPrecio');
const Producto = require('../models/Producto');

// Obtener todas las listas de precios con paginación y filtros
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      busqueda = '',
      ordenPor = 'nombreProducto',
      direccion = 'asc',
      activo
    } = req.query;
    
    // Construir objeto de consulta
    const query = {};
    
    // Filtrar por estado activo
    if (activo !== undefined) {
      query.activo = activo === 'true';
    }
    
    // Filtrar por término de búsqueda
    if (busqueda) {
      query.$or = [
        { nombreProducto: { $regex: busqueda, $options: 'i' } },
        { codigoProducto: { $regex: busqueda, $options: 'i' } },
        { descripcion: { $regex: busqueda, $options: 'i' } }
      ];
    }
    
    // Configurar opciones de paginación
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { [ordenPor]: direccion === 'desc' ? -1 : 1 },
      populate: {
        path: 'producto',
        select: 'nombre codigo stock costoFinal'
      }
    };
    
    const result = await ListaPrecio.paginate(query, options);
    
    res.status(200).json({
      listasPrecios: result.docs,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      currentPage: result.page,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage,
      prevPage: result.prevPage
    });
  } catch (error) {
    console.error('Error al obtener listas de precios:', error);
    res.status(500).json({ message: 'Error al obtener listas de precios', error: error.message });
  }
});

// Obtener lista de precios por ID
router.get('/:id', async (req, res) => {
  try {
    const listaPrecio = await ListaPrecio.findById(req.params.id)
      .populate('producto', 'nombre codigo stock costoFinal');
    
    if (!listaPrecio) {
      return res.status(404).json({ message: 'Lista de precios no encontrada' });
    }
    
    res.status(200).json(listaPrecio);
  } catch (error) {
    console.error('Error al obtener lista de precios:', error);
    res.status(500).json({ message: 'Error al obtener lista de precios', error: error.message });
  }
});

// Obtener lista de precios por producto
router.get('/producto/:productoId', async (req, res) => {
  try {
    const productoId = req.params.productoId;
    const listaPrecio = await ListaPrecio.findOne({ producto: productoId })
      .populate('producto', 'nombre codigo stock costoFinal');
    
    if (!listaPrecio) {
      return res.status(404).json({ message: 'No existe lista de precios para este producto' });
    }
    
    // Calcular los márgenes de ganancia si tiene producto con costo
    if (listaPrecio.producto && listaPrecio.producto.costoFinal) {
      await listaPrecio.calcularMargenes(listaPrecio.producto.costoFinal);
    }
    
    res.status(200).json(listaPrecio);
  } catch (error) {
    console.error('Error al obtener lista de precios por producto:', error);
    res.status(500).json({ message: 'Error al obtener lista de precios', error: error.message });
  }
});

// Crear o actualizar lista de precios
router.post('/', async (req, res) => {
  try {
    const { 
      producto, 
      precio1, 
      precio2, 
      precio3, 
      precioMayorista, 
      descripcion 
    } = req.body;

    // Verificar que el producto existe
    const productoData = await Producto.findById(producto);
    if (!productoData) {
      return res.status(404).json({ message: 'El producto no existe' });
    }

    // Buscar si ya existe una lista de precios para este producto
    let listaPrecio = await ListaPrecio.findOne({ producto });
    
    if (listaPrecio) {
      // Actualizar lista existente
      listaPrecio.precio1 = precio1 || listaPrecio.precio1;
      listaPrecio.precio2 = precio2 || listaPrecio.precio2;
      listaPrecio.precio3 = precio3 || listaPrecio.precio3;
      listaPrecio.precioMayorista = precioMayorista || listaPrecio.precioMayorista;
      listaPrecio.descripcion = descripcion || listaPrecio.descripcion;
      listaPrecio.nombreProducto = productoData.nombre;
      listaPrecio.codigoProducto = productoData.codigo;
      listaPrecio.fechaActualizacion = new Date();
      
      // Calcular márgenes de ganancia
      if (productoData.costoFinal) {
        await listaPrecio.calcularMargenes(productoData.costoFinal);
      }
      
      await listaPrecio.save();
      res.status(200).json(listaPrecio);
    } else {
      // Crear nueva lista de precios
      const nuevaListaPrecio = new ListaPrecio({
        producto,
        nombreProducto: productoData.nombre,
        codigoProducto: productoData.codigo,
        precio1: precio1 || 0,
        precio2: precio2 || 0,
        precio3: precio3 || 0,
        precioMayorista: precioMayorista || 0,
        descripcion: descripcion || ''
      });
      
      // Calcular márgenes de ganancia
      if (productoData.costoFinal) {
        await nuevaListaPrecio.calcularMargenes(productoData.costoFinal);
      }
      
      await nuevaListaPrecio.save();
      res.status(201).json(nuevaListaPrecio);
    }
  } catch (error) {
    console.error('Error al guardar lista de precios:', error);
    res.status(500).json({ message: 'Error al guardar lista de precios', error: error.message });
  }
});

// Eliminar lista de precios
router.delete('/:id', async (req, res) => {
  try {
    const listaPrecio = await ListaPrecio.findByIdAndDelete(req.params.id);
    
    if (!listaPrecio) {
      return res.status(404).json({ message: 'Lista de precios no encontrada' });
    }
    
    res.status(200).json({ message: 'Lista de precios eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar lista de precios:', error);
    res.status(500).json({ message: 'Error al eliminar lista de precios', error: error.message });
  }
});

// Actualizar precios masivamente con un porcentaje
router.post('/ajuste-masivo', async (req, res) => {
  try {
    const { porcentaje, tiposPrecio = [] } = req.body;
    
    if (!porcentaje || isNaN(porcentaje)) {
      return res.status(400).json({ message: 'Se requiere un porcentaje válido' });
    }
    
    if (tiposPrecio.length === 0) {
      return res.status(400).json({ message: 'Debe seleccionar al menos un tipo de precio' });
    }
    
    // Convertir el porcentaje a un factor multiplicador
    const factor = 1 + (porcentaje / 100);

    // Actualizar todos los precios seleccionados
    const updateObj = {};
    tiposPrecio.forEach(tipo => {
      if (['precio1', 'precio2', 'precio3', 'precioMayorista'].includes(tipo)) {
        updateObj[tipo] = { $mul: factor };
      }
    });
    
    const resultado = await ListaPrecio.updateMany(
      { activo: true }, 
      { $set: { fechaActualizacion: new Date() }, ...updateObj }
    );
    
    // También actualizar márgenes después del ajuste (esto se haría mejor en un método post)
    const listasActualizadas = await ListaPrecio.find({ activo: true })
      .populate('producto', 'costoFinal');
      
    for (const lista of listasActualizadas) {
      if (lista.producto && lista.producto.costoFinal) {
        await lista.calcularMargenes(lista.producto.costoFinal);
        await lista.save();
      }
    }
    
    res.status(200).json({ 
      message: `Se actualizaron ${resultado.modifiedCount} listas de precios con un ${porcentaje > 0 ? 'aumento' : 'descuento'} del ${Math.abs(porcentaje)}%`,
      resultado
    });
  } catch (error) {
    console.error('Error al actualizar precios masivamente:', error);
    res.status(500).json({ message: 'Error al actualizar precios', error: error.message });
  }
});

module.exports = router;