import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';

/**
 * Global footer.
 *
 * Every link points at something that exists: real routes, real documents in
 * the repository, and the two data sources the app depends on. There are no
 * social accounts or support portals, so none are invented.
 */

const REPO = 'https://github.com/Cyberexe1/Promptwars2';

interface FooterLink {
  label: string;
  to: string;
  external?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Privacy', to: '/privacy' },
];

const RESOURCE_LINKS: FooterLink[] = [
  { label: 'Source code', to: REPO, external: true },
  { label: 'Architecture', to: `${REPO}/blob/main/docs/architecture.md`, external: true },
  { label: 'Known limitations', to: `${REPO}/blob/main/docs/limitations.md`, external: true },
  { label: 'API reference', to: `${REPO}/blob/main/backend/README.md`, external: true },
];

const DATA_LINKS: FooterLink[] = [
  {
    label: 'Open-Meteo air quality',
    to: 'https://open-meteo.com/en/docs/air-quality-api',
    external: true,
  },
  {
    label: 'US EPA Air Quality Index',
    to: 'https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf',
    external: true,
  },
  {
    label: 'EPA breakpoint table',
    to: 'https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html',
    external: true,
  },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="footer-column">
      {/* h2, not h3: the not-found page has only an h1, so an h3 here would
          skip a level and break the document outline. */}
      <h2>{title}</h2>
      <ul className="footer-links">
        {links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a href={link.to} target="_blank" rel="noreferrer noopener">
                {link.label}
              </a>
            ) : (
              <Link to={link.to}>{link.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="brand" aria-label="SmogWise home">
              <BrandMark />
              <span className="brand-word">SmogWise</span>
            </Link>
            <p className="footer-tagline">
              Turns a live air-quality reading into a practical daily plan for
              your household, with the reason and the expected effect behind
              every suggestion.
            </p>
            <p className="footer-tagline">
              No account, no tracking, nothing stored on a server.
            </p>
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Documentation" links={RESOURCE_LINKS} />
          <FooterColumn title="Data sources" links={DATA_LINKS} />
        </div>

        <div className="footer-bottom">
          <p className="footer-note">
            SmogWise gives general environmental-health guidance, not medical
            advice. If anyone has symptoms or an existing heart or lung
            condition, follow your local health authority and speak to a
            clinician. Impact figures are estimates, not measurements.
          </p>
          <p className="footer-copyright">
            Built for Prompt Wars &middot; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
