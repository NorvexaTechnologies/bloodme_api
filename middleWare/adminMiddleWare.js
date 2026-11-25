import AsyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import Admin from "../models/adminSchema.js";

const protectAdmin = AsyncHandler(async (req, res, next) => {
  try {
    let token = req.headers.token;
    if (!token && req.headers.authorization) {
      if (req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
      } else {
        token = req.headers.authorization;
      }
    }

    if (!token) {
      return res.status(401).json({ msg: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return res.status(401).json({ msg: "Admin not found" });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(401).json({ msg: "Not authorized, invalid token" });
  }
});

export default protectAdmin;
