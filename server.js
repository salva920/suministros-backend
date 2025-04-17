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
    'http://localhost:3000' // URL de desarrollo local
  ],
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

// Ruta /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'DSR2025' && password === 'Francisco412612') {
    res.json({ auth: true, token: "fake-token" }); // ¡Cambia esto en producción!
  } else {
    res.status(401).json({ error: "Credenciales inválidas" });
  }
});

// Ruta catch-all para manejar cualquier otra solicitud
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Algo salió mal en el servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});

app.get('/api/ping', (req, res) => {
  res.json({ message: "Pong!" });
});