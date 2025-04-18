// server.js (versión corregida)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error MongoDB:', err));

const app = express();

// Configuración CORS
const corsOptions = {
  origin: ['https://suministros-frontend.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Rutas de la API
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong!', mongo: mongoose.connection.readyState === 1 });
});

app.post('/api/login', (req, res) => {
  // Lógica de login aquí
});

// Exportación para Vercel
module.exports = app;