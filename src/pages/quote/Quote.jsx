import EnquiryForm from '../../components/forms/EnquiryForm';
import './Quote.css';

export default function Quote() {
  return (
    <>
      <section className="page-hero"><div className="container"><span className="eyebrow">Get a quote</span><h1>Tell us what you need, <span className="grad-text">get a clear quote</span></h1><p>The more detail you share, the more accurate our itemised quotation will be.</p></div></section>
      <section className="sec pt-4"><div className="container"><div className="row g-4 justify-content-center">
        <div className="col-lg-8"><div className="card-x card-body-x p-md-4"><EnquiryForm mode="quote" /></div></div>
        <div className="col-lg-4"><div className="card-x card-body-x quote-side"><h5>What happens next?</h5>
          {[['Review', 'We read your brief and may ask a few questions.'], ['Quotation', 'You receive an itemised quotation with scope, timeline and payment milestones.'], ['Kick-off', 'Once you approve, we plan milestones and start building.']].map(([t, x], i) => (
            <div className="qs" key={t}><span>{i + 1}</span><div><b>{t}</b><div className="small text-muted-x">{x}</div></div></div>))}
        </div></div>
      </div></div></section>
    </>
  );
}
