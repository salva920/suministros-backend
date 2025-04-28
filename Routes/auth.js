const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Crear usuario inicial si no existe
const createInitialUser = async () => {
  try {
    const existingUser = await User.findOne({ username: 'DSR2025' });
    if (!existingUser) {
      const newUser = new User({
        username: 'DSR2025',
        password: 'Francisco412612' // Contraseña en texto plano para versión simplificada
      });
      await newUser.save();
      console.log('Usuario inicial creado exitosamente');
    }
  } catch (error) {
    console.error('Error creando usuario inicial:', error);
  }
};

createInitialUser();

// Login simplificado
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    // Comparación directa (sin bcrypt)
    if (password !== user.password) return res.status(401).json({ error: "Credenciales inválidas" });

    // Token simple (sin JWT)
    res.json({ 
      auth: true, 
      token: 'authenticated', 
      message: 'Login exitoso' 
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Actualizar contraseña (versión simplificada)
router.put('/update-password', async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    // Verificación directa de contraseña (sin bcrypt)
    if (user.password !== currentPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña actual incorrecta' 
      });
    }

    // Actualizar contraseña sin hash
    user.password = newPassword;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Contraseña actualizada exitosamente' 
    });
  } catch (error) {
    console.error('Error al actualizar contraseña:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor al actualizar contraseña' 
    });
  }
});

module.exports = router;

