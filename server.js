const dotenv = require('dotenv');
const CacheMechanism = require('./utils/cache');

dotenv.config({ path: './config.env' });

CacheMechanism.set("NODE_ENV", process.env.NODE_ENV.trim());

const App = require('./app');

const server = new App();
server.start(process.env.PORT)