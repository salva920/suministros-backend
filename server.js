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

// Rutas de la API
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong!' });
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB conectado en:', mongoose.connection.host))
  .catch(err => console.error('❌ Error MongoDB:', err.message));

// Exportación para Vercel
module.exports = app;