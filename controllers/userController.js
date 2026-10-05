const Joi = require('joi');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const { get_joi_errors } = require('../utils/glOperations');
const Constants = require('../utils/constants');
const { hashPasswordArgon2i, verifyPasswordArgon2i } = require('../utils/crypt');
const { ObjectId } = require('mongodb');

const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9 ]{2,59}$/;
const CREATE_USER_SCHEMA = Joi.object({
	name: Joi.string().pattern(NAME_REGEX).required(),
	email: Joi.string().email().required(),
	password: Joi.string().min(8).max(128).required()
});

const UPDATE_USER_SCHEMA = Joi.object({
	name: Joi.string().pattern(NAME_REGEX).optional(),
	email: Joi.string().email().optional()
}).or('name', 'email');

const UPDATE_USER_STATUS_SCHEMA = Joi.object({
	is_active: Joi.boolean().required()
})

const UPDATE_PASSWORD_SCHEMA = Joi.object({
	old_password: Joi.string().min(8).max(128).required(),
	new_password: Joi.string().min(8).max(128).required()
})

const PROJECT = {
	salt: 0,
	hash: 0,
	_created_by: 0,
	_updated_by: 0
};

module.exports.getAllUsers = async (req, res) => {
	try {
		const filter = { is_active: req.query?.is_active != 0 };
		const size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		if (req.query?.search?.trim()) {
			filter.$or = [
				{ name: { $regex: req.query.search.trim(), $options: 'i' } },
				{ email: { $regex: req.query.search.trim(), $options: 'i' } }
			];
		}
		if(req.query?.exclude_system) {
			filter._id = { $ne: CacheMechanism.get('systemUser')._id }
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await MongoDB.users.countDocuments(filter);
		const users = await MongoDB.users
			.find(filter, { projection: PROJECT })
			.sort({ [sortDetails.sortBy]: sortDetails.sortOrder })
			.skip(skip)
			.limit(size)
			.toArray();
		res.body = {
			pagination: {
				total,
				page,
				size,
				sortBy: sortDetails.sortBy,
				sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
			},
			data: users
		};
		res.status(200).json(res.body);
	} catch (err) {
		CommonLogger.error('Failed to fetch users', { error: err });
		res.status(500).json({ message: 'Failed to fetch users' });
	}
};

module.exports.getUser = async (req, res) => {
	try {
		const user = await MongoDB.users.findOne(
			{ _id: new ObjectId(req.params.id) },
			{ projection: PROJECT }
		);
		if (!user) {
			throw new AppError('User not found', 404);
		}
		res.status(200).json(user);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch user', { error: err });
		res.status(500).json({ message: 'Failed to fetch user' });
	}
};

module.exports.createUser = async (req, res) => {
	try {
		let { error } = CREATE_USER_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		const { name, email, password } = req.body;
		delete req.body.password;
		if ( error ) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422, { error });
		}
		const existingUser = await MongoDB.users.findOne({ email });
		if (existingUser) {
			throw new AppError('Email already in use', 409);
		}
		const { salt, hash } = await hashPasswordArgon2i(password);
		const newUser = {
			name,
			email,
			salt,
			hash,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user),
			is_active: true
		};
		const result = await MongoDB.users.insertOne(newUser);
		if (!result.insertedId) {
			throw new AppError('Failed to create user', 500);
		}
		res.status(201).json({ _id: result.insertedId });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message : err.message, ...err.params });
		}
		CommonLogger.error('Failed to create user', { error: err });
		res.status(500).json({ message: 'Failed to create user' });
	}
};

module.exports.updateUser = async (req, res) => {
	try {
		const userId = req.params.id;
		let { error } = UPDATE_USER_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if (error) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422, { error });
		}
		const existingUser = await MongoDB.users.findOne({ email: req.body.email, _id: { $ne: new ObjectId(userId) } });
		if (existingUser) {
			throw new AppError('Email already in use', 409);
		}
		const updateData = {...req.body};
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const result = await MongoDB.users.updateOne(
			{ _id: new ObjectId(userId) },
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('User not found or no changes made', 404);
		}
		res.status(200).json({ _id: userId });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update user', { error: err });
		res.status(500).json({ message: 'Failed to update user' });
	}
};

module.exports.deleteUser = async (req, res) => {
	try {
		const userId = req.params.id;
		const system = CacheMechanism.get('systemUser');
		if (userId === system._id.toString()) {
			throw new AppError('Cannot delete user', 403);
		}
		const user = await MongoDB.users.findOne({ _id: new ObjectId(userId), is_active: true });
		if (!user) {
			throw new AppError('User not found', 404);
		}
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.users.updateOne(
			{ _id: new ObjectId(userId), is_active: true },
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('User not deleted', 404);
		}
		res.sendStatus(204);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete user', { error: err });
		res.status(500).json({ message: 'Failed to delete user' });
	}
};

module.exports.updateUserStatus = async (req, res) => {
	try {
		const system = CacheMechanism.get('systemUser');
		const userId = req.params.id;
		let { error } = UPDATE_USER_STATUS_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if (error) {
			error = get_joi_errors(error)
			throw new AppError('Invalid Data', 400, { error });
		}
		const user = await MongoDB.users.findOne({ _id: new ObjectId(userId) });
		if (!user) {
			throw new AppError('User not found', 404);
		} else if (user.email === system.email) {
			throw new AppError('Cannot change status of system user', 403);
		}
		const { is_active } = req.body;
		const updateData = {
			is_active,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.users.updateOne({ _id: new ObjectId(userId) }, { $set: updateData });
		if (result.modifiedCount === 0) {
			throw new AppError('User not found or no changes made', 404);
		}
		if (!is_active) {
			MongoDB.sessions.deleteMany({ userId: new ObjectId(userId) });
		}
		res.status(200).json({ _id: userId, is_active });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update user status', { error: err });
		res.status(500).json({ message: 'Failed to update user status' });
	}
};

module.exports.change_password = async (req, res) => {
	try {
		let { error } = UPDATE_PASSWORD_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if (error) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422);
		}
		const user = await MongoDB.users.findOne({ _id: new ObjectId(req.user) });
		if (!user) {
			throw new AppError('User not found', 404);
		}
		const VERIIFICAION = await verifyPasswordArgon2i(req.body.old_password, user.salt, user.hash);
		if (!VERIIFICAION) {
			throw new AppError('Invalid old password', 401);
		}
		const { hash, salt } = await hashPasswordArgon2i(req.body.new_password);
		const result = await MongoDB.users.updateOne({ _id: new ObjectId(req.user) }, { $set: { hash, salt } });
		if (result.modifiedCount === 0) {
			throw new AppError('User not found or no changes made', 404);
		}
		res.status(200).json({ message: 'Password changed successfully' });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to change password', { error: err });
		res.status(500).json({ message: 'Failed to change password' });
	}
};
