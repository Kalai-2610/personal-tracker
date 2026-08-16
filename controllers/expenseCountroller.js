const { ObjectId } = require('mongodb');
const Schema = require('../utils/schema');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');

const PROJECT = {
	$project: {
        _id: 1,
        type: { $arrayElemAt: ['$type.name', 0] },
        category: { $arrayElemAt: ['$category.name', 0] },
        sub_category: { $arrayElemAt: ['$sub_category.name', 0] },
        payment_mode: { $arrayElemAt: ['$payment_mode.name', 0] },
        account: { $arrayElemAt: ['$account.name', 0] },
        date: 1,
        description: 1,
        amount: 1,
        _created_on: 1,
        _createdBy: 1,
        _updated_on: 1,
        _updatedBy: 1,
        is_active: 1
	}
};
const LOOK_UP = [
    {
        $lookup: {
            from: '_lookups',
            localField: 'type',
            foreignField: '_id',
            as: 'type'
        }
    },
    {
        $lookup: {
            from: '_lookups',
            localField: 'category',
            foreignField: '_id',
            as: 'category'
        }
    },
    {
        $lookup: {
            from: '_lookups',
            localField: 'sub_category',
            foreignField: '_id',
            as: 'sub_category'
        }
    },
    {
        $lookup: {
            from: '_lookups',
            localField: 'payment_mode',
            foreignField: '_id',
            as: 'payment_mode'
        }
    },
    {
        $lookup: {
            from: '_lookups',
            localField: 'account',
            foreignField: '_id',
            as: 'account'
        }
    }
];

module.exports.getAllExpenses = async (req, res) => {
    try {
        const filter = { is_active: req.query?.is_active != 0 };
        const size = Number.parseInt(req.query.size) || 10;
        const page = Number.parseInt(req.query.page) || 1;
        if(!req.isSystem) {
            filter._created_by = new ObjectId(req.user);
        }
        const sortDetails = {};
        sortDetails.sortBy = req.query.sortBy || '_created_on';
        sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
        const skip = (page - 1) * size;
        const expenses = await MongoDB.expenses.aggregate([
            { $match: filter },
            { $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } },
            { $skip: skip },
            { $limit: size },
            ...LOOK_UP,
            MongoDB.LOOK_UP_CREATOR,
            MongoDB.LOOK_UP_UPDATOR,
            MongoDB.SET,
            PROJECT
        ]).toArray();
        const total = await MongoDB.expenses.countDocuments(filter);
        res.body = {
            success: true,
            pagination: {
                total,
                page,
                size,
                sortBy: sortDetails.sortBy,
                sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
            },
            data: expenses
        };
        res.status(200).json(res.body);
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, error: error.message, ...error.params });
        }
        CommonLogger.error('Error fetching expenses', { error });
        res.status(500).json({ success: false, error: 'Error fetching expenses' });
    }
}

module.exports.getExpense = async (req, res) => {
    try {
        const filter = { _id: new ObjectId(req.params.id) };
        req.isSystem || (filter._created_by = new ObjectId(req.user));
        const expense = (await MongoDB.expenses.aggregate([
            { $match: filter },
            ...LOOK_UP,
            MongoDB.LOOK_UP_CREATOR,
            MongoDB.LOOK_UP_UPDATOR,
            MongoDB.SET,
            PROJECT
        ]).toArray()).at(0);
        if (!expense) {
            throw new AppError('Expense not found', 404);
        }
        res.status(200).json({ success: true, data: expense });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, error: error.message, ...error.params });
        }
        CommonLogger.error('Error fetching expense', { error });
        res.status(500).json({ success: false, error: 'Error fetching expense' });
    }
}

module.exports.createExpense = async (req, res) => {
    try {
        const { errors, value } = await Schema.validateSchema(req.body, 'expense');
        if (errors?.length) {
            throw new AppError('Invalid Data', 422, { errors });
        }
        const newExpense = {
            date: req.body.date,
            description: req.body.description,
            amount: req.body.amount,
            type: new ObjectId(req.body.type),
            category: new ObjectId(req.body.category),
            sub_category: new ObjectId(req.body.sub_category),
            payment_mode: new ObjectId(req.body.payment_mode),
            account: new ObjectId(req.body.account),
            _created_on: new Date().toISOString(),
            _created_by: new ObjectId(req.user),
            _updated_on: new Date().toISOString(),
            _updated_by: new ObjectId(req.user),
            is_active: true
        }
        const result = await MongoDB.expenses.insertOne(newExpense);
        if (!result.acknowledged) {
            throw new AppError('Error creating expense', 500);
        }
        res.status(201).json({ success: true, data: { _id: result.insertedId } });

    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, error: error.message, ...error.params });
        }
        CommonLogger.error('Error creating expense', { error });
        res.status(500).json({ success: false, error: 'Error creating expense' });
    }
}

module.exports.updateExpense = async (req, res) => {
    try {
        const { errors, value } = await Schema.validateSchema(req.body, 'expense');
        if (errors?.length) {
            throw new AppError('Invalid Data', 422, { errors });
        }
        const filter = { _id: new ObjectId(req.params.id), is_active: true };
        req.isSystem || (filter._created_by = new ObjectId(req.user));
        const updateExpense = {
            date: req.body.date,
            description: req.body.description,
            amount: req.body.amount,
            type: new ObjectId(req.body.type),
            category: new ObjectId(req.body.category),
            sub_category: new ObjectId(req.body.sub_category),
            payment_mode: new ObjectId(req.body.payment_mode),
            account: new ObjectId(req.body.account),
            _updated_on: new Date().toISOString(),
            _updated_by: new ObjectId(req.user)
        }
        const result = await MongoDB.expenses.updateOne(filter, { $set: updateExpense });
        if (!result.acknowledged) {
            throw new AppError('Error updating expense', 500);
        }
        if (result.modifiedCount === 0) {
            throw new AppError('No expense found to update or no changes made', 404);
        }
        res.status(200).json({ success: true, data: { _id: req.params.id } });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, error: error.message, ...error.params });
        }
        CommonLogger.error('Error updating expense', { error });
        res.status(500).json({ success: false, error: 'Error updating expense' });
    }
}

module.exports.deleteExpense = async (req, res) => {
    try {
        const filter = { _id: new ObjectId(req.params.id), is_active: true };
        req.isSystem || (filter._created_by = new ObjectId(req.user));
        const updateExpense = {
            _updated_on: new Date().toISOString(),
            _updated_by: new ObjectId(req.user),
            is_active: false
        }
        const result = await MongoDB.expenses.updateOne(filter, { $set: updateExpense });
        if (!result.acknowledged) {
            throw new AppError('Error deleting expense', 500);
        }
        if (result.modifiedCount === 0) {
            throw new AppError('No expense found to delete', 404);
        }
        res.status(204).json({ success: true, data: { _id: req.params.id } });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, error: error.message, ...error.params });
        }
        CommonLogger.error('Error deleting expense', { error });
        res.status(500).json({ success: false, error: 'Error deleting expense' });
    }
}

async function generateFilterQuery(body, userId, isSystem) {
    const filter = { is_active: true, date: { $gte: body.start_date, $lte: body.end_date } };
    if(!isSystem) {
        filter._created_by = new ObjectId(userId);
    }
    if (body.type) {
        filter.type = new ObjectId(body.type);
    }
    if (body.category) {
        filter.category = new ObjectId(body.category);
    }
    if (body.payment_mode) {
        filter.payment_mode = new ObjectId(body.payment_mode);
    }
    if (body.account) {
        filter.account = new ObjectId(body.account);
    }
    return { $match: filter };
}

async function generateGroupQuery(groupBy) {
    const group = {
        _id: {},
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
    };
    if (groupBy === 'year') {
        group._id.year = { $year: { $toDate: '$date' } };
    } else if (groupBy === 'month') {
        group._id.year = { $year: { $toDate: '$date' } };
        group._id.month = { $month: { $toDate: '$date' } };
    } else if (groupBy === 'day') {
        group._id.year = { $year: { $toDate: '$date' } };
        group._id.month = { $month: { $toDate: '$date' } };
        group._id.day = { $dayOfMonth: { $toDate: '$date' } };
    } else if (groupBy === 'type') {
        group._id.account = '$account';
        group._id.type = '$type';
    } else if (groupBy === 'category'){
        group._id.account = '$account';
        group._id.type = '$type';
        group._id.category = '$category';
    } else if (groupBy === 'sub_category'){
        group._id.account = '$account';
        group._id.type = '$type';
        group._id.category = '$category';
        group._id.sub_category = '$sub_category';
    } else {
        group._id[groupBy] = `$${groupBy}`;
    }
    return { $group: group };
}

async function generateLookupStages(groupBy) {
    const stages = [];
     const project = { $project: { _id: 0, amount: 1, count: 1 } };
    if (['type', 'category', 'sub_category', 'payment_mode', 'account'].includes(groupBy)) {
        const fields = {
            payment_mode: ['payment_mode'],
            account: ['account'],
            type: ['account', 'type'],
            category: ['account', 'type', 'category'],
            sub_category: ['account', 'type', 'category', 'sub_category']
        }[groupBy];

        if (!fields) {
            return [];
        }

        const lookup = {
            $lookup: {
                from: '_lookups',
                let: { lookupIds: fields.map(field => `$_id.${field}`) },
                pipeline: [
                    { 
                        $match: {
                            $expr: { $in: ['$_id', '$$lookupIds'] }
                        }
                    },
                    { $project: { _id: 1, name: 1 } }
                ],
                as: 'lookup'
            }
        };

        fields.forEach(field => {
            project.$project[field] = {
                $let: {
                    vars: {
                        item: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: '$lookup',
                                        as: 'lookup',
                                        cond: {
                                            $eq: [
                                                '$$lookup._id',
                                                `$_id.${field}`
                                            ]
                                        }
                                    }
                                },
                                0
                            ]
                        }
                    },
                    in: {
                        $ifNull: ['$$item.name', null]
                    }
                }
            };
        });
        stages.push(lookup);
    } else if (['year', 'month', 'day'].includes(groupBy)) {
        project.$project.year = '$_id.year';
        project.$project.month = '$_id.month';
        project.$project.day = '$_id.day';
    }
    stages.push(project);
    return stages;
};

async function generateSortStage(groupBy, sortOrder = "desc") {
    sortOrder = sortOrder === 'asc' ? 1 : -1;
    const fields = {
        year: ['year'],
        month: ['year', 'month'],
        day: ['year', 'month', 'day'],
        account: ['account'],
        type: ['account', 'type'],
        category: ['account', 'type', 'category'],
        sub_category: ['account', 'type', 'category', 'sub_category'],
        payment_mode: ['account', 'payment_mode']
    }[groupBy];

    if (!fields) {
        return { $sort: {} };
    }

    return {
        $sort: Object.fromEntries(
            fields.map(field => [field, sortOrder])
        )
    };
};

async function getTotalAmount(data) {
    const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
    return totalAmount;
}

async function getTotalCount(data) {
    const totalCount = data.reduce((sum, item) => sum + item.count, 0);
    return totalCount;
}

module.exports.getExpenseReport = async (req, res) => {
    try {
        const { errors, value } = await Schema.validateSchema(req.body, 'report');
        if (errors?.length) {
            throw new AppError('Invalid Data', 422, { errors });
        }
        const query =[];
        const [filter, group, lookup, sort] = await Promise.all([
            generateFilterQuery(req.body, req.user, req.isSystem),
            generateGroupQuery(req.body.group_by),
            generateLookupStages(req.body.group_by),
            generateSortStage(req.body.group_by, req.body.sort_order)
        ]);
        query.push(filter, group, ...lookup, sort);
        const data = await MongoDB.expenses.aggregate(query).toArray();
        const [totalAmount, totalCount] = await Promise.all([ getTotalAmount(data), getTotalCount(data) ]);
        res.status(200).json({
            success: true,
            details: {
                total_amount: totalAmount,
                total_count: totalCount,
                sort: query.at(-1)?.$sort || null,
            },
            data
        });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ success: false, error: error.message, ...error.params });
        }
        CommonLogger.error('Error generating expense report', { error });
        res.status(500).json({ success: false, error: 'Error generating expense report' });
    }
}