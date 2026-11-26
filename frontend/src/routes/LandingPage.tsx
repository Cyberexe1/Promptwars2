import { Link } from 'react-router-dom';
import { LiveSample } from '../components/LiveSample';
import { AUDIENCES, FEATURES, STEPS } from './landingContent';

export function LandingPage() {
  return (
    <>
      <section className="hero">
        <div className="shell hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Winter smog, made manageable</p>
            <h1>Know what today&rsquo;s air means for your household</h1>
            <p className="lede">
              SmogWise turns a live air-quality reading into four to six
              specific things to do today, chosen for who lives with you, how
              you travel, and what you can afford. Every suggestion comes with
              the reason behind it and the effect you can expect.
            </p>

            <div className="hero-actions">
              <Link to="/dashboard" className="button button-primary button-lg">
                Check my air now
              </Link>
              <a href="#how-it-works" className="button button-ghost button-lg">
                See how it works
              </a>
            </div>

            <ul className="hero-points">
              <li>No tracking, and no household data on our servers</li>
              <li>Free and keyless air-quality data</li>
              <li>Safety rules in code, not left to a chatbot</li>
            </ul>
          </div>

          {/* A framed window around the real live reading, so the preview is
              the actual product rather than a mocked screenshot. */}
          <div className="preview">
            <div className="preview-frame">
              <div className="preview-bar" aria-hidden="true">
                <span className="preview-dot" />
                <span className="preview-dot" />
                <span className="preview-dot" />
                <p className="preview-label">smogwise / dashboard</p>
              </div>
              <div className="preview-body">
                <LiveSample />
              </div>
            </div>
            <p className="preview-caption">
              Real data, not a mockup: this reading is fetched when the page
              loads.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-sunken" aria-labelledby="problem-heading">
        <div className="shell prose">
          <p className="eyebrow">The problem</p>
          <h2 id="problem-heading">
            Generic smog advice ignores the household it is given to
          </h2>
          <p>
            Through the smog season, most guidance reduces to &ldquo;stay
            indoors and avoid exercise&rdquo;. That is unusable for a parent who
            still has a school run, a courier who rides a scooter all day, or a
            family cooking over wood because that is what they have.
          </p>
          <p>
            Fine particles are also invisible, so judging the air by looking at
            the sky does not work, and the same number does not carry the same
            risk for a healthy adult as for a child or someone with asthma.
          </p>
          <p>
            SmogWise starts from the real reading, then narrows it to the
            decisions you actually control today, and explains what each one is
            expected to change.
          </p>
        </div>
      </section>

      <section
        className="section"
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
      >
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 id="how-it-works-heading">Four steps, about a minute</h2>
          </div>

          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="step">
                <span className="step-badge" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="section section-sunken"
        aria-labelledby="features-heading"
      >
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">What you get</p>
            <h2 id="features-heading">Advice across the whole day</h2>
          </div>

          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <ul className="feature-list">
                  {feature.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="trust-heading">
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">Why you can trust it</p>
            <h2 id="trust-heading">
              The safety decisions are not left to the model
            </h2>
          </div>

          <div className="trust-grid">
            <article className="panel">
              <h3>Rules decide, the model only explains</h3>
              <p>
                A reviewed catalogue holds every suggestion the app can make.
                Code decides which ones apply to your household at the current
                band. Amazon Bedrock may reword them for your situation, and
                nothing else. Any generated text that contradicts a safety rule
                is discarded.
              </p>
            </article>

            <article className="panel">
              <h3>Numbers come from the source, never invented</h3>
              <p>
                Readings are fetched from Open-Meteo and graded against the EPA
                index. The model is never asked to produce an air-quality value.
                If no live reading exists, the app says so rather than guessing.
              </p>
            </article>

            <article className="panel">
              <h3>Every claim is shown as an estimate</h3>
              <p>
                Impact statements explain the mechanism and the direction of the
                effect, with an evidence rating. Nothing claims a precise
                percentage, because the app has no sensor on your street.
              </p>
            </article>

            <article className="panel">
              <h3>Your details stay yours</h3>
              <p>
                An account holds only your email and a hashed password. No
              analytics, no tracking, and no household data on our servers.
              Coordinates are rounded to
                a few hundred metres, health answers never reach a log, and the
                community view excludes household details entirely.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        className="section section-sunken"
        aria-labelledby="audience-heading"
      >
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">Who it is for</p>
            <h2 id="audience-heading">Tuned to the people most affected</h2>
          </div>

          <div className="audience-grid">
            {AUDIENCES.map((audience) => (
              <article key={audience.title} className="audience">
                <h3>{audience.title}</h3>
                <p>{audience.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta" aria-labelledby="cta-heading">
        <div className="shell cta-inner">
          <h2 id="cta-heading">See what your air means today</h2>
          <p>
            One search, a few optional answers, and a plan you can act on before
            the evening peak.
          </p>
          <Link to="/dashboard" className="button button-invert button-lg">
            Open the dashboard
          </Link>
          <p className="cta-note">
            General environmental-health guidance, not medical advice.
          </p>
        </div>
      </section>
    </>
  );
}
