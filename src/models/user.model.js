const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minLength: 6,
    trim: true,
    select: false
  },
  userImage: {
    type: String,
    trim: true,
    default: "https://upload.wikimedia.org/wikipedia/commons/5/59/User-avatar.svg"
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  gender: {
    type: String,
    enum: ['Male', 'Female']
  },
  location: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  workshops: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workshop'
  }],
  hasChosenPath: {
    type: Boolean,
    default: false
  },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema);      