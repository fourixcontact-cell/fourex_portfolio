const { Schema, model, Types } = require('../db/odm');

const STATUSES = ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Testing', 'Client Review', 'Completed', 'Cancelled'];

const checklistItem = new Schema(
  {
    label: { type: String, required: true },
    done: { type: Boolean, default: false },
    doneBy: { type: Types.ObjectId, ref: 'User' },
    doneAt: Date
  },
  { _id: true }
);

const changeRequestSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 4000 },
    requestedBy: { type: String, enum: ['client', 'admin'], default: 'admin' },
    requesterName: String,
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Implemented'], default: 'Pending' },
    estimatedCost: { type: Number, default: 0, min: 0 },
    decisionNote: String,
    createdAt: { type: Date, default: Date.now },
    decidedAt: Date
  },
  { _id: true }
);

const feedbackSchema = new Schema(
  {
    rating: { type: Number, min: 1, max: 5 },
    message: { type: String, maxlength: 4000 },
    from: { type: String, enum: ['client', 'admin'], default: 'client' },
    authorName: String,
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const contributionSchema = new Schema(
  {
    admin: { type: Types.ObjectId, ref: 'User', required: true },
    area: {
      type: String,
      enum: ['Development', 'UI/UX', 'Client Communication', 'Lead Acquisition', 'Deployment', 'Documentation', 'Other'],
      required: true
    },
    hours: { type: Number, min: 0, default: 0 },
    note: { type: String, maxlength: 1000 },
    at: { type: Date, default: Date.now }
  },
  { _id: true }
);

const DEFAULT_CHECKLIST = [
  'Final source code delivered / repository access transferred',
  'Production deployment verified',
  'Client acceptance / sign-off received',
  'Credentials and access handed over securely',
  'Documentation and user guide delivered',
  'Final invoice raised',
  'Final payment received or settlement agreed',
  'Backups and domain / hosting details handed over'
];

const projectSchema = new Schema(
  {
    projectId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    client: { type: Types.ObjectId, ref: 'Client', required: true, index: true },
    category: {
      type: String,
      enum: ['MERN Stack', 'Java / Spring Boot', 'React Native', 'Python / Django', 'WordPress', 'UI/UX Design', 'DevOps & Cloud', 'Maintenance', 'Other'],
      default: 'MERN Stack'
    },
    description: { type: String, maxlength: 6000 },
    techStack: [{ type: String, trim: true, maxlength: 60 }],
    quotationAmount: { type: Number, default: 0, min: 0 },
    acceptedAmount: { type: Number, default: 0, min: 0 },
    advanceAmount: { type: Number, default: 0, min: 0 },
    // Derived, recomputed from Payment + Expense collections by financeService.refreshProjectTotals
    amountReceived: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    startDate: Date,
    expectedDeadline: Date,
    completionDate: Date,
    status: { type: String, enum: STATUSES, default: 'Not Started', index: true },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    team: [{ type: Types.ObjectId, ref: 'User' }],
    githubUrl: { type: String, trim: true, maxlength: 300 },
    liveUrl: { type: String, trim: true, maxlength: 300 },
    internalNotes: { type: String, maxlength: 8000 },
    sourceLead: { type: Types.ObjectId, ref: 'Lead' },
    sourceQuotation: { type: Types.ObjectId, ref: 'Quotation' },

    // Public portfolio (admin controlled)
    portfolio: {
      visible: { type: Boolean, default: false, index: true },
      title: String,
      summary: { type: String, maxlength: 600 },
      caseStudy: { type: String, maxlength: 12000 },
      coverImage: String, // URL to a public image, never a private upload
      screenshots: [String],
      featured: { type: Boolean, default: false },
      clientDisplayName: String // optional, only shown if admin chooses
    },

    handoverChecklist: { type: [checklistItem], default: () => DEFAULT_CHECKLIST.map((label) => ({ label })) },
    handoverConfirmed: { confirmed: { type: Boolean, default: false }, by: { type: Types.ObjectId, ref: 'User' }, at: Date },
    changeRequests: [changeRequestSchema],
    feedback: [feedbackSchema],
    contributions: [contributionSchema],

    certificate: {
      number: String,
      issuedAt: Date,
      issuedBy: { type: Types.ObjectId, ref: 'User' },
      file: String, // storage key
      regenerations: { type: Number, default: 0 }
    },

    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

projectSchema.index({ expectedDeadline: 1, status: 1 });
projectSchema.index({ createdAt: -1 });

projectSchema.statics.STATUSES = STATUSES;
projectSchema.statics.DEFAULT_CHECKLIST = DEFAULT_CHECKLIST;

projectSchema.virtual('checklistComplete').get(function checklistComplete() {
  return this.handoverChecklist.length > 0 && this.handoverChecklist.every((i) => i.done);
});

module.exports = model('Project', projectSchema);
