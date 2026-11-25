import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './components/RequireAuth';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { LandingPage } from './routes/LandingPage';
import './App.css';

/**
 * Application shell.
 *
 * The landing page is bundled with the shell because it is the entry point for
 * every first-time visitor. Everything behind it is split out, so arriving at
 * the home page does not download the dashboard, the chart, the auth form, and
 * the privacy text that visitor may never open.
 */
const DashboardPage = lazy(() =>
  import('./routes/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const LoginPage = lazy(() =>
  import('./routes/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const PrivacyPage = lazy(() =>
  import('./routes/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
const NotFoundPage = lazy(() =>
  import('./routes/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

/**
 * Shown while a route chunk loads. Announced politely rather than assertively:
 * on a fast connection it appears too briefly to be worth interrupting for.
 */
function RouteFallback() {
  return (
    <div className="focus-page">
      <p className="alert alert-info" role="status">
        Loading…
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <SiteHeader />

        <main id="main">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <DashboardPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>

        <SiteFooter />
      </div>
    </AuthProvider>
  );
}
