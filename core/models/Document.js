const { Schema, model, Types } = require('../db/odm');

/** Metadata only. The bytes live on disk (or S3 in production) under `storageKey`. */
const documentSchema = new Schema(
  {
    originalName: { type: String, required: true, maxlength: 255 },
    storageKey: { type: String, required: true, unique: true, select: false },
    mimeType: String,
    size: Number,
    category: {
      type: String,
      enum: ['Agreement', 'Quotation', 'Invoice', 'Receipt', 'Project File', 'Handover', 'Certificate', 'Expense Receipt', 'Other'],
      default: 'Other'
    },
    client: { type: Types.ObjectId, ref: 'Client', index: true },
    project: { type: Types.ObjectId, ref: 'Project', index: true },
    task: { type: Types.ObjectId, ref: 'Task', index: true },
    visibleToClient: { type: Boolean, default: false },
    uploadedBy: { type: Types.ObjectId, ref: 'User' },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date
  },
  { timestamps: true }
);

module.exports = model('Document', documentSchema);
