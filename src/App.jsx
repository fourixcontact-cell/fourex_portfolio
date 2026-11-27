<<<<<<< HEAD

=======
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppRoutes from './routes/AppRoutes';
<<<<<<< HEAD
import RouteSeo from './seo/RouteSeo';
import useReveal from './utils/useReveal';

export default function App() {
  useReveal();

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <RouteSeo />
=======

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true }}>
>>>>>>> b0a71240b8dc4018f2b1e9dc9d9704b52c7b62b2
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
