import BloodRequest from "../models/bloodrequestSchema.js";
import User from "../models/userSchema.js";
import AcceptRequest from "../models/acceptRequestSchema.js";
import { sendPushNotification, sendMulticastNotification } from "../utils/firebase.js";


// CREATE BLOOD REQUEST AND NOTIFY DONORS
const bloodRequest = async (req, res) => {
  try {
    console.log("Creating blood request with body:", req.body);

    const {
      requesterId,
      bloodGroup,
      bloodType,
      units,
      patientName,
      hospitalAddress,
      hospitalName,
      phoneNumber,
      notes,
      location,
      priority,
    } = req.body;

    const actualRequesterId = requesterId || req.user?._id;
    const actualBloodGroup = bloodGroup || bloodType;

    const longitude = location?.coordinates?.[0] ?? req.body.longitude ?? req.body.lng;
    const latitude = location?.coordinates?.[1] ?? req.body.latitude ?? req.body.lat;

    if (longitude === undefined || latitude === undefined || isNaN(Number(longitude)) || isNaN(Number(latitude))) {
      return res.status(400).json({
        msg: "Invalid location format. Coordinates [lng, lat] or latitude/longitude required.",
      });
    }

    if (!actualRequesterId) {
      return res.status(400).json({ msg: "Requester ID is required" });
    }

    if (!actualBloodGroup) {
      return res.status(400).json({ msg: "Blood group/type is required" });
    }

    const newRequest = new BloodRequest({
      requesterId: actualRequesterId,
      bloodGroup: actualBloodGroup,
      units: units || 1,
      patientName,
      hospitalAddress,
      hospitalName,
      phoneNumber,
      notes,
      location: {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      },
      priority: priority || "moderate",
      status: "pending",
      isActive: true,
    });

    const savedRequest = await newRequest.save();
    console.log("Saved request:", savedRequest);

    // Send push notification to matching donors
    try {
      const donors = await User.find({
        bloodType: actualBloodGroup,
        _id: { $ne: actualRequesterId },
        fcmToken: { $exists: true, $ne: null },
      }).select("fcmToken");

      const tokens = donors.map((d) => d.fcmToken).filter(Boolean);
      if (tokens.length > 0) {
        await sendMulticastNotification(tokens, {
          title: `Blood Needed: ${actualBloodGroup}`,
          body: `A new blood request for ${actualBloodGroup} has been made at ${hospitalName || 'a hospital nearby'}.`,
          data: {
            requestId: savedRequest._id.toString(),
            type: "blood_request",
          },
        });
      }
    } catch (notifErr) {
      console.error("Error sending push notification for blood request:", notifErr);
    }

    res.status(201).json({
      msg: "Blood request created successfully",
      data: savedRequest,
    });
  } catch (error) {
    console.error("Error creating blood request:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// DONOR RESPONDS TO BLOOD REQUEST
// -------------------------
// Donor respond
// -------------------------
const approveRespond = async (req, res) => {
  try {
    const donorId = req.user._id;
    const requestId = req.params.id;

    // Get donor details
    const donor = await User.findById(donorId).select(
      "name phoneNumber bloodType organizationId"
    );

    const request = await BloodRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ msg: "Blood request not found" });
    }

    // Create/update AcceptRequest
    let saveAccept = await AcceptRequest.findOneAndUpdate(
      { requestId, donorId },
      {
        organizationId: donor.organizationId || null,
        status: "approved",
      },
      { new: true, upsert: true }
    );

    saveAccept = await saveAccept.populate(
      "donorId",
      "name phoneNumber bloodType"
    );

    // Send push notification to requester
    try {
      const requester = await User.findById(request.requesterId).select("fcmToken");
      if (requester?.fcmToken) {
        await sendPushNotification(requester.fcmToken, {
          title: "Donor Found!",
          body: `${donor?.name || "A donor"} has offered to donate blood for your request.`,
          data: {
            requestId: requestId.toString(),
            donorId: donorId.toString(),
            type: "donor_response",
          },
        });
      }
    } catch (notifErr) {
      console.error("Error sending push notification to requester:", notifErr);
    }



    res.json({
      msg: "Donor confirmed donation & notification sent!",
      savedResponse: saveAccept,
      bloodRequestStatus: request.status,
    });

  } catch (err) {
    console.error("Error in approveRespond:", err);
    res.status(500).json({ error: err.message });
  }
};

const acceptBloodRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { donorId } = req.body;
    const requesterId = req.user._id;

    // Find the blood request
    const request = await BloodRequest.findById(requestId);
    if (!request) return res.status(404).json({ msg: "Request not found" });

    // Only the requester can mark the donation as completed
    if (request.requesterId.toString() !== requesterId.toString()) {
      return res.status(403).json({ msg: "You cannot complete this donation" });
    }

    // Update AcceptRequest record
    const acceptRecord = await AcceptRequest.findOneAndUpdate(
      { requestId, donorId },
      { status: "completed" },
      { new: true, upsert: true } // create if it doesn't exist
    );

    // Update BloodRequest status
    request.status = "completed";
    request.selectedDonor = donorId;
    await request.save();

    // Update donor's donation count and latest donation date
    const donor = await User.findById(donorId);
    if (donor) {
      donor.donationCount = (donor.donationCount || 0) + 1;

      // Set latest donation date to 2 days ago
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      donor.latestDonationDate = twoDaysAgo;

      await donor.save();

      // Notify donor that their donation was confirmed
      if (donor?.fcmToken) {
        try {
          await sendPushNotification(donor.fcmToken, {
            title: "Donation Confirmed! ❤️",
            body: "Thank you for saving a life! Your blood donation has been successfully confirmed.",
            data: {
              requestId: requestId.toString(),
              type: "donation_completed",
            },
          });
        } catch (notifErr) {
          console.error("Error sending push notification to donor:", notifErr);
        }
      }


    }

    res.status(200).json({
      msg: "Donation completed successfully",
      acceptRecord,
      updatedBloodRequest: request,
    });
  } catch (err) {
    console.error("Error in acceptBloodRequest:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// REJECT BLOOD REQUEST
const rejectBloodRequest = async (req, res) => {
  try {
    const { requestId, donorId } = req.body;

    if (!requestId || !donorId)
      return res.status(400).json({ msg: "Request ID and Donor ID are required" });

    // Update the AcceptRequest only
    const updatedAccept = await AcceptRequest.findOneAndUpdate(
      { requestId, donorId },
      { status: "rejected" },
      { new: true, upsert: true } // upsert: create record if it doesn't exist
    );



    res.status(200).json({
      msg: "Donor response updated successfully",
      data: updatedAccept,
    });
  } catch (err) {
    console.error("Error updating donor response:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};


const getAllRequestByStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;

    // Pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    // Validation
    const allowedStatus = ["approved", "accepted", "completed"];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        msg: "Invalid status value. Allowed: approved, accepted, completed",
      });
    }

    // Build filter query
    const filter = { donorId: userId };
    if (status) filter.status = status;

    const totalItems = await AcceptRequest.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const acceptedRequests = await AcceptRequest.find(filter)
      .populate("requestId", "bloodGroup units hospitalName phoneNumber notes")
      .populate("donorId", "name bloodType phoneNumber email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      msg: "Accepted requests fetched successfully",
      statusFilter: status || "all",
      page,
      totalPages,
      totalItems,
      data: acceptedRequests,
    });
  } catch (err) {
    console.error("Error fetching accepted requests:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// GET ALL ACTIVE BLOOD REQUESTS
const getAllBloodRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const userLat = parseFloat(req.query.lat);
    const userLng = parseFloat(req.query.lng);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let requests = [];
    const baseQuery = {
      isActive: true,
      requesterId: { $ne: userId },
      status: "pending",
    };

    if (userLat && userLng && !isNaN(userLat) && !isNaN(userLng)) {
      // Update user location
      await User.findByIdAndUpdate(userId, {
        location: {
          type: "Point",
          coordinates: [userLng, userLat],
        },
      });

      // Fetch blood requests with distance and latest first
      requests = await BloodRequest.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [userLng, userLat] },
            distanceField: "distance",
            spherical: true,
            query: baseQuery,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]);
    } else {
      // Fallback when location is not available
      requests = await BloodRequest.find(baseQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }

    const total = await BloodRequest.countDocuments({
      isActive: true,
      requesterId: { $ne: userId },
      status: "pending",
    });

    res.status(200).json({
      msg: "Requests fetched",
      data: requests,
      page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasMore: page * limit < total,
    });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// GET BLOOD REQUEST BY ID
const getBloodRequest = async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ msg: "Request not found" });
    res.status(200).json({ msg: "Request fetched", data: request });
  } catch (err) {
    console.error("Error fetching request:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// GET USER BLOOD REQUEST HISTORY (ADMIN)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const filter = { requesterId: user._id };
    const totalItems = await BloodRequest.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const history = await BloodRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      msg: "User history fetched",
      page,
      totalPages,
      totalItems,
      data: history,
    });
  } catch (err) {
    console.error("Error fetching user history:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// GET LOGGED-IN USER BLOOD REQUEST HISTORY
const getHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    // Validate user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const filter = { donorId: userId, status: "completed" };

    const totalItems = await AcceptRequest.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const history = await AcceptRequest.find(filter)
      .populate({
        path: "requestId",
        select: "hospitalName patientName hospitalAddress createdAt units",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      msg: "Completed history fetched successfully",
      statusFilter: "completed",
      page,
      totalPages,
      totalItems,
      data: history,
    });
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({
      msg: "Server error",
      error: err.message,
    });
  }
};


const getDonorsList = async (req, res) => {
  try {
    const requestId = req.params.id;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const filter = { requestId };
    const totalItems = await AcceptRequest.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const donors = await AcceptRequest.find(filter)
      .populate("donorId", "name bloodType phoneNumber email")
      .select("donorId remarks distanceInKm status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      msg: "Donors list fetched successfully",
      page,
      totalPages,
      totalItems,
      data: donors,
    });
  } catch (err) {
    console.error("Error fetching donors list:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

const getBloodUnits = async (req, res) => {
  try {
    const unitsCount = await BloodRequest.countDocuments({ status: 'completed' })
    res.status(200).json({
      msg: "count fetched successfully",
      count: unitsCount
    })
  } catch (err) {
    console.error("Error fetching donors list:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
}

export {
  bloodRequest,
  approveRespond,
  acceptBloodRequest,
  getAllRequestByStatus,
  rejectBloodRequest,
  getAllBloodRequest,
  getBloodRequest,
  getUserById,
  getHistory,
  getDonorsList,
  getBloodUnits
};

//if the donation completed by the user update the donationCount in user schema and also the latest donation date which 2 days ago from today// Also update the request status to completed
