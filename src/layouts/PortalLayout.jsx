<<<<<<< HEAD
import { useState } from 'react';
=======
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Container, Nav, Navbar } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { errMsg } from '../services/api';
import './PortalLayout.css';
import BrandMark from '../components/common/BrandMark';

export default function PortalLayout() {
  const { client, logoutClient } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
<<<<<<< HEAD
  const [expanded, setExpanded] = useState(false);
=======
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
  const logout = async () => {
    try { await logoutClient(); toast.info('Signed out'); nav('/login'); }
    catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="portal">
<<<<<<< HEAD
      <Navbar expand="lg" expanded={expanded} onToggle={setExpanded} className="portal-nav" variant="dark">
        <Container>
          <Navbar.Brand as={Link} to="/portal"><BrandMark size={34} className="portal-brand-logo" />Fourix <span className="portal-brand-sub">Client Portal</span></Navbar.Brand>
          <Navbar.Toggle
            aria-controls="portal-navigation"
            label={expanded ? 'Close menu' : 'Open menu'}
            aria-expanded={expanded}
            className={`portal-menu-toggle ${expanded ? 'is-open' : ''}`}
          >
            <span className="menu-toggle-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </Navbar.Toggle>
=======
      <Navbar expand="md" className="portal-nav" variant="dark">
        <Container>
          <Navbar.Brand as={Link} to="/portal"><BrandMark size={34} className="portal-brand-logo" />Fourix <span className="portal-brand-sub">Client Portal</span></Navbar.Brand>
          <Navbar.Toggle aria-controls="portal-navigation" />
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
          <Navbar.Collapse id="portal-navigation">
            <Nav className="me-auto portal-nav-links"><Nav.Link as={NavLink} to="/portal" end>Projects</Nav.Link><Nav.Link as={NavLink} to="/portal/support">Support</Nav.Link></Nav>
            <span className="portal-user"><i className="bi bi-person-circle" />{client?.name}</span>
            <button className="btn portal-signout" onClick={logout}>Sign out</button>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="portal-content page-enter"><Outlet /></Container>
    </div>
  );
}
