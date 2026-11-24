import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './components/RequireAuth';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { DashboardPage } from './routes/DashboardPage';
import { LandingPage } from './routes/LandingPage';
import { LoginPage } from './routes/LoginPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PrivacyPage } from './routes/PrivacyPage';
import './App.css';

/**
 * Application shell.
 *
 * The skip link is the first focusable element on every page, and `#main`
 * is the single main landmark it targets.
 */
export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <SiteHeader />

        <main id="main">
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
        </main>

        <SiteFooter />
      </div>
    </AuthProvider>
  );
}
