const { Router } = require('express');

const AuthRouter = Router();
const authController = require('../controllers/authController');

AuthRouter.route('/sign_in').post(authController.sign_in);
AuthRouter.route('/refresh_token').get(authController.refresh_token);
AuthRouter.route('/change_password').post(authController.verifyUser, authController.change_password);
AuthRouter.route('/sign_out').delete(authController.sign_out);
AuthRouter.route('/clear_sessions').delete(authController.verifyUser, authController.clear_sessions);
AuthRouter.route('/update_user_status').post(authController.verifyUser, authController.updateUserStatus);

module.exports = AuthRouter;
