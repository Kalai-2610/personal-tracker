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
    } catch (err) {
        CommonLogger.error('Failed to calculate validity', { error: err });
        throw new AppError('Failed to calculate validity');
    }
}

module.exports.get_validity = get_validity;