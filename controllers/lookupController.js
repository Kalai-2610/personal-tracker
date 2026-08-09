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

async function checkParentId(type, parent_id) {
	const filter_type = {
		category: 'type',
		sub_category: 'category'
	}
	const COUNT = await MongoDB.lookups.countDocuments({ _id: new ObjectId(parent_id), type: filter_type[type], is_active: true })
	if (COUNT === 0) {
		throw new AppError(`Invalid parent_id for type ${type}`, 422);
	}
}

module.exports.getAllLookup = async (req, res) => {
	try {
		const filter = { is_active: req.query?.is_active != 0 };
		const size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		if (req.query?.search?.trim()) {
			filter.name = { $regex: req.query.search.trim(), $options: 'i' };
		}
		if (req.query["type[]"] && Schema.checkLookUpType(req.query["type[]"])) {
			filter.type = { $in: req.query["type[]"] };
		}
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await MongoDB.lookups.countDocuments(filter);
		const lookUps = await MongoDB.lookups
			.aggregate([
				{ $match: filter },
				{ $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } },
				{ $skip: skip },
				{ $limit: size },
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				PROJECT
			]).toArray();
		res.body = {
			success: true,
			pagination: {
				total,
				page,
				size,
				sortBy: sortDetails.sortBy,
				sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
			},
			data: lookUps
		};
		res.status(200).json(res.body);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch LookUps', { error: err });
		res.status(500).json({ error: 'Failed to fetch LookUps' });
	}
};

module.exports.getLookup = async (req, res) => {
	try {
		const filter = { _id: new ObjectId(req.params.id) }
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const lookUp = (await MongoDB.lookups.aggregate([
				{ $match: filter },
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				PROJECT
			]).toArray()
		).at(0);
		if (!lookUp) {
			throw new AppError('LookUp not found', 404);
		}
		res.status(200).json({ success: true, data: lookUp });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch LookUp', { error: err });
		res.status(500).json({ error: 'Failed to fetch LookUp' });
	}
};

module.exports.createLookUp = async (req, res) => {
	try {
		const { errors, value } = await Schema.validateSchema(req.body, 'lookup');
		if (errors?.length) {
			throw new AppError('Invalid Data', 422, { errors });
		}
		const filter = { type: req.body.type, name: req.body.name, parent_id: req.body.parent_id, is_active: true }
		if(filter.parent_id) {
			await checkParentId(req.body.type, req.body.parent_id);
		} else {
			delete filter.parent_id;
		}
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const existingLookUp = await MongoDB.lookups.findOne(filter);
		if (existingLookUp) {
			throw new AppError('LookUp already in use', 409);
		}
		const newLookUp = {
			type: req.body.type,
			name: req.body.name,
			is_active: true,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.lookups.insertOne(newLookUp);
		res.status(201).json({ success: true, data: { _id: result.insertedId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create LookUp', { error: err });
		res.status(500).json({ error: 'Failed to create LookUp' });
	}
};

module.exports.updateLoopUp = async (req, res) => {
	try {
		const lookUpId = req.params.id;
		const { type, name, parent_id } = req.body;
		const { errors, value } = await Schema.validateSchema(req.body, 'lookup');
		if (errors?.length) {
			throw new AppError('Invalid Data', 422, { errors });
		}
		const updateData = { type, name, parent_id }
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const filter = { type, name, parent_id, is_active: true, _id: { $ne:  new ObjectId(lookUpId) } };
		if(filter.parent_id) {
			await checkParentId(type, parent_id);
		} else {

			delete filter.parent_id;
		}
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const existingLookUp = await MongoDB.lookups.findOne(filter);
		if (existingLookUp) {
			throw new AppError('LookUp already in use', 409);
		}
		filter._id = filter._id.$ne;
		delete filter.name;
		delete filter.type;
		delete filter.parent_id;
		const result = await MongoDB.lookups.updateOne(
			filter,
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('LookUp not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { _id: lookUpId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update LookUp', { error: err });
		res.status(500).json({ error: 'Failed to update LookUp' });
	}
};

module.exports.deleteLoopUp = async (req, res) => {
	try {
		const lookupId = req.params.id;
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const filter = { _id: new ObjectId(lookupId), is_active: true };
		if(!req.isSystem) {
			filter._created_by = new ObjectId(req.user);
		}
		const result = await MongoDB.lookups.updateOne(
			filter,
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('LookUp not found', 404);
		}
		res.status(204).json({ success: true, data: { _id: lookupId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete LookUp', { error: err });
		res.status(500).json({ error: 'Failed to delete LookUp' });
	}
};
