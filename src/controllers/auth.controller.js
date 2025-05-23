const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Notification = require('../models/notification.model');
const { sendMail } = require('../utils/email.transport');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// @desc    Register a new user
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    // validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required!" });
    }
    // check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists!" });
    }
    // hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // create new user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role
    })
    // check if user is created successfully
    if (!newUser) {
      return res.status(400).json({ success: false, message: "User not created!" });
    }
    
    // save new user to db
    const savedUser = await newUser.save();
    const userWithoutPassword = savedUser.toObject();
    delete userWithoutPassword.password; // remove password from user object

    // Send notification to user
    const notification = await Notification.create({
      userId: savedUser._id,
      type: 'signup',
      message: `${ savedUser.firstName } just registered on the platform!`,
    });
    if (!notification) {
      return res.status(400).json({ success: false, message: "Notification not sent!" });
    }

    res.status(201).json({ success: true, message: "User registered successfully!", user: userWithoutPassword });
  } catch (err) {
    console.error("Error in registering user: ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

// @desc    sign in user
exports.signIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    // validation
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required!" });
    };
    /// check if user exists
    const existingUser = await User.findOne({ email }).select("+password");
    if (!existingUser) {
      return res.status(400).json({ success: false, message: "User does not exist!" });
    }
    // check password
    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "User does not exist!" });
    }
    // generate token
    const accessToken = jwt.sign({ 
      id: existingUser._id, 
      email: existingUser.email, 
      role: existingUser.role, 
      tokenVersion: existingUser.tokenVersion 
    }, 
    process.env.PRIVATE_KEY, { expiresIn : "1d" });
    // check if token is generated successfully
    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Token not generated!" });
    }

    // remove password from user object
    const { password: _ , ...userObject } = existingUser._doc; 
    const user = { ...userObject };
    // ALT 
    // const userObject = existingUser.toObject();
    // delete userObject.password;

    // set secure HTTP-only cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.status(200).json({ success: true, message: "User signed in successfully!", user, token: accessToken });
  } catch (err) {
    console.log("Error in signing in user: ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
} 

// @desc    sign out user

exports.signOut = async (req, res) => {
  try {
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
    });
    res.status(200).json({ success: true, message: "User signed out successfully!" });
  } catch (err) {
    console.log("Error in signing out user: ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

// @desc    forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    // validation
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required!" });
    }
    // check if user exists
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(400).json({ success: false, message: "User does not exist!" });
    }
    // generate reset token

    // const resetToken = jwt.sign({ id: existingUser._id, email: existingUser.email }, process.env.PRIVATE_KEY, { expiresIn: "1h" });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    // save reset token to user
    existingUser.resetToken = hashedToken;
    existingUser.resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour expiry
    // save user to db
    await existingUser.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`; 
    // send email to user with reset token
    const emailData = {
      email,
      subject: "Reset Your Password",
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password: This link will expire in 1 hour.</p>
        <a href="${resetLink}" style="text-decoration: none;">
          <button style="background-color: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
            Reset Password
          </button>
        </a>
        <p>If you did not request this, please ignore this email.</p>
      `,
    };
    await sendMail(emailData);

    // send notification to user
    // const notification = await Notification.create({
    //   userId: existingUser._id,
    //   type: 'forgot-password',
    //   message: `A password reset link has been sent to ${ email }`,
    // });
    // if (!notification) {
    //   return res.status(400).json({ success: false, message: "Notification not sent!" });
    // }
    res.status(200).json({ success: true, message: "Password reset link sent to your email!" });

  } catch (err) {
    console.log("Error in forgot password:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

// @desc     reset password
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword, resetToken } = req.body;
    // validation
    if (!newPassword || !resetToken) {
      return res.status(400).json({ success: false, message: "All fields are required!" });
    }
    // verify token
    // const decoded = jwt.verify(resetToken, process.env.PRIVATE_KEY);
    // if (!decoded) {
    //   return res.status(400).json({ success: false, message: "Invalid or expired token!" });
    // }
    // const existingUser = await User.findById(decoded.id).select("+password");

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const existingUser = await User.findOne({ resetToken: hashedToken, resetTokenExpiry: { $gt: Date.now() } }).select("+password");

    // check if user exists
    if (!existingUser) {
      return res.status(400).json({ success: false, message: "User does not exist!" });
    }
    // hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    // update password
    existingUser.password = hashedPassword;
    existingUser.resetToken = undefined; // remove reset token
    existingUser.resetTokenExpiry = undefined; // remove reset token expiry
    existingUser.tokenVersion += 1; // increment token version
    // save user to db
    await existingUser.save();
    
    res.status(200).json({ success: true, message: "Password reset successfully!" });
  } catch (err) {
    console.log("Error in resetting password:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

// @desc     change password
exports.changePassword = async (req, res) => {
  try {
    const { userId } = req.user;
    const { oldPassword, newPassword } = req.body;
    // validation
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "All fields are required!" });
    }
    // check if user exists
    const existingUser = await User.findById(userId).select("+password");
    if (!existingUser) {
      return res.status(400).json({ success: false, message: "User does not exist!" });
    }
    // check password
    const isPasswordValid = await bcrypt.compare(oldPassword, existingUser.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Invalid password!" });
    }
    // hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    // update password
    existingUser.password = hashedPassword || existingUser.password;
    existingUser.tokenVersion += 1; // increment token version
    // save user to db
    await existingUser.save();
    
    res.status(200).json({ success: true, message: "Password changed successfully!" });
  } catch (err) {
    console.log("Error in changing password:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

exports.forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
})