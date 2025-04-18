const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// 1. Configuración de archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'build')));

// 2. Middlewares básicos
app.use(express.json());

// 3. Configuración de CORS
const corsOptions = {
  origin: [
    'https://suministros-frontend.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Habilitar preflight para todas las rutas

// 4. Rutas de la API
app.get('/api/ping', (req, res) => {
  console.log('📡 Ping recibido desde:', req.headers.origin); // Debug
  res.json({ message: 'Pong!' });
});

// 5. Ruta catch-all para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// 6. Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB conectado en:', mongoose.connection.host);
    require('./models/Producto');
    require('./models/Historial');
  })
  .catch(err => console.error('❌ Error MongoDB:', err.message));

// 7. Manejador de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error del servidor', message: err.message });
});

// 8. Exportación correcta para Vercel
module.exports = (req, res) => app(req, res);

