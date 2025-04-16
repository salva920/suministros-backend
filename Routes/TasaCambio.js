const express = require('express');
const TasaCambio = require('../models/TasaCambio');
const router = express.Router();

// Obtener la última tasa de cambio
router.get('/tasa-cambio', async (req, res) => {
  try {
    const tasaCambio = await TasaCambio.findOne().sort({ fecha: -1 });
    res.json(tasaCambio);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la tasa de cambio' });
  }
});

// Establecer una nueva tasa de cambio
router.post('/tasa-cambio', async (req, res) => {
  const { tasa } = req.body;

  if (!tasa || tasa <= 0) {
    return res.status(400).json({ message: 'La tasa de cambio debe ser un número positivo' });
  }

  try {
    const nuevaTasaCambio = new TasaCambio({ tasa });
    await nuevaTasaCambio.save();
    res.status(201).json(nuevaTasaCambio);
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar la tasa de cambio' });
  }
});

module.exports = router;