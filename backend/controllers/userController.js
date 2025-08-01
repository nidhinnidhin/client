const User = require("../models/userModel");
const asyncHandler = require("express-async-handler");
const bcrypt = require("bcrypt");
const Jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");
const Otp = require("../models/otp/signUpSendOtpModel");
const nodemailer = require("nodemailer");
const Wallet = require("../models/wallet/walletModel");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// const validateEmail = (email) => {
//   const emailRegex = /^[A-Za-z0-9._%+-]{3,}@gmail\.com$/;
//   return emailRegex.test(email);
// };

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const registerUser = asyncHandler(async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    console.log("Registration attempt for email:", email);

    // Validate required fields
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const textRegex = /^[A-Za-z0-9_]+$/;

    if (!textRegex.test(username)) {
      return res.status(400).json({
        message:
          "Username should only contain letters, numbers and underscores.",
      });
    }

    if (username.length <= 3) {
      return res
        .status(400)
        .json({ message: "Username must be more than 3 characters long." });
    }

    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;
    if (password.length < 8 || !specialCharRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and contain at least one special character.",
      });
    }

    const existUser = await User.findOne({
      $or: [{ email }, { username }],
    });
    if (existUser) {
      return res.status(400).json({
        message:
          existUser.email === email
            ? "Email already exists"
            : "Username already exists",
      });
    }

    // Check if password matches confirmPassword (case-sensitive)
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
    });

    await user.save();

    // Create wallet for new user
    await Wallet.create({
      userId: user._id,
      balance: 0,
      transactions: [],
    });

    const token = Jwt.sign(
      { id: user._id, username, email },
      process.env.JWT_SECRET || "1921u0030",
      { expiresIn: "30d" }
    );

    res.status(201).json({
      message: "Registration successful!",
      token,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({
      message: "Registration failed",
      error: err.message,
    });
  }
});
const loginUser = asyncHandler(async (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET || "1921u0030";
  try {
    const { email, password } = req.body;

    // if (!validateEmail(email)) {
    //   return res
    //     .status(400)
    //     .json({
    //       message: "Email must have at least 3 characters before @gmail.com",
    //     });
    // }

    const existUser = await User.findOne({ email });
    if (!existUser) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (existUser.isDeleted) {
      return res.status(400).json({
        message: "You are temporarily blocked. Please contact admin.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, existUser.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = Jwt.sign(
      { id: existUser._id, email: existUser.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const getUserProfile = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get wallet details
    const wallet = await Wallet.findOne({ userId });
    const referralTransactions = wallet?.transactions.filter((t) =>
      t.description.includes("referral")
    );

    res.status(200).json({
      message: "User profile fetched successfully",
      user: {
        ...user.toObject(),
        referralEarnings:
          referralTransactions?.reduce((sum, t) => sum + t.amount, 0) || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "An error occurred", error: err.message });
  }
});

const updateUserProfile = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { firstname, lastname, username, email } = req.body;

    let user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for existing email or username conflicts
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
      _id: { $ne: id }, // Exclude the current user from search
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? "Email already exists"
            : "Username already exists",
      });
    }

    // Upload new profile image if provided
    let imageUrl = user.image;
    if (req.file) {
      const cloudinaryResponse = await cloudinary.uploader.upload(
        req.file.path,
        {
          folder: "uploads",
          use_filename: true,
          unique_filename: false,
        }
      );
      imageUrl = cloudinaryResponse.secure_url;
    }

    // Update user details
    user.firstname = firstname || user.firstname;
    user.lastname = lastname || user.lastname;
    user.username = username || user.username;
    user.email = email || user.email;
    user.image = imageUrl;

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        firstname: user.firstname,
        lastname: user.lastname,
        username: user.username,
        email: user.email,
        image: user.image,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "An error occurred", error: err.message });
  }
});

const forgotPasswordSendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user found with this email" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 minute expiry

    await Otp.findOneAndUpdate(
      { email },
      { otp, expiresAt },
      { upsert: true, new: true }
    );

    // Send email using your existing transporter
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP for password reset is ${otp}. It will expire in 1 minute.`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Password reset OTP sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error sending OTP", error: error.message });
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Verify OTP
    const otpDoc = await Otp.findOne({ email });
    if (!otpDoc) {
      return res.status(404).json({ message: "No OTP found for this email" });
    }

    if (otpDoc.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (otpDoc.expiresAt < new Date()) {
      await Otp.deleteOne({ email });
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await User.findOneAndUpdate({ email }, { password: hashedPassword });

    // Delete used OTP
    await Otp.deleteOne({ email });

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error resetting password", error: error.message });
  }
});

const verifyForgotPasswordOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const otpRecord = await Otp.findOne({ email });

    if (!otpRecord) {
      return res.status(404).json({ message: "No OTP found for this email" });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (otpRecord.expiresAt < new Date()) {
      // Delete expired OTP
      await Otp.deleteOne({ email });
      return res.status(400).json({
        message: "OTP has expired. Please request a new one.",
        expired: true,
      });
    }

    // Don't delete the OTP yet as it's needed for the password reset step
    res.status(200).json({
      message: "OTP verified successfully",
      verified: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error verifying OTP",
      error: error.message,
    });
  }
});

const resendForgotPasswordOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 minute expiry

    // Update or create new OTP record
    await Otp.findOneAndUpdate(
      { email },
      { otp, expiresAt },
      { upsert: true, new: true }
    );

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your new OTP for password reset is ${otp}. It will expire in 1 minute.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      message: "New OTP sent successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error sending new OTP",
      error: error.message,
    });
  }
});

const resetUserPassword = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id; // Get user ID from auth middleware
    const { oldPassword, newPassword } = req.body;

    // Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate password format
    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;
    if (newPassword.length < 8 || !specialCharRegex.test(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and contain at least one special character",
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "An error occurred", error: err.message });
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:9090/api/users/auth/google/callback",
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          // Update Google ID if user exists but doesn't have one
          if (!user.googleId) {
            user.googleId = profile.id;
            await user.save();
          }
        } else {
          // Create new user
          const username = `${profile.name.givenName}${Math.random()
            .toString(36)
            .slice(2, 8)}`.toLowerCase();

          user = await User.create({
            googleId: profile.id,
            firstname: profile.name.givenName,
            lastname: profile.name.familyName,
            username: username,
            email: profile.emails[0].value,
            image: profile.photos[0].value,
            password: null,
          });

          // Create wallet for new user
          await Wallet.create({
            userId: user._id,
            balance: 0,
            transactions: [],
          });
        }

        // Generate JWT token
        const token = Jwt.sign(
          { id: user._id, email: user.email },
          process.env.JWT_SECRET || "1921u0030",
          { expiresIn: "30d" }
        );

        return done(null, { token, user });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Add these passport serialization methods
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

const updateEmailSendOtp = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if email already exists for another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes expiry

    await Otp.findOneAndUpdate(
      { email },
      { otp, expiresAt, newEmail: email },
      { upsert: true, new: true }
    );

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Update OTP",
      text: `Your OTP for email update is ${otp}. It will expire in 2 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error sending OTP", error: error.message });
  }
});

const verifyUpdateEmailOtp = asyncHandler(async (req, res) => {
  try {
    const { email, otp } = req.body;
    const userId = req.user.id;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpDoc = await Otp.findOne({ email });
    if (!otpDoc) {
      return res.status(400).json({ message: "Please request a new OTP" });
    }

    if (otpDoc.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (otpDoc.expiresAt < new Date()) {
      await Otp.deleteOne({ email });
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    // Update user's email
    const user = await User.findById(userId);
    user.email = email;
    await user.save();

    // Delete the OTP document
    await Otp.deleteOne({ email });

    // Generate new token with updated email
    const token = Jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || "1921u0030",
      { expiresIn: "30d" }
    );

    res.status(200).json({
      message: "Email updated successfully",
      token,
      user: {
        email: user.email,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating email", error: error.message });
  }
});

const resendUpdateEmailOtp = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes expiry

    await Otp.findOneAndUpdate(
      { email },
      { otp, expiresAt },
      { upsert: true, new: true }
    );

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Update OTP",
      text: `Your new OTP for email update is ${otp}. It will expire in 2 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "New OTP sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error sending new OTP", error: error.message });
  }
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  resetPassword,
  forgotPasswordSendOtp,
  verifyForgotPasswordOtp,
  resendForgotPasswordOtp,
  resetUserPassword,
  updateEmailSendOtp,
  verifyUpdateEmailOtp,
  resendUpdateEmailOtp,
};