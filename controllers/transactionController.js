const { ObjectId } = require('mongodb');
const Schema = require('../utils/schema');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');

const PROJECT = {
	$project: {
		_created_by: 0,
		_updated_by: 0
	}
};

const GROUP_BY = {
	$group: {
		_id: {
			type: "$type",
			category: "$category"
		},
		sub_categories: {
			$push: {
				_id: "$_id",
				sub_category: "$sub_category",
				_createdBy: "$_createdBy",
				_created_on: "$_created_on",
				_updated_by: "$_updatedBy",
				_updated_on: "$_updated_on",
				is_active: "$is_active"
			}
		}
	}
}

async function validateCategory(id, userId) {
	const count = await MongoDB.lookups.countDocuments({
		_id: new ObjectId(id),
		_created_by: new ObjectId(userId),
		is_active: true
	});
	if (count < 1) {
		throw new AppError("Invaild category id", 422, {count});
	}
}

module.exports.getAllTransactions = async (req, res) => {
	try {
		const filter = { is_active: req.query?.is_active != 0 };
		const size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		if (req.query?.search?.trim()) {
			filter.$or = [
				{ descript: { $regex: req.query.search.trim(), $options: 'i' } },
				{ email: { $regex: req.query.search.trim(), $options: 'i' } }
			];
		}
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await MongoDB.lookups.countDocuments(filter);
		const category = await MongoDB.lookups
			.aggregate([
				{ $match: filter },
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				{ $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } },
				PROJECT,
				{ $skip: skip },
				{ $limit: size }
			])
			.toArray();
		res.body = {
			success: true,
			pagination: {
				total,
				page,
				size,
				sortBy: sortDetails.sortBy,
				sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
			},
			data: category
		};
		res.status(200).json(res.body);
	} catch (err) {
		CommonLogger.error('Failed to fetch category', { error: err });
		res.status(500).json({ error: 'Failed to fetch category' });
	}
};

module.exports.getCategory = async (req, res) => {
	try {
		const filter = { _id: new ObjectId(req.params.id) }
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const category = (await MongoDB.lookups.aggregate([
				{ $match: filter },
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				PROJECT
			]).toArray()
		).at(0);
		if (!category) {
			throw new AppError('Category not found', 404);
		}
		res.status(200).json({ success: true, data: category });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch user', { error: err });
		res.status(500).json({ error: 'Failed to fetch category' });
	}
};

module.exports.createTransaction = async (req, res) => {
	try {
		const { errors, value } = await Schema.validateSchema(req.body, 'expense');
		if (errors?.length) {
			throw new AppError('Invalid Data', 422, { errors });
		}
		await validateCategory(req.body.category, req.user);
		const newTransaction = {
			date: req.body.date,
			category: new ObjectId(req.body.category),
			description: req.body.description,
			amount: req.body.amount,
			payment_mode: req.body.payment_mode,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user),
			is_active: true
		};
		const result = await MongoDB.transactions.insertOne(newTransaction);
		res.status(201).json({ success: true, data: { _id: result.insertedId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create transactions', { error: err });
		res.status(500).json({ error: 'Failed to create transactions' });
	}
};

module.exports.updateTransaction = async (req, res) => {
	try {
		const transactionsId = req.params.id;
		const { errors, value } = await Schema.validateSchema(req.body, 'expense');
		if (errors?.length) {
			throw new AppError('Invalid Data', 422, { errors });
		}
		await validateCategory(req.body.category, req.user);
		const updateData = {
			date: req.body.date,
			category: new ObjectId(req.body.category),
			description: req.body.description,
			amount: req.body.amount,
			payment_mode: req.body.payment_mode
		}
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const filter = { _id: new ObjectId(transactionsId), is_active: true };
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const result = await MongoDB.transactions.updateOne(
			filter,
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Transaction not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { _id: transactionsId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update transaction', { error: err });
		res.status(500).json({ error: 'Failed to update transaction' });
	}
};

module.exports.deleteTransaction = async (req, res) => {
	try {
		const transactionId = req.params.id;
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const filter = { _id: new ObjectId(transactionId), is_active: true };
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const result = await MongoDB.transactions.updateOne(
			filter,
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Transaction not found', 404);
		}
		res.status(204).json({ success: true, data: { _id: transactionId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete transaction', { error: err });
		res.status(500).json({ error: 'Failed to delete transaction' });
	}
};
