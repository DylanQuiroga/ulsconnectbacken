const mongoose = require('mongoose');

let isConnected = false;

async function connect() {
  if (isConnected) return mongoose.connection;
  const uri = process.env.MONGO_URI || 'mongodb://monkey5:TalfBattleship123@ac-tr7vlk6-shard-00-00.dwvwxn6.mongodb.net:27017,ac-tr7vlk6-shard-00-01.dwvwxn6.mongodb.net:27017,ac-tr7vlk6-shard-00-02.dwvwxn6.mongodb.net:27017/?replicaSet=atlas-wrsqyw-shard-0&ssl=true&authSource=admin';
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  isConnected = true;
  return mongoose.connection;
}

module.exports = { connect, mongoose };
