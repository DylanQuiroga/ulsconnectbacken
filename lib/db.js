// Conexion y singleton de mongoose para la aplicacion
const mongoose = require('mongoose');

let isConnected = false;

async function connect() {
  if (isConnected) return mongoose.connection;
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ulsconnect';
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  isConnected = true;
  return mongoose.connection;
}

module.exports = { connect, mongoose };
