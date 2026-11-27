const { Schema, model, Types } = require('../db/odm');

/**
 * A Payment is a CONFIRMED receipt of money. Nothing is created automatically;
 * an admin must record it. Payments are never hard deleted: a wrong entry is
 * voided (status = 'voided') so financial history and audit trail stay intact.
 */
const paymentSchema = new Schema(
  {
    receiptNumber: { type: String, unique: true, index: true },
    client: { type: Types.ObjectId, ref: 'Client', index: true },
    project: { type: Types.ObjectId, ref: 'Project', index: true },
    invoice: { type: Types.ObjectId, ref: 'Invoice', index: true },
    milestone: { type: Types.ObjectId, ref: 'Milestone' },
    amount: { type: Number, required: true, min: 0.01 },
    paymentType: { type: String, enum: ['Advance', 'Milestone', 'Final', 'Partial', 'Other Income'], required: true },
    method: { type: String, enum: ['Bank Transfer', 'UPI', 'Cash', 'Other'], required: true },
    paidOn: { type: Date, required: true, index: true },
    reference: { type: String, maxlength: 120 }, // txn id / UTR (not logged in audit)
    notes: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['confirmed', 'voided'], default: 'confirmed', index: true },
    voidedAt: Date,
    voidedBy: { type: Types.ObjectId, ref: 'User' },
    voidReason: String,
    recordedBy: { type: Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

paymentSchema.index({ paidOn: -1 });

module.exports = model('Payment', paymentSchema);
