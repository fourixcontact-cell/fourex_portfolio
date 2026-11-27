import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Container, Nav, Navbar } from 'react-bootstrap';
import { publicApi } from '../services/public';
import BrandMark from '../components/common/BrandMark';
import './PublicLayout.css';

const LINKS = [['/', 'Home'], ['/about', 'About'], ['/services', 'Services'], ['/portfolio', 'Portfolio'], ['/team', 'Team'], ['/technologies', 'Technologies'], ['/blog', 'Blog'], ['/contact', 'Contact']];

export default function PublicLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [site, setSite] = useState(null);
  const { pathname } = useLocation();

  useEffect(() => { const on = () => setScrolled(window.scrollY > 12); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  const rootRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    const tick = () => { raf = 0; rootRef.current?.style.setProperty('--sy', Math.min(window.scrollY, 1200)); };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { setExpanded(false); window.scrollTo({ top: 0 }); }, [pathname]);
  useEffect(() => { publicApi.site().then((r) => setSite(r.data)).catch(() => {}); }, []);

  const a = site?.agency || {};
  const name = a.name || 'Fourix';
  const links = LINKS.filter(([to]) => to !== '/team' || site?.team?.length > 0);
  return (
    <div className="pub" ref={rootRef}>
      <Navbar expand="lg" expanded={expanded} onToggle={setExpanded} fixed="top" className={`pub-nav ${scrolled || expanded ? 'solid' : ''}`}>
        <Container>
          <Navbar.Brand as={Link} to="/" className="pub-brand"><BrandMark />{name}</Navbar.Brand>
<<<<<<< HEAD
          <Navbar.Toggle
            aria-controls="pub-nav"
            label={expanded ? 'Close menu' : 'Open menu'}
            aria-expanded={expanded}
            className={`pub-menu-toggle ${expanded ? 'is-open' : ''}`}
          >
            <span className="menu-toggle-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </Navbar.Toggle>
=======
          <Navbar.Toggle aria-controls="pub-nav" />
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
          <Navbar.Collapse id="pub-nav">
            <Nav className="mx-auto">{links.map(([to, l]) => <Nav.Link key={to} as={NavLink} to={to} end={to === '/'}>{l}</Nav.Link>)}</Nav>
            <div className="d-flex gap-2 mt-3 mt-lg-0">
              <Link to="/login" className="btn btn-ghost btn-sm align-self-center"><i className="bi bi-person-lock me-1" />Client login</Link>
              <Link to="/quote" className="btn btn-primary btn-sm">Get a quote</Link>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <main className="pub-main"><Outlet context={{ site }} /></main>

      <footer className="pub-footer">
        <Container>
          <div className="row g-4">
            <div className="col-lg-4">
              <div className="pub-brand mb-3"><BrandMark size={42} />{name}</div>
              <p className="small opacity-75">{a.tagline || 'We design, build and ship reliable software for ambitious businesses.'}</p>
              <div className="d-flex gap-2">
                {a.social?.github && <a href={a.social.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub"><i className="bi bi-github" /></a>}
                {a.social?.linkedin && <a href={a.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i className="bi bi-linkedin" /></a>}
                {a.social?.twitter && <a href={a.social.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter / X"><i className="bi bi-twitter-x" /></a>}
                {a.social?.instagram && <a href={a.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><i className="bi bi-instagram" /></a>}
              </div>
            </div>
            <div className="col-6 col-lg-2"><h6>Company</h6><ul><li><Link to="/about">About us</Link></li>{site?.team?.length > 0 && <li><Link to="/team">Our team</Link></li>}<li><Link to="/portfolio">Portfolio</Link></li><li><Link to="/blog">Blog &amp; case studies</Link></li></ul></div>
            <div className="col-6 col-lg-2"><h6>Services</h6><ul>{(site?.services || []).slice(0, 4).map((service) => <li key={service.title}><Link to="/services">{service.title}</Link></li>)}</ul></div>
            <div className="col-lg-4"><h6>Contact</h6><ul>
              {a.email && <li><i className="bi bi-envelope me-2" />{a.email}</li>}
              {a.phone && <li><i className="bi bi-telephone me-2" />{a.phone}</li>}
              {a.address && <li><i className="bi bi-geo-alt me-2" />{a.address}</li>}
              <li className="mt-2"><Link to="/contact" className="btn btn-primary btn-sm">Start a project</Link></li></ul></div>
          </div>
          <div className="pub-footer-bottom"><span>© {new Date().getFullYear()} {name}. All rights reserved.</span><span><Link to="/privacy">Privacy Policy</Link> · <Link to="/terms">Terms &amp; Conditions</Link></span></div>
        </Container>
      </footer>
    </div>
  );
}
