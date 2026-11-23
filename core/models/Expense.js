const { Schema, model, Types } = require('../db/odm');

const CATEGORIES = [
  'Project Expense', 'Domain', 'Hosting', 'Software Subscription', 'Marketing',
  'Employee / Freelancer Payment', 'Travel', 'Other'
];

const expenseSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', index: true }, // empty => company-wide
    category: { type: String, enum: CATEGORIES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 2000 },
    amount: { type: Number, required: true, min: 0.01 },
    expenseDate: { type: Date, required: true, index: true },
    method: { type: String, enum: ['Bank Transfer', 'UPI', 'Cash', 'Card', 'Other'], default: 'Bank Transfer' },
    vendor: { type: String, maxlength: 120 },
    receipt: { type: Types.ObjectId, ref: 'Document' },
    renewalDate: Date, // domain/hosting/subscription renewal reminders
    isRecurring: { type: Boolean, default: false },
    paidBy: { type: Types.ObjectId, ref: 'User' },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

expenseSchema.statics.CATEGORIES = CATEGORIES;
expenseSchema.index({ expenseDate: -1 });

module.exports = model('Expense', expenseSchema);
