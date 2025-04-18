const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');


// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Conectado a MongoDB');
  // Registrar hooks después de que todos los modelos estén definidos
  require('./models/Producto');
  require('./models/Historial');
  // Registrar hooks
  require('./models/hooks')();
})
.catch(err => console.error('Error conectando a MongoDB:', err));


// Importar rutas
const cajaRouter = require('./routes/caja');
const clientesRouter = require('./routes/clientes');
const productosRouter = require('./routes/productos');
const tasaCambioRoutes = require('./routes/tasaCambio');
const historialRoutes = require('./routes/historial');
const ventasRouter = require('./routes/ventas');
const gastosRouter = require('./routes/gastos'); 
const authRoutes = require('./routes/auth'); 


const app = express();
const PORT = process.env.PORT || 5000;

// 1. Middlewares básicos primero
app.use(express.json());

// 2. Configuración CORS
const corsOptions = {
  origin: [
    'https://suministros-frontend.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Algunos navegadores requieren 200 para OPTIONS
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Habilitar preflight para todas las rutas

// Ruta simple de prueba
app.get('/ping', (req, res) => {
  // Añadir headers CORS manualmente
  res.setHeader('Access-Control-Allow-Origin', 'https://suministros-frontend.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Responder con un mensaje simple
  res.status(200).json({ message: 'Pong!' });
});

// Manejador OPTIONS específico
app.options('/ping', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://suministros-frontend.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

// Ruta de prueba simple
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong!' });
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'build')));

// Rutas
app.use('/api/clientes', clientesRouter);
app.use('/api/productos', productosRouter);
app.use('/api', tasaCambioRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/ventas', ventasRouter);
app.use('/api/caja', cajaRouter); 
app.use('/api/gastos', gastosRouter); 
app.use('/api', authRoutes);

// Ruta /api/login (versión mejorada)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }
    
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

// Ruta catch-all para manejar cualquier otra solicitud
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Error del servidor', 
    message: err.message 
  });
});

// 5. Exportación correcta para Vercel
// ESTO ES CRÍTICO - DEBE SER EXACTAMENTE ASÍ:
module.exports = (req, res) => app(req, res);

