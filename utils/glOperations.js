const Joi = require("joi");
const { CommonLogger } = require("./logger").CommonLogger;

/**
 * Calculates the validity period based on the given validity time.
 * @param {number} validity_time - The validity time in minutes.
 * @returns {object} - An object containing the created on and expire on timestamps.
 */
function get_validity(validity_time) {
    try {
        const createdAt = new Date();
        const expireAt = new Date(createdAt.getTime() + validity_time * 60 * 1000);
        return { _created_on: createdAt.toISOString(), _expire_on: expireAt.toISOString() };
    } catch (error) {
        CommonLogger.error('Failed to calculate validity', { error });
        throw new AppError('Failed to calculate validity');
    }
}

/**
 * Extracts and formats Joi validation errors.
 * @param {Joi.ValidationError} error - The Joi validation error object.
 * @returns {Array} - An array of formatted error details.
 */
function get_joi_errors(error) {
    try {
        const errors = error?.details?.map((item) => {
			delete item?.context;
			delete item?.path;
			return item;
		});
        return errors;
    } catch (error) {
        CommonLogger.error('Failed to get errors', { error });
        throw new AppError('Failed to get errors');
    }
}


module.exports.get_validity = get_validity;
module.exports.get_joi_errors = get_joi_errors;