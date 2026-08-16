const { Router } = require('express');

const ExpenseRouter = Router();
const ExpenseController = require('../controllers/expenseCountroller');

ExpenseRouter.route('/')
    .get(ExpenseController.getAllExpenses)
    .post(ExpenseController.createExpense);
ExpenseRouter.route('/report').query(ExpenseController.getExpenseReport);
ExpenseRouter.route('/:id')
    .get(ExpenseController.getExpense)
    .put(ExpenseController.updateExpense)
    .delete(ExpenseController.deleteExpense);

module.exports = ExpenseRouter;
