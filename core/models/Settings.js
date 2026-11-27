const { Schema, model, Types, hashId } = require('../db/odm');

const serviceSchema = new Schema({
  icon: { type: String, default: '' },
  title: { type: String, required: true },
  text: { type: String, required: true },
  points: { type: [String], default: [] }
}, { _id: false });

const technologySchema = new Schema({
  group: { type: String, required: true },
  icon: { type: String, default: '' },
  items: { type: [Types.Mixed], default: [] }
}, { _id: false });

const contentCardSchema = new Schema({
  icon: { type: String, default: '' },
  title: { type: String, required: true },
  text: { type: String, required: true }
}, { _id: false });

/** Single-document settings collection (key = 'agency'). */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'agency', unique: true },
    agencyName: String,
    tagline: String,
    address: String,
    phone: String,
    email: String,
    website: String,
    gstin: String,
    signatory: String,
    bankDetails: String,
    defaultTaxName: { type: String, default: 'GST' },
    defaultTaxRate: { type: Number, default: 18 },
    defaultCurrency: { type: String, default: 'INR' },
    quotationValidityDays: { type: Number, default: 15 },
    invoiceDueDays: { type: Number, default: 7 },
    defaultPaymentTerms: { type: String, default: '50% advance, balance on delivery.' },
    defaultTerms: {
      type: String,
      default:
        '1. Prices are valid until the expiry date shown.\n2. Work begins after the advance payment is received.\n3. Scope changes are billed separately through a change request.\n4. Source code and final assets are transferred after full payment.'
    },
    social: { github: String, linkedin: String, twitter: String, instagram: String },
    testimonials: [{ name: String, role: String, company: String, quote: String, rating: { type: Number, min: 1, max: 5, default: 5 }, visible: { type: Boolean, default: true } }],
    publicTeam: [{ name: String, title: String, bio: String, photoUrl: String, linkedin: String, github: String }],
    blogPosts: [{ title: String, slug: String, excerpt: String, body: String, coverImage: String, tags: [String], published: { type: Boolean, default: false }, publishedAt: Date }],
    services: { type: [serviceSchema], default: undefined },
    technologies: { type: [technologySchema], default: undefined },
    workflow: { type: [contentCardSchema], default: undefined },
    why: { type: [contentCardSchema], default: undefined },
    aboutStory: { type: [String], default: undefined },
    aboutPrinciples: { type: [contentCardSchema], default: undefined }
  },
  // One document per key ("agency"), so concurrent first requests can't create two.
  { timestamps: true, naturalId: (d) => (d.key ? hashId(`settings:${d.key}`) : undefined) }
);

module.exports = model('Settings', settingsSchema);
