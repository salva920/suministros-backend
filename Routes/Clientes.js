const express = require('express');
const router = express.Router();
const Cliente = require('../models/Cliente');
const mongoose = require('mongoose');

// Middleware para manejar errores
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'ID inválido' });
    }
    res.status(500).json({ 
      message: 'Error en el servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
};

// Crear un nuevo cliente
router.post('/', asyncHandler(async (req, res) => {
  // Verificar si el RIF ya existe
  const clienteExistente = await Cliente.findOne({ rif: req.body.rif });
  if (clienteExistente) {
    return res.status(400).json({ 
      message: 'El documento ya está registrado',
      cliente: clienteExistente
    });
  }
  
  // Excluir _id explícitamente por seguridad
  const { _id, ...clienteData } = req.body;
  const nuevoCliente = new Cliente(clienteData);

  await nuevoCliente.save();
  res.status(201).json({
    message: 'Cliente registrado correctamente',
    cliente: nuevoCliente
  });
}));

// Obtener clientes con paginación
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    sort = 'nombre', 
    search 
  } = req.query;

  // Construir query de búsqueda
  const query = {};
  if (search) {
    query.$or = [
      { nombre: { $regex: search, $options: 'i' } },
      { rif: { $regex: search, $options: 'i' } }
    ];
  }

  // Opciones de paginación
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort,
    select: 'nombre rif telefono email direccion municipio categorias municipioColor'
  };

  // Ejecutar consulta paginada
  const result = await Cliente.paginate(query, options);

  // Construir respuesta
  res.json({
    success: true,
    clientes: result.docs,
    total: result.totalDocs,
    limit: result.limit,
    page: result.page,
    pages: result.totalPages
  });
}));

// Obtener un cliente por ID
router.get('/:id', asyncHandler(async (req, res) => {
  const cliente = await Cliente.findById(req.params.id)
    .select('nombre rif telefono email direccion municipio categorias fechaRegistro');
  
  if (!cliente) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }
  res.json(cliente);
}));

// Actualizar un cliente
router.put('/:id', asyncHandler(async (req, res) => {
  // Validar ID primero
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  // Obtener el cliente actual
  const clienteActual = await Cliente.findById(req.params.id);
  if (!clienteActual) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }

  // Verificar si el nuevo RIF ya existe en otro cliente
  if (req.body.rif && req.body.rif !== clienteActual.rif) {
    const clienteExistente = await Cliente.findOne({ 
      rif: req.body.rif, 
      _id: { $ne: new mongoose.Types.ObjectId(req.params.id) }
    });
    if (clienteExistente) {
      return res.status(400).json({ 
        message: 'El documento ya está registrado en otro cliente',
        cliente: clienteExistente
      });
    }
  }

  // Actualizar cliente
  const clienteActualizado = await Cliente.findByIdAndUpdate(
    req.params.id,
    req.body,
    { 
      new: true, 
      runValidators: true,
      select: 'nombre rif telefono email direccion municipio categorias fechaRegistro municipioColor'
    }
  );

  if (!clienteActualizado) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }
  
  res.json({
    message: 'Cliente actualizado correctamente',
    cliente: clienteActualizado
  });
}));

// Eliminar un cliente
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const cliente = await Cliente.findByIdAndDelete(id);
  if (!cliente) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }

  res.status(200).json({ message: 'Cliente eliminado correctamente' });
}));

module.exports = router;