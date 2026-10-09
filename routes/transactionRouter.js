const { Router } = require('express');

const TransactionRouter = Router();
const transactionController = require('../controllers/transactionController');

TransactionRouter.route('/')
    .post(transactionController.createTransaction);
TransactionRouter.route('/list')
    .post(transactionController.getAllTransactions);
TransactionRouter.route('/summary')
    .post(transactionController.getTransactionSummary);
TransactionRouter.route('/:id')
    .get(transactionController.getTransaction)
    .put(transactionController.updateTransaction)
    .delete(transactionController.deleteTransaction);

module.exports = TransactionRouter;
