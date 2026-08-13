const Joi = require('joi');
const CacheMechanism = require('./cache');
const AppError = require('./appError');

class Schema {
	/** @type {Joi.object} */
	static #expense_schema;
	/** @type {Joi.object} */
	static #lookup_schema;
	/** @type {Array<String>} */
	static #lookup_types
	
	constructor() {
		const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_ \[\]-]{0,254}$/;
		const ID_REGEX = /^[0-9a-fA-F]{24}$/;
		Schema.#lookup_types = ['type', 'category', 'sub_category', 'payment_mode'];
		Schema.#expense_schema = Joi.object({
			date: Joi.string().isoDate().required(),
			description: Joi.string().pattern(NAME_REGEX).required(),
			amount: Joi.number().positive().precision(2).required(),
			type: Joi.string().pattern(ID_REGEX).required(),
			category: Joi.string().pattern(ID_REGEX).optional(),
			sub_category: Joi.string().pattern(ID_REGEX).optional(),
			payment_mode: Joi.string().pattern(ID_REGEX).required()
		});  
		Schema.#lookup_schema = Joi.object({
			type: Joi.string().valid(...Schema.#lookup_types).required(),
			name: Joi.string().pattern(NAME_REGEX).required(),
			parent_id: Joi.string().pattern(ID_REGEX).when('type', { is: Joi.valid('category','sub_category'), then: Joi.required(), otherwise: Joi.forbidden() }),
		});
	}

	/**
	 * Method to validate the schema
	 * @param {Object} data 
	 * @param {'lookup'|'expense'} type 
	 * @returns {Object}
	 */
	static async validateSchema(data, type) {
		let schema;
		if(type === 'lookup') {
			schema = Schema.#lookup_schema;
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

	/**
	 * Method to check if the lookup type is valid
	 * @param {Array<String>} types 
	 */
	static checkLookUpType (types) {
		types = Array.isArray(types) ? types : [types];
		for(const type of types) {
			if(!Schema.#lookup_types.includes(type)) {
				throw new AppError(`Invalid lookup type - ${type}`, 422);
			}
		}
	}
}

module.exports = Schema;
