import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import CrmLayout from '../layouts/CrmLayout';
import PortalLayout from '../layouts/PortalLayout';
import { AdminGuard, ClientGuard } from './Guards';
import { Skel } from '../components/loaders/Skeletons';

const L = (p) => lazy(p);
const Home = L(() => import('../pages/home/Home'));
const About = L(() => import('../pages/about/About'));
const Services = L(() => import('../pages/services/Services'));
const Portfolio = L(() => import('../pages/portfolio/Portfolio'));
const PortfolioDetail = L(() => import('../pages/portfolio/PortfolioDetail'));
const Team = L(() => import('../pages/team/Team'));
const Technologies = L(() => import('../pages/technologies/Technologies'));
const Testimonials = L(() => import('../pages/testimonials/Testimonials'));
const Contact = L(() => import('../pages/contact/Contact'));
const Quote = L(() => import('../pages/quote/Quote'));
const QuotationView = L(() => import('../pages/quote/QuotationView'));
const Blog = L(() => import('../pages/blog/Blog'));
const BlogPost = L(() => import('../pages/blog/BlogPost'));
const Privacy = L(() => import('../pages/legal/Privacy'));
const Terms = L(() => import('../pages/legal/Terms'));
const Login = L(() => import('../pages/login/Login'));
const ChangeAdminPassword = L(() => import('../pages/login/ChangeAdminPassword'));

const Dashboard = L(() => import('../pages/dashboard/Dashboard'));
const Leads = L(() => import('../pages/leads/Leads'));
const Clients = L(() => import('../pages/clients/Clients'));
const ClientDetail = L(() => import('../pages/clients/ClientDetail'));
const Projects = L(() => import('../pages/projects/Projects'));
const ProjectDetail = L(() => import('../pages/projects/ProjectDetail'));
const Tasks = L(() => import('../pages/tasks/Tasks'));
const Documents = L(() => import('../pages/documents/Documents'));
const Tickets = L(() => import('../pages/tickets/Tickets'));
const Quotations = L(() => import('../pages/quotations/Quotations'));
const Invoices = L(() => import('../pages/invoices/Invoices'));
const Finance = L(() => import('../pages/finance/Finance'));
const Expenses = L(() => import('../pages/expenses/Expenses'));
const Reports = L(() => import('../pages/reports/Reports'));
const Team_ = L(() => import('../pages/team/CrmTeam'));
const AuditLogs = L(() => import('../pages/audit-logs/AuditLogs'));
const Settings = L(() => import('../pages/settings/Settings'));
const Profile = L(() => import('../pages/profile/Profile'));

const PortalHome = L(() => import('../pages/portal/PortalHome'));
const PortalProject = L(() => import('../pages/portal/PortalProject'));
const PortalSupport = L(() => import('../pages/portal/PortalSupport'));

const Fallback = () => <div className="container py-5"><Skel w="35%" h={26} /><Skel h={200} className="mt-4" r={16} /></div>;
const CrmRouteFallback = () => (
  <div className="crm-route-fallback" aria-hidden="true">
    <Skel w="30%" h={28} />
    <div className="row g-3 mt-3">
      {[0, 1, 2, 3].map((item) => <div className="col-6 col-xl-3" key={item}><Skel h={92} r={14} /></div>)}
    </div>
    <Skel h={280} className="mt-4" r={16} />
  </div>
);
const CrmPage = ({ component: Page }) => <Suspense fallback={<CrmRouteFallback />}><Page /></Suspense>;

export default function AppRoutes() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="services" element={<Services />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="portfolio/:id" element={<PortfolioDetail />} />
          <Route path="team" element={<Team />} />
          <Route path="technologies" element={<Technologies />} />
          <Route path="testimonials" element={<Testimonials />} />
          <Route path="contact" element={<Contact />} />
          <Route path="quote" element={<Quote />} />
          <Route path="quotation/view/:token" element={<QuotationView />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:slug" element={<BlogPost />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
        </Route>
        <Route path="login" element={<Login mode="client" />} />
        <Route path="admin/login" element={<Login mode="admin" />} />
        <Route path="admin/change-password" element={<AdminGuard passwordChange><ChangeAdminPassword /></AdminGuard>} />

        <Route path="crm" element={<AdminGuard><CrmLayout /></AdminGuard>}>
          <Route index element={<CrmPage component={Dashboard} />} />
          <Route path="leads" element={<CrmPage component={Leads} />} />
          <Route path="clients" element={<CrmPage component={Clients} />} />
          <Route path="clients/:id" element={<CrmPage component={ClientDetail} />} />
          <Route path="projects" element={<CrmPage component={Projects} />} />
          <Route path="projects/:id" element={<CrmPage component={ProjectDetail} />} />
          <Route path="tasks" element={<CrmPage component={Tasks} />} />
          <Route path="documents" element={<CrmPage component={Documents} />} />
          <Route path="tickets" element={<CrmPage component={Tickets} />} />
          <Route path="quotations" element={<CrmPage component={Quotations} />} />
          <Route path="invoices" element={<CrmPage component={Invoices} />} />
          <Route path="finance" element={<CrmPage component={Finance} />} />
          <Route path="expenses" element={<CrmPage component={Expenses} />} />
          <Route path="reports" element={<CrmPage component={Reports} />} />
          <Route path="team" element={<CrmPage component={Team_} />} />
          <Route path="audit-logs" element={<CrmPage component={AuditLogs} />} />
          <Route path="settings" element={<CrmPage component={Settings} />} />
          <Route path="profile" element={<CrmPage component={Profile} />} />
        </Route>

        <Route path="portal" element={<ClientGuard><PortalLayout /></ClientGuard>}>
          <Route index element={<PortalHome />} />
          <Route path="projects/:id" element={<PortalProject />} />
          <Route path="support" element={<PortalSupport />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
