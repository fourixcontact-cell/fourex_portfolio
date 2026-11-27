const Settings = require('../models/Settings');
const siteContentDefaults = require('../config/siteContentDefaults');

const clone = (value) => JSON.parse(JSON.stringify(value));

async function getSiteSettings() {
  const settings = await Settings.findOneAndUpdate(
    { key: 'agency' },
    { $setOnInsert: { key: 'agency', ...clone(siteContentDefaults) } },
    { upsert: true, new: true }
  );
  const missing = Object.keys(siteContentDefaults).filter((key) => settings.get(key) == null);
  if (!missing.length) return settings;

  await Promise.all(missing.map((key) => Settings.updateOne(
    { key: 'agency', [key]: null },
    { $set: { [key]: clone(siteContentDefaults[key]) } }
  )));
  return Settings.findOne({ key: 'agency' });
}

module.exports = { getSiteSettings };
