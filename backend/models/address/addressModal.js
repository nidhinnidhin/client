const mongoose = require('mongoose')


const AddressSchema = new mongoose.Schema({
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    fullName: { 
      type: String, 
      required: true 
    },
    mobileNumber: { 
      type: String, 
      required: true 
    },
    pincode: { 
      type: String, 
      required: true 
    },
    locality: { 
      type: String, 
      required: true 
    },
    address: { 
      type: String, 
      required: true 
    },
    city: { 
      type: String, 
      required: true 
    },
    state: { 
      type: String, 
      required: true 
    },
    landmark: { 
      type: String 
    },
    alternatePhone: { 
      type: String 
    },
    addressType: { 
      type: String, 
      enum: ['Home', 'Work'], 
      required: true 
    },
    isUsedInOrder: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    coordinates: {
      type: {
        latitude: Number,
        longitude: Number
      },
      required: false
    }
  }, { timestamps: true });
  
  const Address = mongoose.model('Address', AddressSchema);
  module.exports = Address;