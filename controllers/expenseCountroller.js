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