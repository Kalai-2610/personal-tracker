const Joi = require('joi');
const CacheMechanism = require('./cache');
const AppError = require('./appError');

class Schema {
	/** @type {Joi.object} */
	static #expense_schema;
	/** @type {Joi.object} */
	static #category_schema;
	constructor() {
		const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_ \[\]-]{0,254}$/;
		Schema.#expense_schema = Joi.object({
			date: Joi.string().isoDate().required(),
			description: Joi.string().pattern(NAME_REGEX).required(),
			amount: Joi.number().positive().precision(2).required(),
			category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
			payment_mode: Joi.string().valid('Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet', 'Cheque').required()
		});
		Schema.#category_schema = Joi.object({
			type: Joi.string().regex(NAME_REGEX).required(),
			category: Joi.string().regex(NAME_REGEX).required(),
			sub_category: Joi.string().regex(NAME_REGEX).required()
		});
	}

	/**
	 * Method to validate the schema
	 * @param {Object} data 
	 * @param {'category'|'expense'} type 
	 * @returns {Object}
	 */
	static async validateSchema(data, type) {
		let schema;
		if(type === 'category') {
			schema = Schema.#category_schema;
		} else if(type === 'expense') {
			schema = Schema.#expense_schema;
		} else {
			throw AppError("Invalid schema type", 500)
		}
		const { error, value } = schema.validate(data, {
			abortEarly: false, // show all errors
			allowUnknown: false, // disallow extra fields
			convert: false
		});
		const errors = error?.details?.map((item) => {
			delete item?.context;
			delete item?.path;
			return item;
		});
		return { errors, value };
	}
}

module.exports = Schema;
