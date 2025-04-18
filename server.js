const express = require('express');
const cors = require('cors');

const app = express();

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

// 3. Rutas de la API
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong!' });
});

// 4. Manejador de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error del servidor', message: err.message });
});

// 5. Exportación correcta para Vercel
// ESTO ES CRÍTICO - DEBE SER EXACTAMENTE ASÍ:
module.exports = (req, res) => app(req, res);