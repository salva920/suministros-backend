const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();


const app = express();


// Manejo de solicitudes al favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Configuración de Mongoose para evitar advertencias de deprecación
mongoose.set('strictQuery', false);

const corsOptions = {
  origin: 'https://suministros-frontend.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB conectado en:', mongoose.connection.host))
.catch(err => console.error('❌ Error MongoDB:', err.message));


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

app.use('/api/facturaPendiente', require('./Routes/FacturaPendiente'));

//app.use('/api/listaprecios', require('./Routes/ListaPrecio'));

// Configurar CORS para permitir solicitudes desde el frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://suministros-frontend.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Manejar favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Error en el servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : null
  });
});

// Inicia el servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// Exportación para Vercel
module.exports = app;

