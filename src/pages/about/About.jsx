import { useOutletContext } from 'react-router-dom';
import CtaBand from '../../components/common/CtaBand';
import ContentIcon from '../../components/common/ContentIcon';
import useReveal from '../../utils/useReveal';
import './About.css';

const STORY_DEFAULTS = [
  'We started as independent developers and designers who kept getting the same feedback from clients: they wanted fewer layers, clearer communication and software they could actually rely on. So we teamed up.',
  'Today we work as a tight team, each project has named owners, written scope, itemised pricing and visible milestones. You can follow progress, invoices and documents in your own client portal.'
];
const PRINCIPLE_DEFAULTS = [
  { icon: 'bi-bullseye', title: 'Mission', text: 'Deliver dependable software that solves real business problems.' },
  { icon: 'bi-eye', title: 'Vision', text: 'Be the engineering partner small and mid-sized businesses trust for the long term.' },
  { icon: 'bi-heart', title: 'Values', text: 'Honesty, craftsmanship, security and clear communication.' }
];

export default function About() {
  const { site } = useOutletContext() || {};
  const why = site?.why || [];
  const story = site?.aboutStory?.length ? site.aboutStory : STORY_DEFAULTS;
  const principles = site?.aboutPrinciples?.length ? site.aboutPrinciples : PRINCIPLE_DEFAULTS;
  useReveal();
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">About us</span><h1>A small, senior team that <span className="grad-text">ships software that works</span></h1><p>We are a freelance software development agency helping startups and businesses design, build and run dependable digital products.</p></div></section>
      <section className="sec">
        <div className="container"><div className="row gy-5 gx-lg-5 align-items-center">
          <div className="col-lg-6 reveal"><h2 className="mb-3">Our story</h2>{story.map((paragraph, index) => <p className="text-muted-x" key={`${index}-${paragraph}`}>{paragraph}</p>)}</div>
          <div className="col-lg-6 reveal"><div className="about-values">
            {principles.map((principle) => (
              <div className="card-x card-body-x d-flex gap-3" key={principle.title}><div className="feature-ico mb-0"><ContentIcon icon={principle.icon} /></div><div><h6 className="mb-1">{principle.title}</h6><p className="text-muted-x small mb-0">{principle.text}</p></div></div>))}
          </div></div>
        </div></div>
      </section>
      <section className="sec alt"><div className="container"><div className="sec-head reveal"><span className="eyebrow">How we work</span><h2>What you can expect from us</h2></div>
        <div className="row g-4">{why.map((w) => (<div className="col-md-6 col-lg-4 reveal" key={w.title}><div className="card-x hoverable feature-card"><div className="feature-ico"><i className={`bi ${w.icon}`} /></div><h5>{w.title}</h5><p>{w.text}</p></div></div>))}</div></div></section>
      <CtaBand />
    </>
  );
}
