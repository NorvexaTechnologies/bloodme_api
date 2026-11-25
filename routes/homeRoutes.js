import express from 'express';
import { getHomeData } from '../controllers/homeController.js';
import protect from '../middleWare/userMiddleWare.js';

const router = express.Router();

// Public data, but uses protect to identify user if token present (optional)
// If you want it strict, use protect. If you want it public, remove protect.
// Using a soft version of protect if possible, or just optional auth.
// For now, I'll follow the pattern in app.js. I'll make it unprotected first
// since banners are usually public, but requests might need context.

router.post('/', protect, getHomeData);

export default router;
