const { Router } = require('express');

const UserRouter = Router();
const userController = require('../controllers/userController');

UserRouter.route('/')
    .get(userController.getAllUsers)
    .post(userController.createUser);
UserRouter.route('/:id')
    .get(userController.getUser)
    .patch(userController.updateUser);
    // .delete(userController.deleteUser);

module.exports = UserRouter;
