import Banner from "../models/bannerSchema.js";
import BloodRequest from "../models/bloodrequestSchema.js";
import User from "../models/userSchema.js";

const getHomeData = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { lat, lng, fcmToken } = req.body;

        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);

        // 1. AUTO-EXPIRE BANNERS (Reusable logic from bannerController)
        const now = new Date();
        await Banner.updateMany(
            { endDate: { $lt: now }, isActive: true },
            { $set: { isActive: false } }
        );

        // 2. UPDATE USER (Location & FCM Token) if logged in
        if (userId) {
            const updateFields = {};
            if (userLat && userLng) {
                updateFields.location = {
                    type: "Point",
                    coordinates: [userLng, userLat],
                };
            }
            if (fcmToken) {
                updateFields.fcmToken = fcmToken;
            }

            if (Object.keys(updateFields).length > 0) {
                await User.findByIdAndUpdate(userId, updateFields);
            }
        }

        // 3. FETCH BANNERS (User-facing: only active)
        const bannerPromise = Banner.find({ isActive: true }).sort({ createdAt: -1 }).limit(10);

        // 4. FETCH NEARBY BLOOD REQUESTS (If location provided)
        let requestPromise;
        if (userLat && userLng) {
            requestPromise = BloodRequest.aggregate([
                {
                    $geoNear: {
                        near: { type: "Point", coordinates: [userLng, userLat] },
                        distanceField: "distance",
                        spherical: true,
                        query: {
                            isActive: true,
                            ...(userId ? { requesterId: { $ne: userId } } : {}),
                            status: "pending",
                        },
                    },
                },
                { $sort: { createdAt: -1 } },
                { $limit: 10 },
            ]);
        } else {
            // Fallback: Just return active pending requests
            requestPromise = BloodRequest.find({
                isActive: true,
                status: "pending",
                ...(userId ? { requesterId: { $ne: userId } } : {}),
            })
                .sort({ createdAt: -1 })
                .limit(10);
        }

        // Run both queries in parallel
        const [banners, requests] = await Promise.all([bannerPromise, requestPromise]);

        res.status(200).json({
            msg: "Home data fetched successfully",
            data: {
                banners,
                requests,
            },
        });
    } catch (error) {
        console.error("Error fetching home data:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
};

export { getHomeData };
