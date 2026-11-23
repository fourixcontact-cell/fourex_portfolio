const { Schema, model, Types } = require('../db/odm');

const auditSchema = new Schema(
  {
    adminId: { type: Types.ObjectId, ref: 'User', index: true },
    adminName: String,
    adminEmail: String,
    actorType: { type: String, enum: ['admin', 'client', 'system', 'public'], default: 'admin' },
    action: { type: String, required: true, index: true }, // e.g. LOGIN, CREATE, UPDATE, DELETE
    module: { type: String, required: true, index: true }, // e.g. auth, project, quotation
    recordId: String,
    description: String,
    oldValues: Types.Mixed,
    newValues: Types.Mixed,
    ip: String,
    device: String,
    createdAt: { type: Date, default: Date.now, index: true, immutable: true }
  },
  { versionKey: false, strict: true, appendOnly: true }
);

auditSchema.index({ module: 1, recordId: 1, createdAt: -1 });

// Append-only: the ODM rejects every update/delete path and any save() of an existing record.

module.exports = model('AuditLog', auditSchema);
