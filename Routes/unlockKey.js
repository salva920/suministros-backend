// ferreteria-backend/Routes/unlockKey.js
const express = require('express');
const router = express.Router();
const UnlockKey = require('../models/UnlockKey');

// Inicializar clave si no existe
const initKey = async () => {
  const exists = await UnlockKey.findOne();
  if (!exists) {
    await UnlockKey.create({ key: 'abril' }); // Valor por defecto
  }
};
initKey();

// Obtener la clave actual (solo para pruebas, no exponer en producción)
router.get('/', async (req, res) => {
  const key = await UnlockKey.findOne();
  res.json({ key: key ? key.key : null });
});

// Cambiar la clave
router.post('/change', async (req, res) => {
  const { currentKey, newKey } = req.body;
  const keyDoc = await UnlockKey.findOne();
  if (!keyDoc) return res.status(404).json({ success: false, message: 'Clave no encontrada' });

  if (keyDoc.key !== currentKey) {
    return res.status(401).json({ success: false, message: 'Clave actual incorrecta' });
  }

  keyDoc.key = newKey;
  await keyDoc.save();
  res.json({ success: true, message: 'Clave actualizada correctamente' });
});

module.exports = router;