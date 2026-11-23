const { Schema, model, Types } = require('../db/odm');

const commSchema = new Schema(
  {
    type: { type: String, enum: ['call', 'email', 'meeting', 'whatsapp', 'note', 'other'], default: 'note' },
    summary: { type: String, required: true, maxlength: 2000 },
    by: { type: Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now }
  },
  { _id: true }
);

const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 160 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, maxlength: 30 },
    country: { type: String, trim: true, maxlength: 80 },
    service: { type: String, trim: true, maxlength: 120 },
    budget: { type: String, trim: true, maxlength: 80 },
    preferredContact: { type: String, enum: ['email', 'phone', 'whatsapp', 'any', ''], default: '' },
    source: { type: String, default: 'Website Contact Form', trim: true, maxlength: 80 },
    isQuoteRequest: { type: Boolean, default: false },
    description: { type: String, maxlength: 5000 },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Discussion', 'Quotation Sent', 'Negotiation', 'Won', 'Lost'],
      default: 'New',
      index: true
    },
    assignedTo: { type: Types.ObjectId, ref: 'User', index: true },
    followUpDate: Date,
    notes: { type: String, maxlength: 5000 },
    communications: [commSchema],
    convertedClient: { type: Types.ObjectId, ref: 'Client' },
    convertedProject: { type: Types.ObjectId, ref: 'Project' },
    emailStatus: {
      agencyNotified: { type: Boolean, default: false },
      acknowledgementSent: { type: Boolean, default: false },
      lastError: String
    },
    submittedIp: String,
    // Set when the CRM has created the "new enquiry" notification for a website lead.
    notifiedAt: Date,
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ email: 1, createdAt: -1 });

module.exports = model('Lead', leadSchema);
