const mongoose = require('mongoose');

function registerProductHooks() {
  const Producto = mongoose.model('Producto');
  const Historial = mongoose.model('Historial');

  Producto.schema.post('save', function(doc) {
    Historial.create({
      producto: doc._id,
      tipo: doc.isNew ? 'creacion' : 'actualizacion',
      cambios: doc.modifiedPaths()
    }).catch(err => console.error('Error en hook save:', err));
  });

  Producto.schema.post('remove', function(doc) {
    Historial.create({
      producto: doc._id,
      tipo: 'eliminacion'
    }).catch(err => console.error('Error en hook remove:', err));
  });
}

module.exports = registerProductHooks;