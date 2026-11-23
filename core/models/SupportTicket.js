const { Schema, model, Types } = require('../db/odm');

const replySchema = new Schema(
  {
    from: { type: String, enum: ['client', 'admin'], required: true },
    authorName: String,
    message: { type: String, required: true, maxlength: 4000 },
    at: { type: Date, default: Date.now }
  },
  { _id: true }
);

const ticketSchema = new Schema(
  {
    number: { type: String, unique: true },
    client: { type: Types.ObjectId, ref: 'Client', required: true, index: true },
    project: { type: Types.ObjectId, ref: 'Project' },
    subject: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 4000 },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open', index: true },
    replies: [replySchema]
  },
  { timestamps: true }
);

module.exports = model('SupportTicket', ticketSchema);
