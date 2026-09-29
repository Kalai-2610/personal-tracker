const { Router } = require('express');

const TransactionRouter = Router();
const transactionController = require('../controllers/transactionController');

TransactionRouter.route('/')
    .get(transactionController.getAllTransactions)
    .post(transactionController.createTransaction);
TransactionRouter.route('/summary')
    .query(transactionController.getTransactionSummary);
TransactionRouter.route('/:id')
    .get(transactionController.getTransaction)
    .put(transactionController.updateTransaction)
    .delete(transactionController.deleteTransaction);

module.exports = TransactionRouter;
