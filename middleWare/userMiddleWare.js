import AsyncHandler from 'express-async-handler'
import User from '../models/userSchema.js'
import jwt from 'jsonwebtoken'

const protect = AsyncHandler(async (req, res, next) => {
  try {
    let token = req.headers.token;
    if (!token && req.headers.authorization) {
      if (req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      } else {
        token = req.headers.authorization;
      }
    }

    if (!token) {
      return res.status(401).json({ msg: 'Not authorized, no token provided' });
    }

    let decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    let isUser = await User.findOne({ _id: decoded.id });
    if (!isUser) {
      return res.status(401).json({ msg: 'No user found..' });
    } else {
      req.user = isUser;
      next();
    }
  } catch (error) {
    return res.status(401).json({ msg: 'Not authorized, token failed' });
  }
});

export default protect