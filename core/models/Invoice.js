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

const invoiceSchema = new Schema(
  {
    number: { type: String, unique: true, index: true },
    client: { type: Types.ObjectId, ref: 'Client', required: true, index: true },
    project: { type: Types.ObjectId, ref: 'Project', index: true },
    quotation: { type: Types.ObjectId, ref: 'Quotation' },
    clientSnapshot: { company: String, contactPerson: String, email: String, phone: String, address: String, country: String, gstin: String },
    projectName: String,
    invoiceType: { type: String, enum: ['Advance', 'Milestone', 'Final', 'Partial', 'Full'], default: 'Full' },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxName: { type: String, default: 'GST' },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    // Derived from confirmed Payment records only
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'], default: 'Draft', index: true },
    notes: { type: String, maxlength: 3000 },
    paymentInstructions: { type: String, maxlength: 2000 },
    sentAt: Date,
    lastReminderAt: Date,
    reminderCount: { type: Number, default: 0 },
    showInPortal: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ createdAt: -1 });

module.exports = model('Invoice', invoiceSchema);
