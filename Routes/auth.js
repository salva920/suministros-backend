const express = require('express');
const router = express.Router();

// Ruta para login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Simulación de autenticación
  if (username === 'DSR2025' && password === 'Francisco412612') {
    return res.send({ auth: true, token: 'fake-token' });
  } else {
    return res.status(401).send('Invalid credentials');
  }
});

module.exports = router;
