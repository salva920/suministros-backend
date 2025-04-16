const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const gastoSchema = new mongoose.Schema({
  descripcion: {
    type: String,
    required: true,
  },
  monto: {
    type: Number,
    required: true,
  },
  categoria: {
    type: String,
    required: true,
    enum: ['empresariales', 'personales'],
  },
  fecha: {
    type: Date,
    required: true,
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

gastoSchema.plugin(mongoosePaginate);

const Gasto = mongoose.model('Gasto', gastoSchema);
module.exports = Gasto;