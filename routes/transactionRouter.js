const { Router } = require('express');

const TransactionRouter = Router();
const transactionController = require('../controllers/transactionController');

TransactionRouter.route('/')
    // .get(transactionController.getAllCategory)
    .post(transactionController.createTransaction);
TransactionRouter.route('/:id')
    // .get(categoryController.getCategory)
    .put(transactionController.updateTransaction)
    .delete(transactionController.deleteTransaction);

module.exports = TransactionRouter;
