import { Route, Routes } from 'react-router-dom';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { DashboardPage } from './routes/DashboardPage';
import { LandingPage } from './routes/LandingPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PrivacyPage } from './routes/PrivacyPage';
import './App.css';

/**
 * Application shell.
 *
 * The skip link is the first focusable element on every page, and `#main`
 * is the single main landmark that it targets.
 */
export default function App() {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <SiteHeader />

      <main id="main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <SiteFooter />
    </div>
  );
}
