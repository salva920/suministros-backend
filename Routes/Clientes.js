const express = require('express');
const router = express.Router();
const Cliente = require('../models/Cliente');
const mongoose = require('mongoose');

// Middleware para manejar errores específicos
const handleErrors = (res, error) => {
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'ID inválido' });
  }
  res.status(500).json({ message: 'Error en el servidor' });
};

// Crear un nuevo cliente
router.post('/', async (req, res) => {
  try {
    // Verificar si el RIF ya existe
    const clienteExistente = await Cliente.findOne({ rif: req.body.rif });
    if (clienteExistente) {
      return res.status(400).json({ message: 'El RIF ya está registrado' });
    }
    // Excluir _id explícitamente por seguridad
    const { _id, ...clienteData } = req.body;
    const nuevoCliente = new Cliente(clienteData);

    await nuevoCliente.save();
    res.status(201).json(nuevoCliente);
  } catch (error) {
    handleErrors(res, error);
  }
});

// Obtener clientes con paginación
router.get('/', async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: req.query.sort || 'nombre' // Puedes cambiar el campo de ordenamiento según tus necesidades
    };

    const result = await Cliente.paginate({}, options); // Asegúrate de que el método paginate esté disponible en tu modelo

    // Modificar la respuesta para incluir un array de clientes
    res.json({
      clientes: result.docs.map(doc => ({
        _id: doc._id,
        nombre: doc.nombre,
        telefono: doc.telefono,
        email: doc.email,
        direccion: doc.direccion,
        municipio: doc.municipio,
        rif: doc.rif,
        categorias: doc.categorias,
        municipioColor: doc.municipioColor // Asegúrate de incluir todos los campos necesarios
      })),
      total: result.totalDocs,
      limit: result.limit,
      page: result.page,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// Obtener un cliente por ID
router.get('/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id)
      .select('nombre rif telefono email direccion municipio categorias fechaRegistro');
    
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    res.json(cliente);
  } catch (error) {
    handleErrors(res, error);
  }
});

// Actualizar un cliente
router.put('/:id', async (req, res) => {
  try {
    // Validar ID primero
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    // Verificar si el nuevo RIF ya existe en otro cliente
    if (req.body.rif) {
      const clienteExistente = await Cliente.findOne({ 
        rif: req.body.rif, 
        _id: { $ne: req.params.id } 
      });
      if (clienteExistente) {
        return res.status(400).json({ message: 'El RIF ya está registrado en otro cliente' });
      }
    }

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
    res.json(clienteActualizado);
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
});

// Eliminar un cliente
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const cliente = await Cliente.findByIdAndDelete(id);
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.status(200).json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar el cliente:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;