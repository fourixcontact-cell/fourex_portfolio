class AppError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.isOperational = true;
  }
}
module.exports = AppError;
