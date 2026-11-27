import Field from '../../components/forms/Field';
import ContentIcon from '../../components/common/ContentIcon';

const listFromText = (value) => value.split('\n').map((item) => item.trim()).filter(Boolean);

function ItemActions({ index, count, onMove, onRemove }) {
  return (
    <div className="d-flex gap-2">
      <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move item up">
        <i className="bi bi-arrow-up" /> Up
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label="Move item down">
        <i className="bi bi-arrow-down" /> Down
      </button>
      <button type="button" className="btn btn-ghost text-danger btn-sm" onClick={() => onRemove(index)}>
        <i className="bi bi-trash me-1" />Remove
      </button>
    </div>
  );
}

function Collection({ title, itemLabel, description, items, onAdd, onMove, onRemove, children }) {
  return (
    <section className="site-content-section">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div><h5 className="mb-1">{title}</h5><p className="small text-muted-x mb-0">{description}</p></div>
        <button type="button" className="btn btn-soft btn-sm flex-none" onClick={onAdd}>
          <i className="bi bi-plus-lg me-1" />Add
        </button>
      </div>
      {items.length ? items.map((item, index) => (
        <div className="set-item" key={`${title}-${index}`}>
          <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
            <strong>{itemLabel} {index + 1}</strong>
            <ItemActions index={index} count={items.length} onMove={onMove} onRemove={onRemove} />
          </div>
          {children(item, index)}
        </div>
      )) : <p className="small text-muted-x mb-3">No items yet. Use Add to create the first item.</p>}
    </section>
  );
}

export default function SiteContentEditor({ value, onChange, section }) {
  const update = (key, index, field, nextValue) => onChange(key, (items) => items.map((item, i) => (i === index ? { ...item, [field]: nextValue } : item)));
  const updateStory = (index, nextValue) => onChange('aboutStory', (paragraphs) => paragraphs.map((paragraph, i) => i === index ? nextValue : paragraph));
  const updateTechnology = (groupIndex, nextGroup) => onChange('technologies', (groups) => groups.map((group, i) => i === groupIndex ? nextGroup(group) : group));
  const add = (key, item) => onChange(key, (items) => [...items, item]);
  const remove = (key, index) => onChange(key, (items) => items.filter((_, i) => i !== index));
  const move = (key, index, direction) => onChange(key, (items) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return items;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const actions = (key) => ({
    onMove: (index, direction) => move(key, index, direction),
    onRemove: (index) => remove(key, index)
  });

  return (
    <div>
      <div className="alert alert-light border small">
        Edit the content shown on the public website. Changes are published when you save settings; the service list also updates enquiry forms and lead editing.
      </div>

      {(!section || section === 'services') && <Collection title="Services" itemLabel="Service" description="Cards on the home and services pages, and selectable enquiry services." items={value.services} onAdd={() => add('services', { icon: '', title: '', text: '', points: [] })} {...actions('services')}>
        {(item, index) => (
          <div className="row g-3">
            <Field className="col-md-8" label="Service name" name={`service-${index}-title`} value={item.title} onChange={(_, x) => update('services', index, 'title', x)} required maxLength={120} />
            <div className="col-md-4 icon-class-field"><Field label="Icon class" name={`service-${index}-icon`} value={item.icon} onChange={(_, x) => update('services', index, 'icon', x)} placeholder="fa-solid fa-code" maxLength={64} hint="Font Awesome or Bootstrap Icons classes" /><span className="icon-class-preview"><ContentIcon icon={item.icon} /> Preview</span></div>
            <Field className="col-12" label="Description" name={`service-${index}-text`} rows={3} value={item.text} onChange={(_, x) => update('services', index, 'text', x)} required maxLength={1000} />
            <Field className="col-12" label="Highlights (one per line)" name={`service-${index}-points`} rows={3} value={(item.points || []).join('\n')} onChange={(_, x) => update('services', index, 'points', listFromText(x))} hint="Leave blank or remove a line to delete a highlight." />
          </div>
        )}
      </Collection>}

      {(!section || section === 'technologies') && <Collection title="Technologies" itemLabel="Category" description="Manage categories and the technologies displayed in each category." items={value.technologies} onAdd={() => add('technologies', { group: '', icon: '', items: [] })} {...actions('technologies')}>
        {(item, index) => (
          <div>
            <div className="row g-3">
              <Field className="col-md-8" label="Category title" name={`technology-${index}-group`} value={item.group} onChange={(_, x) => update('technologies', index, 'group', x)} required maxLength={80} />
              <div className="col-md-4 icon-class-field"><Field label="Category icon class" name={`technology-${index}-icon`} value={item.icon} onChange={(_, x) => update('technologies', index, 'icon', x)} placeholder="fa-solid fa-code" maxLength={64} /><span className="icon-class-preview"><ContentIcon icon={item.icon} /> Preview</span></div>
            </div>
            <div className="technology-admin-list mt-3">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2"><strong className="small">Technologies</strong><button type="button" className="btn btn-soft btn-sm" onClick={() => updateTechnology(index, (group) => ({ ...group, items: [...(group.items || []), { name: '', icon: '' }] }))}><i className="bi bi-plus-lg me-1" />Add technology</button></div>
              {(item.items || []).map((technology, technologyIndex) => (
                <div className="technology-admin-item row g-2 align-items-end" key={`${index}-${technologyIndex}`}>
                  <Field className="col-md-5" label="Technology name" name={`technology-${index}-item-${technologyIndex}-name`} value={technology.name} onChange={(_, x) => updateTechnology(index, (group) => ({ ...group, items: group.items.map((entry, i) => i === technologyIndex ? { ...entry, name: x } : entry) }))} required maxLength={80} />
                  <div className="col-md-5 icon-class-field"><Field label="Icon class" name={`technology-${index}-item-${technologyIndex}-icon`} value={technology.icon} onChange={(_, x) => updateTechnology(index, (group) => ({ ...group, items: group.items.map((entry, i) => i === technologyIndex ? { ...entry, icon: x } : entry) }))} placeholder="fa-brands fa-react" maxLength={64} /><span className="icon-class-preview"><ContentIcon icon={technology.icon} /> Preview</span></div>
                  <div className="col-md-2 d-flex justify-content-end"><button type="button" className="btn btn-ghost text-danger btn-sm" aria-label={`Remove ${technology.name || 'technology'}`} onClick={() => updateTechnology(index, (group) => ({ ...group, items: group.items.filter((_, i) => i !== technologyIndex) }))}><i className="bi bi-trash" /> Remove</button></div>
                </div>
              ))}
              {!item.items?.length && <p className="small text-muted-x mb-0">No technologies in this category yet.</p>}
            </div>
          </div>
        )}
      </Collection>}

      {(!section || section === 'content') && <Collection title="Workflow" itemLabel="Step" description="Ordered delivery steps shown on the home and services pages." items={value.workflow} onAdd={() => add('workflow', { icon: '', title: '', text: '' })} {...actions('workflow')}>
        {(item, index) => (
          <div className="row g-3">
            <Field className="col-md-8" label="Step name" name={`workflow-${index}-title`} value={item.title} onChange={(_, x) => update('workflow', index, 'title', x)} required maxLength={120} />
            <Field className="col-md-4" label="Bootstrap icon" name={`workflow-${index}-icon`} value={item.icon} onChange={(_, x) => update('workflow', index, 'icon', x)} placeholder="bi-chat-dots" maxLength={64} />
            <Field className="col-12" label="Description" name={`workflow-${index}-text`} rows={3} value={item.text} onChange={(_, x) => update('workflow', index, 'text', x)} required maxLength={1000} />
          </div>
        )}
      </Collection>}

      {(!section || section === 'content') && <Collection title="Why us" itemLabel="Reason" description="Reasons to work with your agency shown on the home and about pages." items={value.why} onAdd={() => add('why', { icon: '', title: '', text: '' })} {...actions('why')}>
        {(item, index) => (
          <div className="row g-3">
            <Field className="col-md-8" label="Title" name={`why-${index}-title`} value={item.title} onChange={(_, x) => update('why', index, 'title', x)} required maxLength={120} />
            <Field className="col-md-4" label="Bootstrap icon" name={`why-${index}-icon`} value={item.icon} onChange={(_, x) => update('why', index, 'icon', x)} placeholder="bi-shield-lock" maxLength={64} />
            <Field className="col-12" label="Description" name={`why-${index}-text`} rows={3} value={item.text} onChange={(_, x) => update('why', index, 'text', x)} required maxLength={1000} />
          </div>
        )}
      </Collection>}

      {section === 'about' && <>
        <Collection title="Our story" itemLabel="Paragraph" description="Story paragraphs shown on the About page." items={value.aboutStory} onAdd={() => add('aboutStory', '')} {...actions('aboutStory')}>
          {(paragraph, index) => <Field className="col-12" label={`Paragraph ${index + 1}`} name={`about-story-${index}`} rows={4} value={paragraph} onChange={(_, text) => updateStory(index, text)} required maxLength={2000} />}
        </Collection>
        <Collection title="Mission, vision & values" itemLabel="About card" description="Cards displayed next to the story on the About page." items={value.aboutPrinciples} onAdd={() => add('aboutPrinciples', { icon: '', title: '', text: '' })} {...actions('aboutPrinciples')}>
          {(item, index) => (
            <div className="row g-3">
              <Field className="col-md-4" label="Title" name={`about-principle-${index}-title`} value={item.title} onChange={(_, x) => update('aboutPrinciples', index, 'title', x)} required maxLength={80} />
              <div className="col-md-4 icon-class-field"><Field label="Icon class" name={`about-principle-${index}-icon`} value={item.icon} onChange={(_, x) => update('aboutPrinciples', index, 'icon', x)} placeholder="bi-bullseye or fa-solid fa-bullseye" maxLength={64} /><span className="icon-class-preview"><ContentIcon icon={item.icon} /> Preview</span></div>
              <Field className="col-12" label="Description" name={`about-principle-${index}-text`} rows={3} value={item.text} onChange={(_, x) => update('aboutPrinciples', index, 'text', x)} required maxLength={1000} />
            </div>
          )}
        </Collection>
      </>}
    </div>
  );
}
