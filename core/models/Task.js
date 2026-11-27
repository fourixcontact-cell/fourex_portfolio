const { Schema, model, Types } = require('../db/odm');

const commentSchema = new Schema(
  {
    by: { type: Types.ObjectId, ref: 'User' },
    byName: String,
    text: { type: String, required: true, maxlength: 2000 },
    at: { type: Date, default: Date.now }
  },
  { _id: true }
);

const taskSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    milestone: { type: Types.ObjectId, ref: 'Milestone' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 4000 },
    assignedTo: { type: Types.ObjectId, ref: 'User', index: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    dueDate: Date,
    status: { type: String, enum: ['To Do', 'In Progress', 'Review', 'Completed'], default: 'To Do', index: true },
    order: { type: Number, default: 0 },
    area: { type: String, enum: ['Development', 'UI/UX', 'Client Communication', 'Lead Acquisition', 'Deployment', 'Documentation', 'Other'], default: 'Development' },
    comments: [commentSchema],
    completedAt: Date,
    completedBy: { type: Types.ObjectId, ref: 'User' },
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

taskSchema.index({ project: 1, status: 1, order: 1 });
taskSchema.index({ dueDate: 1, status: 1 });

module.exports = model('Task', taskSchema);
