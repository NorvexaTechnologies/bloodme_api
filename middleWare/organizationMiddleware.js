import AsyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import Organization from "../models/organizationSchema.js";

const protectOrganization = AsyncHandler(async (req, res, next) => {
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

    const org = await Organization.findById(decoded.id);

    if (!org) {
      return res.status(401).json({ msg: "Organization not found" });
    }

    req.organization = org;
    next();
  } catch (error) {
    console.error("Organization auth error:", error);
    return res.status(401).json({ msg: "Not authorized, invalid token" });
  }
});

export default protectOrganization;