export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <p className="footer-lead">
          <strong>SmogWise</strong> gives general environmental-health guidance,
          not medical advice. If anyone has symptoms or an existing heart or lung
          condition, follow your local health authority and speak to a clinician.
        </p>
        <p className="footer-meta">
          Air-quality and city data from{' '}
          <a
            href="https://open-meteo.com/en/docs/air-quality-api"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open-Meteo
          </a>
          . Risk bands follow the{' '}
          <a
            href="https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf"
            target="_blank"
            rel="noreferrer noopener"
          >
            US EPA Air Quality Index
          </a>
          , using the PM2.5 breakpoints effective May 2024.
        </p>
      </div>
    </footer>
  );
}
