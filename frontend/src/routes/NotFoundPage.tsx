import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="focus-page">
      <div className="focus-page-inner">
        <p className="eyebrow">Page not found</p>
        <h1>That page does not exist</h1>
        <p className="lede">
          The link may be out of date. The dashboard is where the live reading
          and your plan live.
        </p>
        <div className="button-row focus-actions">
          <Link to="/dashboard" className="button button-primary">
            Go to the dashboard
          </Link>
          <Link to="/" className="button button-secondary">
            Back to the home page
          </Link>
        </div>
      </div>
    </section>
  );
}
