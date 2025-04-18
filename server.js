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

// Configuración de CORS
const corsOptions = {
  origin: [
    'https://suministros-frontend.vercel.app', // URL de producción
    'http://localhost:3000' // Desarrollo local
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Middleware
app.use(bodyParser.json());

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

// Ruta de prueba
app.get('/api/ping', (req, res) => {
  console.log('¡Solicitud ping recibida!'); // Para verificar en logs
  res.json({ message: "Pong!" });
});

// Ruta catch-all para manejar cualquier otra solicitud
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// Agrega manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error del servidor:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});

// ¡Importante! Exporta de esta forma para Vercel
module.exports = (req, res) => app(req, res);
