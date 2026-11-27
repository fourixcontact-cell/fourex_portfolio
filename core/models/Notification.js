const { Schema, model, Types, hashId } = require('../db/odm');

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['new_lead', 'deadline', 'overdue_task', 'pending_payment', 'quotation_expiry', 'enquiry', 'project_completed', 'change_request', 'renewal', 'ticket', 'system'],
      required: true
    },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, maxlength: 1000 },
    link: String, // frontend route
    // dedupeKey stops the daily scanner from creating the same alert repeatedly
    dedupeKey: { type: String }, // unique + sparse index declared below (single definition)
    audience: { type: String, enum: ['admin', 'client'], default: 'admin' },
    forClient: { type: Types.ObjectId, ref: 'Client', index: true },
    readBy: [{ type: Types.ObjectId, ref: 'User' }],
    // Admin ids that have NOT read this yet. Lets Firestore count unread items with one
    // array-contains aggregation instead of scanning every notification.
    unreadBy: [{ type: Types.ObjectId, ref: 'User' }]
  },
  {
    timestamps: true,
    // A dedupeKey maps to a fixed document id, so the same alert can never be stored twice
    // (Firestore equivalent of the old unique index).
    naturalId: (d) => (d.dedupeKey ? hashId(`notification:${d.dedupeKey}`) : undefined)
  }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = model('Notification', notificationSchema);
