const { Router } = require('express');

const ExpenseRouter = Router();
const ExpenseController = require('../controllers/expenseCountroller');

ExpenseRouter.route('/')
    // .get(ExpenseController.getAllUsers)
    .post(ExpenseController.createExpense);
ExpenseRouter.route('/:id')
//     .get(ExpenseController.getUser)
    .put(ExpenseController.updateExpense)
    .delete(ExpenseController.deleteExpense);

module.exports = ExpenseRouter;
