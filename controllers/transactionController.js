const Joi = require('joi');
const { ObjectId } = require('mongodb');
const Schema = require('../utils/schema');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const { CommonLogger } = require('../utils/logger');
const Constants = require('../utils/constants');
const { get_joi_errors } = require('../utils/glOperations');


const DESCRIPTION_REGEX = /^[a-zA-Z][a-zA-Z0-9_ \[\]-]{0,254}$/;
const TRANSACTION_SCHEMA = Joi.object({
	date: Joi.string().isoDate().max(10).required().custom((value, helpers) => {
		const parsedDate = new Date(value);
		if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
			return helpers.message({ custom: 'Enter a valid calendar date.' });
		}
		return value; // Valid date string passes successfully
	}),
	description: Joi.string().pattern(DESCRIPTION_REGEX).required(),
	amount: Joi.number().positive().precision(2).required(),
	account: Joi.string().pattern(Constants.MONGO_ID_REGEX).required(),
	type: Joi.string().pattern(Constants.MONGO_ID_REGEX).required(),
	category: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional(),
	sub_category: Joi.string().pattern(Constants.MONGO_ID_REGEX).when('category', {
		is: Joi.exist(),
		then: Joi.optional(),
		otherwise: Joi.forbidden()
	}),
	payment_mode: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional()
});

const TRANSACTION_QUERY_SCHEMA = Joi.object({
	page: Joi.number().integer().min(1).optional(),
	size: Joi.number().integer().min(1).optional(),
	search: Joi.string().trim().optional(),
	is_active: Joi.number().valid(0, 1).optional(),
	sortBy: Joi.string().valid('date', 'description', 'amount', '_created_on', '_updated_on').optional(),
	sortOrder: Joi.string().valid('asc', 'desc').optional(),
	account: Joi.array().items(Joi.string().pattern(Constants.MONGO_ID_REGEX)).min(1).optional(),
	type: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional(),
	category: Joi.array().items(Joi.string().pattern(Constants.MONGO_ID_REGEX)).min(1).optional(),
	payment_mode: Joi.array().items(Joi.string().pattern(Constants.MONGO_ID_REGEX)).min(1).optional()
});

const JOIN_QUERY = [
	// 1. Join 'account' from lookups collection
	{ $lookup: { from: 'lookups', localField: 'account', foreignField: '_id', as: 'account_info' } },

	// 2. Join 'type' from lookups collection
	{ $lookup: { from: 'lookups', localField: 'type', foreignField: '_id', as: 'type_info' } },

	// 3. Join 'category' from lookups collection (Handles optional fields automatically)
	{ $lookup: { from: 'lookups', localField: 'category', foreignField: '_id', as: 'category_info' } },

	// 4. Join 'sub_category' from lookups collection (Handles optional fields automatically)
	{ $lookup: { from: 'lookups', localField: 'sub_category', foreignField: '_id', as: 'sub_category_info' } },

	// 5. Join 'payment_mode' from lookups collection
	{ $lookup: { from: 'lookups', localField: 'payment_mode', foreignField: '_id', as: 'payment_mode_info' } },

	// 6. Flatten arrays and extract only the 'name' field string
	{
		$project: {
			_id: 1,
			date: 1,
			description: 1,
			amount: 1,
			// Extracts the first element's 'name' property. If it doesn't exist, returns null.
			account: { $first: '$account_info.name' },
			type: { $first: '$type_info.name' },
			category: { $first: '$category_info.name' },
			sub_category: { $first: '$sub_category_info.name' },
			payment_mode: { $first: '$payment_mode_info.name' },
			_created_on: 1,
			_updated_on: 1,
			is_active: 1,
		}
	}
];

const generateSummaryGroup = (group_by) => {
    const group = { _id: {} };
    const date = { $toDate: '$date' };
    switch (group_by) {
        case 'year':
            group._id.year = { $year: date };
            break;
        case 'year_type':
            group._id.year = { $year: date };
            group._id.type = '$type';
            break;
        case 'month':
            group._id.year = { $year: date };
            group._id.month = { $month: date };
            break;
        case 'month_type':
            group._id.year = { $year: date };
            group._id.month = { $month: date };
            group._id.type = '$type';
            break;
        case 'type':
            group._id.type = '$type';
            break;
		case 'type_account':
			group._id.type = '$type';
			group._id.account = '$account';
			break;
        case 'type_payment_mode':
            group._id.type = '$type';
            group._id.payment_mode = '$payment_mode';
            break;
        case 'category':
            group._id.category = '$category';
            break;
        case 'sub_category':
            group._id.sub_category = '$sub_category';
            break;
        case 'payment_mode':
            group._id.payment_mode = '$payment_mode';
            break;
        default: throw new AppError('Invalid groupBy', 422, { groupBy: group_by });
    }
    group.total_amount = { $sum: '$amount' };
    group.count = { $sum: 1 };
    return { $group: group };
};

const generateSummaryDateFilter = ({ group_by, year, month, start_date, end_date }) => {
	const filter = { date: {} };

    if (!year) { return {}; }
    let startDate;
    let endDate;
    switch (group_by) {
        case 'year':
        case 'year_type':
            startDate = new Date(Date.UTC(year, 0, 1));
            endDate = new Date(Date.UTC(year + 1, 0, 1));
            break;
        case 'month':
        case 'month_type':
        case 'type':
        case 'type_payment_mode':
        case 'category':
        case 'sub_category':
        case 'payment_mode':
            startDate = new Date(Date.UTC(year, month - 1, 1));
            endDate = new Date(Date.UTC(year, month, 1));
            break;
        default:
            return {};
    }

	if (start_date &&start_date > startDate.toISOString().slice(0, 10)) {
		filter.date.$gte = start_date + "T00:00:00.000Z";
	} else {
		filter.date.$gte = startDate.toISOString();
	}

	if (end_date && end_date < endDate.toISOString().slice(0, 10)) {
		filter.date.$lte = end_date + "T23:59:59.999Z";
	} else {
		filter.date.$lt = endDate.toISOString();
	}
    return filter;
};

const GROUP_SCHEMA = Joi.object({
	group_by: Joi.string().valid(
		// 'year_month',
		// 'year_account_type',
		// 'month_type_account',
		'year',
		'year_type',
		'month',
		'month_type',
		'type',
		'type_account',
		'type_payment_mode',
		'category',
		'sub_category',
		'payment_mode'
	).required(),
	account: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional(),
	type: Joi.string().pattern(Constants.MONGO_ID_REGEX).when('group_by', {
		is: Joi.string().valid('category', 'payment_mode'),
		then: Joi.required(),
		otherwise: Joi.optional()
	}),
	category: Joi.string().pattern(Constants.MONGO_ID_REGEX).when('group_by', {
		is: Joi.string().valid('sub_category'),
		then: Joi.required(),
		otherwise: Joi.optional()
	}),
	sub_category: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional(),
	payment_mode: Joi.string().pattern(Constants.MONGO_ID_REGEX).optional(),
	year: Joi.number().integer().min(1900).max(2100).when('group_by', {
		is: Joi.string().valid('month', 'month_type', 'type', 'type_payment_mode', 'category', 'sub_category', 'payment_mode'),
		then: Joi.required(),
		otherwise: Joi.optional()
	}),
	month: Joi.number().integer().min(1).max(12).when('group_by', {
		is: Joi.string().valid('type', 'type_payment_mode', 'category', 'sub_category', 'payment_mode'),
		then: Joi.required(),
		otherwise: Joi.optional()
	}),
	start_date: Joi.string().isoDate().max(10).optional().custom((value, helpers) => {
		const parsedDate = new Date(value);
		if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
			return helpers.message({ custom: 'Enter a valid calendar date.' });
		}
		return value; // Valid date string passes successfully
	}),
	end_date:  Joi.string().isoDate().max(10).optional().custom((value, helpers) => {
		const parsedDate = new Date(value);
		if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
			return helpers.message({ custom: 'Enter a valid calendar date.' });
		}
		return value; // Valid date string passes successfully
	})
});

/**
 * Function to validate the category id
 * @param {String} ids 
 * @param {String} userId
 * @param {"type"|"category"|"sub_category"|"account"|"payment_mode"} type
 * @returns {Promise<void>}
 */
async function validateID(ids, userId, type, is_multiple = false) {
	if(!ids) { return; }
	const PROCESSED_IDS = Array.isArray(ids) ? ids : [ids];
	const filter = { _id: {}, type, _created_by: new ObjectId(userId), is_active: true};
	filter.type || delete filter.type;
	filter._id.$in = PROCESSED_IDS.map(id => new ObjectId(id));
	let data = await MongoDB.lookups.find(filter).toArray();
	data = data.map(d => d._id.toString());
	if (data.length != PROCESSED_IDS.length) {
		const err_id = PROCESSED_IDS.map((id, index) => Object.assign({}, { id, index })).filter(d => !data.includes(d.id));
		let error;
		if(is_multiple){
			error = err_id.map(id => Object.assign({message: `"${type}.${id.index}" is not found`, type: "any.invalid"}))
		} else {
			error = err_id.map(id => Object.assign({message: `"${type}" is not found`, type: "any.invalid"}))
		}
		throw new AppError("Invalid id", 422, { error });
	}
}

module.exports.getAllTransactions = async (req, res) => {
	try {
		let { error } = TRANSACTION_QUERY_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if( error ) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422, { error });
		}
		await Promise.all([
			validateID(req.body.account, req.user, 'account', true),
			validateID(req.body.type, req.user, 'type'),
			validateID(req.body.category, req.user, 'category', true),
			validateID(req.body.payment_mode, req.user, 'payment_mode', true)
		]);
		const filter = { is_active: req.body?.is_active != 0, _created_by: new ObjectId(req.user) };
		const size = Number.parseInt(req.body.size) || 10;
		const page = Number.parseInt(req.body.page) || 1;
		if (req.body?.search?.trim()) {
			filter.$or = [
				{ description: { $regex: req.body.search.trim(), $options: 'i' } }
			];
		}
		if (req.body.type) {
			filter.type = new ObjectId(req.body.type);
		}
		if (req.body.account) {
			filter.account = { $in: req.body.account.map(account => new ObjectId(account)) };
		}
		if (req.body.category) {
			filter.category = { $in: req.body.category.map(category => new ObjectId(category)) };
		}
		if (req.body.payment_mode) {
			filter.payment_mode = { $in: req.body.payment_mode.map(payment_mode => new ObjectId(payment_mode)) };
		}
		const sortDetails = {};
		sortDetails.sortBy = req.body.sortBy || 'date';
		sortDetails.sortOrder = req.body.sortOrder === 'asc' ? 1 : -1;
		const skip = (page - 1) * size;

		const total = await MongoDB.transactions.countDocuments(filter);
		const transactions = await MongoDB.transactions
			.aggregate([
				{ $match: filter },
				...JOIN_QUERY,
				{ $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } },
				{ $skip: skip },
				{ $limit: size }
			])
			.toArray();
		res.body = {
			pagination: {
				total,
				page,
				size,
				sortBy: sortDetails.sortBy,
				sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
			},
			data: transactions
		};
		res.status(200).json(res.body);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch transactions', { error: err });
		res.status(500).json({ error: 'Failed to fetch transactions' });
	}
};

module.exports.getTransaction = async (req, res) => {
	try {
		if(Constants.MONGO_ID_REGEX.test(req.params.id) === false) {
			throw new AppError('Invalid Transaction ID', 422);
		}
		const filter = { _id: new ObjectId(req.params.id), _created_by: new ObjectId(req.user) };
		const transaction = (await MongoDB.transactions.aggregate([
			{ $match: filter },
			...JOIN_QUERY
		]).toArray()).at(0);
		if (!transaction) {
			throw new AppError('Transaction not found', 404);
		}
		res.status(200).json(transaction);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch transaction', { error: err });
		res.status(500).json({ message: 'Failed to fetch transaction' });
	}
};

module.exports.createTransaction = async (req, res) => {
	try {
		let { error } = TRANSACTION_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if (error) {
			error = get_joi_errors(error);
			throw new AppError('Invalid Data', 422, { error });
		}
		await Promise.all([
			validateID(req.body.account, req.user, 'account'),
			validateID(req.body.type, req.user, 'type'),
			validateID(req.body.category, req.user, 'category'),
			validateID(req.body.sub_category, req.user, 'sub_category'),
			validateID(req.body.payment_mode, req.user, 'payment_mode')
		]);
		const newTransaction = {
			date: req.body.date + 'T00:00:00.000Z', // Ensure the date is in ISO format
			description: req.body.description,
			amount: req.body.amount,
			account: new ObjectId(req.body.account),
			type: new ObjectId(req.body.type),
			category: new ObjectId(req.body.category),
			sub_category: new ObjectId(req.body.sub_category),
			payment_mode: new ObjectId(req.body.payment_mode),
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user),
			is_active: true
		};
		req.body.category || delete newTransaction.category;
		req.body.sub_category || delete newTransaction.sub_category;
		req.body.payment_mode || delete newTransaction.payment_mode;
		const result = await MongoDB.transactions.insertOne(newTransaction);
		if (!result.insertedId) {
			throw new AppError('Failed to create transactions', 500);
		}
		res.status(201).json({ _id: result.insertedId });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create transactions', { error: err });
		res.status(500).json({ message: 'Failed to create transactions' });
	}
};

module.exports.updateTransaction = async (req, res) => {
	try {
		const transactionsId = req.params.id;
		if(Constants.MONGO_ID_REGEX.test(transactionsId) === false) {
			throw new AppError('Invalid Transaction ID', 422);
		}
		const { error } = TRANSACTION_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
		if (error) {
			throw new AppError('Invalid Data', 422, { error: get_joi_errors(error) });
		}
		await Promise.all([
			validateID(req.body.account, req.user, 'account'),
			validateID(req.body.type, req.user, 'type'),
			validateID(req.body.category, req.user, 'category'),
			validateID(req.body.sub_category, req.user, 'sub_category'),
			validateID(req.body.payment_mode, req.user, 'payment_mode')
		]);
		const updateData = {
			date: req.body.date + 'T00:00:00.000Z',
			description: req.body.description,
			amount: req.body.amount,
			account: new ObjectId(req.body.account),
			type: new ObjectId(req.body.type),
			category: new ObjectId(req.body.category),
			sub_category: new ObjectId(req.body.sub_category),
			payment_mode: new ObjectId(req.body.payment_mode),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user),
		}
		req.body.category || delete updateData.category;
		req.body.sub_category || delete updateData.sub_category;
		req.body.payment_mode || delete updateData.payment_mode;
		const filter = { _id: new ObjectId(transactionsId), _created_by: new ObjectId(req.user), is_active: true };
		const result = await MongoDB.transactions.updateOne(
			filter,
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Transaction not found or no changes made', 404);
		}
		res.status(200).json({ _id: transactionsId });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update transaction', { error: err });
		res.status(500).json({ message: 'Failed to update transaction' });
	}
};

module.exports.deleteTransaction = async (req, res) => {
	try {
		if (!Constants.MONGO_ID_REGEX.test(req.params.id)) {
			throw new AppError('Invalid Transaction ID', 422);
		}
		const transactionId = req.params.id;
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const filter = { _id: new ObjectId(transactionId), _created_by: new ObjectId(req.user), is_active: true };
		const result = await MongoDB.transactions.updateOne(
			filter,
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Transaction not found', 404);
		}
		res.sendStatus(204);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({message: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete transaction', { error: err });
		res.status(500).json({ message: 'Failed to delete transaction' });
	}
};

module.exports.getTransactionSummary = async (req, res) => {
    try {
        const { error } = GROUP_SCHEMA.validate(req.body, Constants.JOI_VATIDATION_OPTION);
        if (error) {
            const errors = get_joi_errors(error);
            throw new AppError( 'Invalid Data', 422, { error: errors } );
        }
        const filter = { is_active: true, _created_by: new ObjectId(req.user), ...generateSummaryDateFilter(req.body) };

        // Optional filters
        if (req.body.account) { filter.account = new ObjectId(req.body.account); }
        if (req.body.type) { filter.type = new ObjectId(req.body.type);}
        if (req.body.category) { filter.category = new ObjectId(req.body.category); }
        if (req.body.sub_category) { filter.sub_category = new ObjectId(req.body.sub_category); }
        if (req.body.payment_mode) { filter.payment_mode = new ObjectId(req.body.payment_mode); }

        const pipeline = [
            { $match: filter },
            generateSummaryGroup(req.body.group_by),
            { $lookup: { from: 'lookups', localField: '_id.account', foreignField: '_id', as: 'account_info' } },
            { $lookup: { from: 'lookups', localField: '_id.type', foreignField: '_id', as: 'type_info' } },
            { $lookup: { from: 'lookups', localField: '_id.category', foreignField: '_id', as: 'category_info' } },
            { $lookup: { from: 'lookups', localField: '_id.sub_category', foreignField: '_id', as: 'sub_category_info' } },
            { $lookup: { from: 'lookups', localField: '_id.payment_mode', foreignField: '_id', as: 'payment_mode_info' } },
            { $project: {
                    _id: 0,
                    year: '$_id.year',
                    month: '$_id.month',
                    account: { $ifNull: [{ $first: '$account_info.name' }, 'Unknown'] },
                    type: { $ifNull: [{ $first: '$type_info.name' }, 'Unknown'] },
                    category: { $ifNull: [{ $first: '$category_info.name' }, 'Unknown'] },
                    sub_category: { $ifNull: [{ $first: '$sub_category_info.name' }, 'Unknown'] },
                    payment_mode: { $ifNull: [{ $first: '$payment_mode_info.name' }, 'Unknown'] },
                    total_amount: 1,
                    count: 1
			}}
        ];
        const transactions = await MongoDB.transactions.aggregate(pipeline).toArray();
        return res.status(200).json(transactions);
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ message: err.message, ...err.params});
        }
        CommonLogger.error( 'Failed to get transaction summary', { error: err } );
        res.status(500).json({ message: 'Failed to get transaction summary' });
    }
};
