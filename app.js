const express = require('express');
const morgan = require('morgan');
const Schema = require('./utils/schema');
const MongoDB = require('./utils/mongoDB');
const CacheMechanism = require('./utils/cache');
const { RequestLogger } = require('./utils/logger');
const { verifyUser } = require('./controllers/authController');
const AuthRouter = require('./routes/authRouter');
const UserRouter = require('./routes/userRouter');
const CategoryRouter = require('./routes/categoryRouter');

const jsonParser = express.json({limit: '10mb'});
// const urlEncodedParser = express.urlencoded({ extended: true, limit: '10mb' });
// const allowedOrigins = CacheMechanism.get('CORS_ORIGINS');

async function processRequest(req, res, next) {
	req.requestTime = new Date().toISOString();
	const originalJson = res.json.bind(res);

	res.json = function (body) {
		res.body = body;
		res.sentTime = new Date().toISOString();
		return originalJson(body);
	};

	res.on('finish', () => {
		if (res.statusCode >= 400) {
			RequestLogger.error('Request completed with error status', { req, res });
		} else {
			RequestLogger.info('Request completed successfully', { req, res });
		}
	});
	const content_type = req.header('content-type');
	if (content_type && !['application/json'].includes(content_type)) {
		res.status(400).json({ success: false, error: `Invalid content type - ${content_type}` });
		return;
	}
	next();
}

async function requestParser(req, res, next) {
	const content_type = req.header('content-type');
	// if (content_type === 'application/x-www-form-urlencoded') {
	// 	return urlEncodedParser(req, res, next);
	// }
	if (content_type === 'application/json') {
		return jsonParser(req, res, next);
	}
	next();
}


class App {
	/**@type {express} */
	#app; 
	/** @type {MongoDB} */
	#mongo_db
	constructor() {
		this.#app = express();
		// CORS Middleware - must be first
		this.#app.use((req, res, next) => {
			const origin = req.headers.origin;
			if (origin) {
				res.setHeader('Access-Control-Allow-Origin', origin);
			}
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, sessionId');
			res.setHeader('Access-Control-Allow-Credentials', 'true');
			res.setHeader('Access-Control-Max-Age', '86400');
			// Handle preflight request
			if (req.method === 'OPTIONS') {
				return res.status(204).end();
			}
			next();
		});

		if (CacheMechanism.get('NODE_ENV') == 'development') {
			this.#app.use(morgan('dev'));
		}

		this.#app.use(processRequest);
		this.#app.use(requestParser);
		this.#app.use(express.static('./public/'));
		this.#app.use('/auth/v1/', AuthRouter);
		this.#app.use('/api/v1/users', verifyUser, UserRouter);
		this.#app.use('/api/v1/category', verifyUser, CategoryRouter);

		// Invalid URL handler
		this.#app.use(async (req, res) => {
			res.body = {
				status: 'Fail',
				error: 'Invaild URL',
				endpoint: req.url,
				method: req.method
			};
			res.status(404).json(res.body);
			res.sentTime = new Date().toISOString();
		});
	}

	async start(port) {
		new MongoDB();
		await MongoDB.initialize();
		new Schema();
		this.port = port || 3000;
		this.#app.listen(port, "0.0.0.0", () => {
			console.info(`Running on port ${port}`);
		});
	}
}

module.exports = App;
