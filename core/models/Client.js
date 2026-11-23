const { Schema, model, Types } = require('../db/odm');

const clientSchema = new Schema(
  {
    clientCode: { type: String, unique: true, index: true },
    company: { type: String, trim: true, maxlength: 160 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, maxlength: 30 },
    address: { type: String, trim: true, maxlength: 400 },
    city: String,
    state: String,
    country: { type: String, trim: true, maxlength: 80 },
    gstin: { type: String, trim: true, maxlength: 20 },
    clientType: { type: String, enum: ['Individual', 'Startup', 'SME', 'Enterprise', 'Agency', 'Other'], default: 'Individual' },
    notes: { type: String, maxlength: 5000 },
    sourceLead: { type: Types.ObjectId, ref: 'Lead' },
    portalUser: { type: Types.ObjectId, ref: 'User' },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);


module.exports = model('Client', clientSchema);
