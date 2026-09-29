const { Router } = require('express');

const LookUpRouter = Router();
const lookUpController = require('../controllers/lookupController');

LookUpRouter.route('/')
    .get(lookUpController.getAllLookup)
    .post(lookUpController.createLookUp);

LookUpRouter.route('/:id')
    .get(lookUpController.getLookup)
    .patch(lookUpController.updateLoopUp)
    .delete(lookUpController.deleteLoopUp);

module.exports = LookUpRouter;
