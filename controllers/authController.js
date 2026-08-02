const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const { hashPasswordArgon2i, verifyPasswordArgon2i, generateJWT, verifyJWT, getJWTPayload } = require('../utils/crypt');
const { ObjectId } = require('mongodb');
const { get_validity } = require('../utils/glOperations');

module.exports.sign_in = async (req, res) => {
	try {
		const { email, password } = req.body;
		delete req.body.password;
		if (!email || !password) {
			throw new AppError('Email and password are required', 400);
		}
		const user = await MongoDB.users.findOne({ email, is_active: true });
		if (!user) {
			throw new AppError('Invalid email or password', 400);
		}
		const isPasswordValid = await verifyPasswordArgon2i(password, user.salt, user.hash);
		if (!isPasswordValid) {
			throw new AppError('Invalid email or password', 401);
		}
		const access_token = generateJWT({ userId: user._id.toString() }, '10m');
		const { _created_on, _expire_on } = get_validity(60);
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
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		res.status(500).json({ error: 'Failed to fetch user' });
	}
};

module.exports.verifyUser = async (req, res, next) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 401);
		} else if (!sessionId) {
			throw new AppError('Session ID is required', 401);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : '';
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await MongoDB.sessions.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 401);
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
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to verify user', { error: err });
		res.status(500).json({ error: 'Failed to verify user' });
	}
};

module.exports.refresh_token = async (req, res) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 401);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : '';
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await MongoDB.sessions.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 401);
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
			const access_token = generateJWT({ userId: user._id.toString() }, '10m');
			MongoDB.sessions.updateOne({ _id: new ObjectId(sessionId) }, { $set: { access_token } });
			return res.status(200).json({ success: true, access_token });
		}
		throw new AppError('Access token not expired yet', 400);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to verify user', { error: err });
		res.status(500).json({ error: 'Failed to verify user' });
	}
};

module.exports.sign_out = async (req, res) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 401);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : '';
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await MongoDB.sessions.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 401);
		}
		await MongoDB.sessions.deleteOne({ _id: new ObjectId(req.sessionId) });
		res.status(200).json({ success: true, message: 'Signed out successfully' });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to sign out', { error: err });
		res.status(500).json({ error: 'Failed to sign out' });
	}
};

module.exports.clear_sessions = async (req, res) => {
	try {
		if (!req.isSystem) {
			throw new AppError('Unauthorized to clear sessions', 403);
		}
		const sessions = await MongoDB.sessions.find({ _expire_on: { $lte: req.requestTime } }).toArray();
		if (sessions.length === 0) {
			res.status(200).json({ success: true, message: 'Expired sessions are already cleared' });
			return;
		}
		const result = await MongoDB.sessions.deleteMany({ _expire_on: { $lte: req.requestTime } });
		if (!result.deletedCount && result.deletedCount === 0) {
			throw new AppError('Error in deleting', 404);
		}
		res.status(200).json({ success: true, message: `Cleared ${result.deletedCount} expired sessions` });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to clear sessions', { error: err });
		res.status(500).json({ error: 'Failed to clear sessions' });
	}
};

module.exports.updateUserStatus = async (req, res) => {
	// Implementation for activating/deactivating a user
	try {
		const system = CacheMechanism.get('systemUser');
		if (!req.isSystem) {
			throw new AppError('Unauthorized to change user status', 403);
		}
		const { _id, is_active } = req.body;
		if (typeof is_active !== 'boolean') {
			throw new AppError('is_active must be a boolean', 400);
		}
		const user = await MongoDB.users.findOne({ _id: new ObjectId(_id) });
		if (!user) {
			throw new AppError('User not found', 404);
		} else if (user.email === system.email) {
			throw new AppError('Cannot change status of system user', 403);
		}
		const result = await MongoDB.users.updateOne({ _id: new ObjectId(_id) }, { $set: { is_active } });
		if (result.modifiedCount === 0) {
			throw new AppError('User not found or no changes made', 404);
		}
		if (!is_active) {
			MongoDB.sessions.deleteMany({ userId: new ObjectId(_id) });
		}
		res.status(200).json({ success: true, data: { _id, is_active } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update user status', { error: err });
		res.status(500).json({ error: 'Failed to update user status' });
	}
};

module.exports.change_password = async (req, res) => {
	// Implementation for resetting user password
	try {
		const { new_password, old_password } = req.body;
		if (!new_password || !old_password) {
			throw new AppError('New password and old_password are required', 400);
		}
		const user = await MongoDB.users.findOne({ _id: new ObjectId(req.userId) });
		if (!user) {
			throw new AppError('User not found', 404);
		}
		const VERIIFICAION = await verifyPasswordArgon2i(old_password, user.salt, user.hash);
		if (!VERIIFICAION) {
			throw new AppError('Invalid old password', 401);
		}
		const { hash, salt } = await hashPasswordArgon2i(new_password);
		const result = await MongoDB.users.updateOne({ _id: new ObjectId(_id) }, { $set: { hash, salt } });
		if (result.modifiedCount === 0) {
			throw new AppError('User not found or no changes made', 404);
		}
		res.status(200).json({ success: true, message: 'Password changed successfully' });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to change password', { error: err });
		res.status(500).json({ error: 'Failed to change password' });
	}
};
