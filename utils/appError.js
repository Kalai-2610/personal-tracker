class AppError extends Error {
  constructor(message, statusCode = 400, params={}) {
    super(message);
    this.statusCode = statusCode;
    this.params = params;
  }
}

module.exports = AppError;