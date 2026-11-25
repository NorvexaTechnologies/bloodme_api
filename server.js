import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
    
    // ✅ UPDATED: Listen on 0.0.0.0 to allow mobile device access
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Local: http://localhost:${PORT}`);
      console.log(`📱 Network: http://YOUR_IP:${PORT}`);
      console.log(`🧪 Test endpoint: http://YOUR_IP:${PORT}`);
    });
  })
  .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

