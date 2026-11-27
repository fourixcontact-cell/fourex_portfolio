const { Schema, model, Types } = require('../db/odm');

const itemSchema = new Schema(
  {
    description: { type: String, required: true, maxlength: 400 },
    quantity: { type: Number, required: true, min: 0.01, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, default: 0 }
  },
  { _id: true }
);

const milestonePay = new Schema(
  { name: String, percentage: { type: Number, min: 0, max: 100 }, amount: Number, dueNote: String },
  { _id: false }
);

const revisionSchema = new Schema(
  {
    revision: Number,
    by: { type: Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
    grandTotal: Number,
    note: String
  },
  { _id: false }
);

const quotationSchema = new Schema(
  {
    number: { type: String, unique: true, index: true },
    revision: { type: Number, default: 1 },
    revisions: [revisionSchema],
    client: { type: Types.ObjectId, ref: 'Client', index: true },
    lead: { type: Types.ObjectId, ref: 'Lead' },
    project: { type: Types.ObjectId, ref: 'Project', index: true },
    // Snapshot so the PDF never changes if the client record is edited later
    clientSnapshot: { company: String, contactPerson: String, email: String, phone: String, address: String, country: String, gstin: String },
    quotationDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    projectName: { type: String, required: true, trim: true, maxlength: 160 },
    projectDescription: { type: String, maxlength: 4000 },
    scopeOfWork: [{ type: String, maxlength: 500 }],
    deliverables: [{ type: String, maxlength: 500 }],
    techStack: [{ type: String, maxlength: 60 }],
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, default: 0 },
    discountType: { type: String, enum: ['flat', 'percent'], default: 'flat' },
    discountValue: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0 },
    taxName: { type: String, default: 'GST' },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    paymentTerms: { type: String, maxlength: 2000 },
    advancePercent: { type: Number, default: 0, min: 0, max: 100 },
    advanceAmount: { type: Number, default: 0 },
    milestonePayments: [milestonePay],
    deliveryTimeline: { type: String, maxlength: 500 },
    terms: { type: String, maxlength: 6000 },
    notes: { type: String, maxlength: 3000 },
    status: { type: String, enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired'], default: 'Draft', index: true },
    sentAt: Date,
    viewedAt: Date, // only set when the client actually opens the tracked link
    respondedAt: Date,
    viewToken: { type: String, select: false, index: true },
    showInPortal: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

quotationSchema.index({ createdAt: -1 });
quotationSchema.index({ expiryDate: 1, status: 1 });

module.exports = model('Quotation', quotationSchema);
