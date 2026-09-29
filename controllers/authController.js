const Joi = require('joi');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const Constants = require('../utils/constants');
const { verifyPasswordArgon2i, generateJWT, verifyJWT, getJWTPayload } = require('../utils/crypt');
const { ObjectId } = require('mongodb');
const { get_validity, get_joi_errors } = require('../utils/glOperations');

const SIGN_IN_SCHEMA = Joi.object({
	email: Joi.string().required(),
	password: Joi.string().required()
})

module.exports.sign_in = async (req, res) => {
	try {
		let { error } = SIGN_IN_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION)
		if( error ) {
			error = get_joi_errors(error)
			throw new AppError('Invalid Data', 422, { error });
		}
		const { email, password } = req.body;
		delete req.body.password;
		const user = await MongoDB.users.findOne({ email, is_active: true });
		if (!user) {
			throw new AppError('Invalid Email', 401);
		}
		const isPasswordValid = await verifyPasswordArgon2i(password, user.salt, user.hash);
		if (!isPasswordValid) {
			throw new AppError('Invalid Password', 401);
		}
		const access_token = generateJWT({ userId: user._id.toString() }, Constants.TOKEN_EXPIRY);
		const { _created_on, _expire_on } = get_validity(Constants.SESSION_EXPIRY);
		const session = await MongoDB.sessions.insertOne({ userId: user._id, access_token, _created_on, _expire_on });
		const isSystem = CacheMechanism.get('systemUser')._id.toString() === user._id.toString();
		res.status(200).json({
			success: true,
			sessionId: session.insertedId,
			userId: user._id,
			user_name: user.name,
			isSystem,
			access_token,
			_expire_on
		});
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		res.status(500).json({ message: 'Failed to Sign In to the application' });
	}
};

module.exports.verifyUser = async (req, res, next) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 400);
		}
		if (!sessionId) {
			throw new AppError('Session ID is required', 400);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : '';
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await MongoDB.sessions.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 400);
		}
		if (new Date(session._expire_on) <= new Date(req.requestTime)) {
			throw new AppError('Session expired', 401);
		}
		if (status.is_token_expired) {
			throw new AppError('Access token expired', 401, { is_token_expired: true });
		}
		req.user = getJWTPayload(token)?.userId;
		req.isSystem = CacheMechanism.get('systemUser')._id.toString() === req.user;
		next();
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to verify user', { error: err });
		res.status(500).json({ message: 'Failed to verify user' });
	}
};

module.exports.is_system = async (req, res, next) => {
	try {
		if (!req.isSystem) {
			throw new AppError("Unauthorised User", 401);
		}
		next();
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to verify System user', { error: err });
		res.status(500).json({ message: 'Failed to verify System user' });
	}
}

module.exports.refresh_token = async (req, res) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 400);
		}
		if (!sessionId) {
			throw new AppError('Session ID is required', 400);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : '';
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await MongoDB.sessions.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 400);
		}
		if (new Date(session._expire_on) <= new Date(req.requestTime)) {
			throw new AppError('Session expired', 401);
		}
		if (status.is_token_expired) {
			req.user = getJWTPayload(token)?.userId;
			const user = await MongoDB.users.findOne({ _id: new ObjectId(req.user), is_active: true });
			if (!user) {
				throw new AppError('Invalid user token', 401);
			}
			const access_token = generateJWT({ userId: req.user }, Constants.TOKEN_EXPIRY);
			MongoDB.sessions.updateOne({ _id: new ObjectId(sessionId) }, { $set: { access_token } });
			return res.status(200).json({ access_token });
		}
		throw new AppError('Access token not expired yet', 422);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to generate token', { error: err });
		res.status(500).json({ message: 'Failed to generate token' });
	}
};

module.exports.sign_out = async (req, res) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 400);
		}
		if (!sessionId) {
			throw new AppError('Session ID is required', 400);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : '';
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 400);
		}
		const session = await MongoDB.sessions.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 401);
		}
		await MongoDB.sessions.deleteOne({ _id: new ObjectId(req.sessionId) });
		res.status(200).json({ message: 'Signed out successfully' });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to sign out', { error: err });
		res.status(500).json({ message: 'Failed to sign out' });
	}
};

module.exports.clear_sessions = async (req, res) => {
	try {
		const sessions = await MongoDB.sessions.countDocuments({ _expire_on: { $lte: req.requestTime } });
		if (sessions === 0) {
			res.status(200).json({ message: 'Expired sessions are already cleared' });
			return;
		}
		const result = await MongoDB.sessions.deleteMany({ _expire_on: { $lte: req.requestTime } });
		if (!result.deletedCount && result.deletedCount === 0) {
			throw new AppError('Error in deleting', 404);
		}
		res.status(200).json({ message: `Cleared ${result.deletedCount} expired sessions` });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to clear sessions', { error: err });
		res.status(500).json({ message: 'Failed to clear sessions' });
	}
};
