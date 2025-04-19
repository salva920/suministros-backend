const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Middlewares básicos
app.use(express.json());

// Configuración de CORS
const corsOptions = {
  origin: 'https://suministros-frontend.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));


// Ruta de login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }
    
    // Autenticación simple
    if (username === 'DSR2025' && password === 'Francisco412612') {
      res.json({ auth: true, token: "fake-token" });
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.use('/api/dashboard', require('./Routes/Dashboard'));

app.use('/api/productos', require('./Routes/Productos'));

app.use('/api/clientes', require('./Routes/Clientes'));

app.use('/api/caja', require('./Routes/caja'));

app.use('/api/gastos', require('./Routes/gastos'));

app.use('/api/historial', require('./Routes/historial'));

app.use('/api', require('./Routes/TasaCambio'));

app.use('/api/ventas', require('./Routes/ventas'));


// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB conectado en:', mongoose.connection.host))
  .catch(err => console.error('❌ Error MongoDB:', err.message));

// Exportación para Vercel
module.exports = app;