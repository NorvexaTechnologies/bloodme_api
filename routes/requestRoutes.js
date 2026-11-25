import express from 'express';
import { bloodRequest, approveRespond, acceptBloodRequest, getAllRequestByStatus, rejectBloodRequest, getBloodRequest, getAllBloodRequest, getUserById, getHistory, getDonorsList, getBloodUnits } from '../controllers/bloodRequestController.js'
import protect from '../middleWare/userMiddleWare.js';


const app = express.Router()
app.route('/').post(protect, bloodRequest).get(protect, getAllBloodRequest);
app.route('/count').get(getBloodUnits)
app.route('/accept').post(protect, acceptBloodRequest).get(protect, getAllRequestByStatus);
app.route('/reject').post(protect, rejectBloodRequest);
app.route("/history").get(protect, getHistory);

app.route('/approve/:id').post(protect, approveRespond);
app.route('/confirm/:id').post(protect, acceptBloodRequest);

// MOVE THIS TO LAST
app.route('/:id').get(getBloodRequest);
app.route('/:id/donors').get(protect, getDonorsList);

// Admin
app.route("/history/:id").get(getUserById);


export default app
