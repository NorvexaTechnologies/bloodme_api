import Banner from "../models/bannerSchema.js";
import cloudinary from "../utils/cloudinary.js";

// Helper function to sanitize filename
const sanitizeFileName = (filename) => {
  // Remove special characters and spaces, replace with hyphens
  return filename
    .replace(/[^\w\s.-]/g, "") // Remove special chars except word chars, spaces, dots, hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/--+/g, "-") // Replace multiple hyphens with single
    .toLowerCase(); // Convert to lowercase
};

// CREATE
const createBanner = async (req, res) => {
  try {
    const { AdTitle, startDate, endDate, isActive } = req.body;

    // ✅ Date Validation: Allow from today onwards
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    const bannerStartDate = new Date(startDate + "T00:00:00");
    if (bannerStartDate < now) {
      return res.status(400).json({
        msg: "Banners can only be scheduled from today onwards.",
      });
    }

    if (!req.file)
      return res.status(400).json({ msg: "AdImageUrl file is required" });

    // ✅ Sanitize the filename
    const originalName = req.file.originalname;
    const sanitizedName = sanitizeFileName(originalName);
    const fileName = `${Date.now()}-${sanitizedName}`;

    // ✅ Upload to Cloudinary
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "banners",
          public_id: `${Date.now()}-${sanitizedName.split(".")[0]}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const result = await uploadPromise;

    const newBanner = new Banner({
      AdTitle,
      AdImageUrl: result.secure_url,
      startDate,
      endDate,
      isActive,
    });

    await newBanner.save();
    res
      .status(201)
      .json({ msg: "Banner created successfully", data: newBanner });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// UPDATE
const updateBanner = async (req, res) => {
  try {
    const id = req.params.id;
    const banner = await Banner.findById(id);
    if (!banner) return res.status(404).json({ msg: "Banner not found" });

    let updatedFields = { ...req.body };

    // ✅ Date Validation: Allow from today onwards (if startDate is being updated)
    if (req.body.startDate) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const bannerStartDate = new Date(req.body.startDate + "T00:00:00");
      if (bannerStartDate < now) {
        return res.status(400).json({
          msg: "Banners can only be scheduled from today onwards.",
        });
      }
    }

    if (req.file) {
      // ✅ Sanitize the filename
      const originalName = req.file.originalname;
      const sanitizedName = sanitizeFileName(originalName);
      const fileName = `${Date.now()}-${sanitizedName}`;

      // ✅ Upload to Cloudinary
      const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "banners",
            public_id: `${Date.now()}-${sanitizedName.split(".")[0]}`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });

      const result = await uploadPromise;
      updatedFields.AdImageUrl = result.secure_url;

      // Delete old image
      if (banner.AdImageUrl) {
        try {
          // Extract public_id from cloudinary URL
          // Example: https://res.cloudinary.com/cloud_name/image/upload/v12345/banners/filename.jpg
          const urlParts = banner.AdImageUrl.split("/");
          const fileNameWithExt = urlParts[urlParts.length - 1];
          const fileName = fileNameWithExt.split(".")[0];
          const publicId = `banners/${fileName}`;

          await cloudinary.uploader.destroy(publicId);
        } catch (deleteErr) {
          console.error("Error deleting old image:", deleteErr);
        }
      }
    }

    const updatedBanner = await Banner.findByIdAndUpdate(id, updatedFields, {
      new: true,
    });
    res
      .status(200)
      .json({ msg: "Banner updated successfully", data: updatedBanner });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to update banner", error: err.message });
  }
};

// FETCH ALL WITH PAGINATION
const fetchAllBanners = async (req, res) => {
  try {
    // ----- 1. Safe pagination -----
    const page = Math.max(parseInt(req.query.page) || 1, 1);  // at least 1
    const limit = Math.max(parseInt(req.query.limit) || 10, 1); // at least 1
    const skip = (page - 1) * limit;

    // ----- 2. AUTO-EXPIRE BANNERS -----
    const now = new Date();

    // Expire banners that are past endDate and still active
    await Banner.updateMany(
      { endDate: { $lt: now }, isActive: true },
      { $set: { isActive: false } }
    );

    // ----- 3. Build query filter -----
    // When `all=true` (admin panel), return every banner regardless of status.
    // Otherwise (user-facing app), return only active banners.
    const showAll = req.query.all === "true";
    const filter = showAll ? {} : { isActive: true };

    // ----- 4. Fetch banners -----
    const banners = await Banner.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // ----- 5. Total count for pagination -----
    const totalItems = await Banner.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    // ----- 6. Respond to client -----
    res.status(200).json({
      msg: "Banners fetched successfully",
      data: banners,
      page,
      totalPages,
      totalItems,
    });

  } catch (err) {
    console.error("Banner fetch error:", err.message);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};


const getEachBanner = async (req, res) => {
  try {
    const id = req.params.id;
    const banner = await Banner.findById(id);
    if (!banner) return res.status(404).json({ msg: "Banner not found" });

    res.status(200).json({ msg: "Banner fetched successfully", data: banner });
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch banner", error: err.message });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const id = req.params.id;
    const banner = await Banner.findByIdAndDelete(id);
    res.status(200).json({
      msg: "banner deleted successfully",
    });
  } catch (err) {
    res
      .status(500)
      .json({ msg: "Failed to delete banner", error: err.message });
  }
};

export { createBanner, fetchAllBanners, updateBanner, getEachBanner, deleteBanner };
