const Joi = require('joi');
const { ObjectId } = require('mongodb');
const Schema = require('../utils/schema');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const Constants = require('../utils/constants');
const { get_joi_errors } = require('../utils/glOperations');

const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_ \[\]-]{0,254}$/;
const LOOKUP_TYPES = ['account', 'type', 'category', 'sub_category', 'payment_mode'];
const CREATE_LOOKUP_SCHEMA = Joi.object({
	type: Joi.string().valid(...LOOKUP_TYPES).required(),
	name: Joi.string().pattern(NAME_REGEX).required().when('type', {
		is: 'type',
		then: Joi.valid('Expense', 'Income')
	}),
	parent_id: Joi.string().pattern(Constants.MONGO_ID_REGEX).when('type', {
		is: Joi.valid('category','sub_category'),
		then: Joi.required(),
		otherwise: Joi.forbidden()
	}),
});

const UPDATE_LOOKUP_SCHEMA = Joi.object({
	name: Joi.string().pattern(NAME_REGEX).optional(),
	parent_id: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional(),
}).or('name', 'parent_id');

const PROJECT = {
	_created_by: 0,
	_updated_by: 0
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
};

function checkLookUpType (types) {
	types = Array.isArray(types) ? types : [types];
	for(const type of types) {
		if(!LOOKUP_TYPES.includes(type)) {
			throw new AppError(`Invalid lookup type - ${type}`, 422);
		}
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
		if (req.query["type[]"]) {
			checkLookUpType(req.query["type[]"]);
			filter.type = Array.isArray(req.query["type[]"]) ? { $in: req.query["type[]"] } : req.query["type[]"];
		}
		if (req.query.parent_id) {
			if (!Constants.MONGO_ID_REGEX.test(req.query.parent_id)) {
				throw new AppError('Invalid parent_id', 422);
			}
			filter.parent_id = new ObjectId(req.query.parent_id);
		}
		filter._created_by = new ObjectId(req.user);
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
		const skip = (page - 1) * size;

		const total = await MongoDB.lookups.countDocuments(filter);
		const lookUps = await MongoDB.lookups
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
			data: lookUps
		};
		res.status(200).json(res.body);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch LookUps', { error: err });
		res.status(500).json({ message: 'Failed to fetch LookUps' });
	}
};

module.exports.getLookup = async (req, res) => {
	try {
		if(!Constants.MONGO_ID_REGEX.test(req.params.id)) {
			throw new AppError('Invalid LookUp ID', 422);
		}
		const lookUp = await MongoDB.lookups.findOne(
			{ _id: new ObjectId(req.params.id), _created_by: new ObjectId(req.user) },
			{ projection: PROJECT }
		);
		if (!lookUp) {
			throw new AppError('LookUp not found', 404);
		}
		res.status(200).json(lookUp);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch LookUp', { error: err });
		res.status(500).json({ message: 'Failed to fetch LookUp' });
	}
};

module.exports.createLookUp = async (req, res) => {
	try {
		let { error } = CREATE_LOOKUP_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if (error) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422, { error });
		}
		const filter = {
			...req.body,
			_created_by: new ObjectId(req.user),
			is_active: true
		}
		if(filter.parent_id) {
			await checkParentId(filter.type, filter.parent_id);
			filter.parent_id = new ObjectId(filter.parent_id);
		} else {
			delete filter.parent_id;
		}
		const existingLookUp = await MongoDB.lookups.findOne(filter);
		if (existingLookUp) {
			throw new AppError('LookUp already in use', 409);
		}
		const newLookUp = {
			...filter,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user),
			is_active: true
		};
		const result = await MongoDB.lookups.insertOne(newLookUp);
		if (!result.insertedId) {
			throw new AppError('Failed to create LookUp', 500);
		}
		res.status(201).json({ _id: result.insertedId });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create LookUp', { error: err });
		res.status(500).json({ message: 'Failed to create LookUp' });
	}
};

module.exports.updateLoopUp = async (req, res) => {
	try {
		const lookUpId = req.params.id;
		if (!Constants.MONGO_ID_REGEX.test(lookUpId)) {
			throw new AppError('Invalid LookUp ID', 422);
		}
		let error = UPDATE_LOOKUP_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION).error;
		if (error) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422, { error });
		}
		const filter = { ...req.body, _id: { $ne:  new ObjectId(lookUpId) }, _created_by: new ObjectId(req.user) };
		const LOOK_UP = await MongoDB.lookups.findOne({ _id: new ObjectId(lookUpId) });
		if (!LOOK_UP) {
			throw new AppError('LookUp not found', 404);
		}
		if ( LOOK_UP.type === 'category' || LOOK_UP.type === 'sub_category') {
			if (filter.parent_id) {
				await checkParentId(LOOK_UP.type, filter.parent_id);
				filter.parent_id = new ObjectId(filter.parent_id);
			} else {
				throw new AppError('parent_id is required for category and sub_category types', 422);
			}
		}
		const updateData = { ...filter };
		delete updateData._id;
		delete updateData._created_by;
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		filter.type = LOOK_UP.type;
		const existingLookUp = await MongoDB.lookups.findOne(filter);
		if (existingLookUp) {
			throw new AppError('LookUp already in use', 409);
		}
		const result = await MongoDB.lookups.updateOne(
			{ _id: new ObjectId(lookUpId) },
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('LookUp not found or no changes made', 404);
		}
		res.status(200).json({ _id: lookUpId });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update LookUp', { error: err });
		res.status(500).json({ message: 'Failed to update LookUp' });
	}
};

module.exports.deleteLoopUp = async (req, res) => {
	try {
		const lookupId = req.params.id;
		if (!Constants.MONGO_ID_REGEX.test(lookupId)) {
			throw new AppError('Invalid LookUp ID', 422);
		}
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const filter = { _id: new ObjectId(lookupId), is_active: true, _created_by: new ObjectId(req.user) };
		const LOOK_UP = await MongoDB.lookups.findOne(filter);
		if (!LOOK_UP) {
			throw new AppError('LookUp not found', 404);
		}
		const delete_ids = [ filter._id ];
		delete_ids.push(LOOK_UP._id);
		if(LOOK_UP.type === 'type') {
			const categories = await MongoDB.lookups.find({ type: 'category', parent_id: LOOK_UP._id, is_active: true }).toArray();
			for(const category of categories) {
				delete_ids.push(category._id);
			}
			const sub_categories = await MongoDB.lookups.find({ type: 'sub_category', parent_id: { $in: delete_ids }, is_active: true }).toArray();
			for(const sub_category of sub_categories) {
				delete_ids.push(sub_category._id);
			}
		} else if(LOOK_UP.type === 'category') {
			const sub_categories = await MongoDB.lookups.find({ type: 'sub_category', parent_id: LOOK_UP._id, is_active: true }).toArray();
			for(const sub_category of sub_categories) {
				delete_ids.push(sub_category._id);
			}
		}
		const result = await MongoDB.lookups.updateMany(
			{ _id: { $in: delete_ids }, is_active: true },
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('LookUp not found', 404);
		}
		res.sendStatus(204);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete LookUp', { error: err });
		res.status(500).json({ message: 'Failed to delete LookUp' });
	}
};
