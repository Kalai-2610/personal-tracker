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

module.exports.getAllCategory = async (req, res) => {
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
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await MongoDB.category.countDocuments(filter);
		const category = await MongoDB.category
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

module.exports.getConsolidatedCategory = async (req, res) => {
	try {
		const filter = { is_active: req.query?.is_active != 0 };
		if (req.query?.search?.trim()) {
			filter.$or = [
				{ name: { $regex: req.query.search.trim(), $options: 'i' } },
				{ email: { $regex: req.query.search.trim(), $options: 'i' } }
			];
		}
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

		const total = await MongoDB.category.countDocuments(filter);
		const category = await MongoDB.category
			.aggregate([
				{ $match: filter },
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				{ $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } },
				PROJECT,
				GROUP_BY,
				{ $set: { type: "$_id.type", category: "$_id.category" } },
				{ $project: { _id: 0 }} 
			]).toArray();
		res.body = {
			success: true,
			pagination: {
				total,
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
		const category = (await MongoDB.category.aggregate([
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

module.exports.createCategory = async (req, res) => {
	try {
		const { errors, value } = await Schema.validateSchema(req.body, 'category');
		if (errors?.length) {
			throw new AppError('Invalid Data', 422, { errors });
		}
		const filter = { type: req.body.type, category: req.body.category, sub_category: req.body.sub_category }
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const existingCategory = await MongoDB.users.findOne(filter);
		if (existingCategory) {
			throw new AppError('Category already in use', 409);
		}
		const newCategory = {
			type: req.body.type,
			category: req.body.category,
			sub_category: req.body.sub_category,
			is_active: true,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.category.insertOne(newCategory);
		res.status(201).json({ success: true, data: { _id: result.insertedId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create category', { error: err });
		res.status(500).json({ error: 'Failed to create category' });
	}
};

module.exports.updateCategory = async (req, res) => {
	try {
		const categoryId = req.params.id;
		const { type, category, sub_category } = req.body;
		const { errors, value } = await Schema.validateSchema(req.body, 'category');
		if (errors?.length) {
			throw new AppError('Invalid Data', 422, { errors });
		}
		const updateData = { type, category, sub_category }
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const filter = { _id: new ObjectId(categoryId), is_active: true };
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const result = await MongoDB.category.updateOne(
			filter,
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Category not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { _id: categoryId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update category', { error: err });
		res.status(500).json({ error: 'Failed to update category' });
	}
};

module.exports.deleteCategory = async (req, res) => {
	try {
		const categoryId = req.params.id;
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const filter = { _id: new ObjectId(categoryId), is_active: true };
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const result = await MongoDB.category.updateOne(
			filter,
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Category not found', 404);
		}
		res.status(204).json({ success: true, data: { _id: categoryId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete category', { error: err });
		res.status(500).json({ error: 'Failed to delete category' });
	}
};
