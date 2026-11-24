import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="shell narrow section">
      <p className="eyebrow">Page not found</p>
      <h1>That page does not exist</h1>
      <p className="lede">
        The link may be out of date. The dashboard is where the live reading and
        your plan live.
      </p>
      <Link to="/dashboard" className="button button-primary">
        Go to the dashboard
      </Link>
    </section>
  );
}
