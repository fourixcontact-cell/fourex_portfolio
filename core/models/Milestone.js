const { Schema, model, Types } = require('../db/odm');

const milestoneSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 2000 },
    dueDate: Date,
    paymentAmount: { type: Number, default: 0, min: 0 }, // planned amount; NOT income until a Payment is recorded
    status: { type: String, enum: ['Pending', 'In Progress', 'Completed'], default: 'Pending' },
    completedAt: Date,
    order: { type: Number, default: 0 },
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = model('Milestone', milestoneSchema);
