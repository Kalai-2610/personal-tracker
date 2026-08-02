const { Router } = require('express');

const CategoryRouter = Router();
const categoryController = require('../controllers/categoryController');

CategoryRouter.route('/')
    .get(categoryController.getAllCategory)
    .post(categoryController.createCategory);
CategoryRouter.route('/get_consolidated_categories')
    .get(categoryController.getConsolidatedCategory);
CategoryRouter.route('/:id')
    .get(categoryController.getCategory)
    .put(categoryController.updateCategory)
    .delete(categoryController.deleteCategory);

module.exports = CategoryRouter;
