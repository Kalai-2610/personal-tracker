const CacheMechanism = require("./cache");
const MongoDB = require("./mongoDB");

class RequestLogger {

    static #log(level, message, { req = null, res = null, error = null} = {}) {
		const timestamp = new Date();
		// Helper to format date with milliseconds
		function formatDateWithMs(date) {
			if (!date) return undefined;
			const d = new Date(date).toISOString();
			return d;
		}
		// Use request/response times if available
		const requestTime = formatDateWithMs(req.requestTime);
		const sentTime = formatDateWithMs(res.sentTime);
		let responseTime = null;
		if (requestTime && sentTime) {
			responseTime = new Date(sentTime) - new Date(requestTime);
		}
		const logData = {
			timestamp,
			level,
			message,
			request: {
					method: req?.method,
					url: req?.url,
					originalUrl: req?.originalUrl,
					headers: req?.headers,
					body: req?.body,
					params: req?.params,
					query: req?.query,
					ip: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
					requestTime
				},
			response: {
					statusCode: res?.statusCode,
					headers: res?.getHeaders ? res.getHeaders() : res?.headers,
					body: res?.body,
					sentTime
				},
			responseTime,
			error: {
					message: error?.message,
					stack: error?.stack
				}
		};
        logData.message || delete logData.message;
        logData.error || delete logData.error
        if(CacheMechanism.get("NODE_ENV") === 'production' && ['error', 'warn', 'info'].includes(level)) {
			MongoDB.logs.insertOne(logData).catch( err => {
				console.error('Failed to save log to MongoDB:', err);
            });
        } else {
			console.log(JSON.stringify(logData, null, 2));
		}
	}

	static info(message, opts = {}) {
		RequestLogger.#log('info', message, opts);
	}

	static error(message, opts = {}) {
		RequestLogger.#log('error', message, opts);
	}

	static debug(message, opts = {}) {
		RequestLogger.#log('debug', message, opts);
	}

	static warn(message, opts = {}) {
		RequestLogger.#log('warn', message, opts);
	}
}

class CommonLogger {
	static #log(level, message, { error = null } = {}) {
		const timestamp = new Date();
		const logData = {
			timestamp,
			level,
			message,
			error: error
				? {
					message: error.message,
					stack: error.stack
				}
				: undefined
		};
        if(CacheMechanism.get("NODE_ENV") === 'production' && ['error', 'warn', 'info'].includes(level)) {
			MongoDB.logs.insertOne(logData).catch( err => {
				console.error('Failed to save log to MongoDB:', err);
            });
        } else {
			console.log(JSON.stringify(logData, null, 2));
		}
	}

	static info(message, opts = {}) {
		CommonLogger.#log('info', message, opts);
	}

	static error(message, opts = {}) {
		CommonLogger.#log('error', message, opts);
	}

	static debug(message, opts = {}) {
		CommonLogger.#log('debug', message, opts);
	}

	static warn(message, opts = {}) {
		CommonLogger.#log('warn', message, opts);
	}
}

module.exports = { RequestLogger, CommonLogger };
