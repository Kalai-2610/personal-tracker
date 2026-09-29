const Joi = require('joi');
const CacheMechanism = require('./cache');
const AppError = require('./appError');
const { get_joi_errors } = require('./glOperations');

class Schema {
	/** @type {Joi.object} */
	static #expense_schema;
	/** @type {Joi.object} */
	static #lookup_schema;
	/** @type {Joi.object} */
	static #report_body_schema;
	/** @type {Array<String>} */
	static #lookup_types
	/** @type {Array<String>} */
	static #group_by_types;
	
	constructor() {
		const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_ \[\]-]{0,254}$/;
		const ID_REGEX = /^[0-9a-fA-F]{24}$/;
		Schema.#group_by_types = ['account', 'type', 'category', 'sub_category', 'payment_mode', 'day', 'month', 'year'];
		Schema.#expense_schema = Joi.object({
			date: Joi.string().isoDate().required(),
			description: Joi.string().pattern(NAME_REGEX).required(),
			amount: Joi.number().positive().precision(2).required(),
			type: Joi.string().pattern(ID_REGEX).required(),
			category: Joi.string().pattern(ID_REGEX).required(),
			sub_category: Joi.string().pattern(ID_REGEX).required(),
			payment_mode: Joi.string().pattern(ID_REGEX).required(),
			account: Joi.string().pattern(ID_REGEX).required()
		});  
		Schema.#report_body_schema = Joi.object({
			start_date: Joi.string().isoDate().required(),
			end_date: Joi.string().isoDate().required().custom((value, helpers) => {
				const { start_date } = helpers.state.ancestors[0];
				if (new Date(value) < new Date(start_date)) {
					return helpers.error('date.min', { message: 'end_date must be greater than or equal to start_date' });
				}
			}),
			group_by: Joi.string().valid(...Schema.#group_by_types).required(),
			type: Joi.string().pattern(ID_REGEX).optional(),
			category: Joi.string().pattern(ID_REGEX).optional(),
			payment_mode: Joi.string().pattern(ID_REGEX).optional(),
			account: Joi.string().pattern(ID_REGEX).optional(),
			sort_order: Joi.string().valid('asc', 'desc').optional()
		});
	}

	/**
	 * Method to validate the schema
	 * @param {Object} data 
	 * @param {'lookup'|'expense'|'report'} type 
	 * @returns {Object}
	 */
	static async validateSchema(data, type) {
		let schema;
		if(type === 'expense') {
			schema = Schema.#expense_schema;
		} else if(type === 'report') {
			schema = Schema.#report_body_schema;
		} else {
			throw AppError("Invalid schema type", 500)
		}
		const { error, value } = schema.validate(data, {
			abortEarly: false, // show all errors
			allowUnknown: false, // disallow extra fields
			convert: false
		});
		const errors = get_joi_errors(error);
		return { errors, value };
	}
}

module.exports = Schema;
