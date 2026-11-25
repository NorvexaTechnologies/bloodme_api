import express from 'express';
import { userSignup, userLogin, resetPassword, forgotPassword, verifyOtp, getAllUsers, getUserDetails, getNearbyEligibleDonors, leaveOrg, updateFcmToken } from '../controllers/userController.js';
import { updateUserDetails } from '../controllers/organizationController.js';
import protect from '../middleWare/userMiddleWare.js'
const app = express.Router()

app.route('/').post(userSignup).get(getAllUsers).put(protect, updateUserDetails)
app.route('/fcm-token').put(protect, updateFcmToken)
app.route('/near-by').post(protect, getNearbyEligibleDonors)
app.route('/verify').post(verifyOtp)
app.route("/forgot-password").post(forgotPassword);
app.route("/reset-password/:token").post(resetPassword)
app.route('/login').post(userLogin)
app.route('/leave-org').put(protect, leaveOrg)
app.route('/:id').get(getUserDetails)

export default app