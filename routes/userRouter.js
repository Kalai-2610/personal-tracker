const { Router } = require('express');

const UserRouter = Router();
const userController = require('../controllers/userController');
const { is_system } = require('../controllers/authController');

UserRouter.route('/')
    .get(is_system, userController.getAllUsers)
    .post(is_system, userController.createUser);

UserRouter.route('/change_password')
    .patch(userController.change_password);

UserRouter.route('/:id')
    .get(is_system, userController.getUser)
    .patch(is_system, userController.updateUser)
    .delete(is_system, userController.deleteUser);

UserRouter.route("/:id/status")
    .patch(userController.updateUserStatus)

module.exports = UserRouter;
