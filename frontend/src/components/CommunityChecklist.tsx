import { useState } from 'react';
import { buildCommunityChecklist, formatChecklistAsText } from '../community';
import { formatTimestamp } from '../labels';
import type { RecommendationsResponse } from '../types';

interface CommunityChecklistProps {
  locationName: string;
  plan: RecommendationsResponse;
}

/**
 * A shareable version of the plan for a street, building, or school group.
 *
 * Everything household-specific is removed before display. The interface says
 * so explicitly, because a user needs to know what they are about to paste
 * into a group chat.
 */
export function CommunityChecklist({ locationName, plan }: CommunityChecklistProps) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const checklist = buildCommunityChecklist(locationName, plan);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatChecklistAsText(checklist));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <section className="card" aria-labelledby="community-heading">
      <h2 id="community-heading">Share with your street or school</h2>

      <p className="hint">
        These are the actions that change the air for everyone nearby, not just
        your home. Your household details, health answers, and personal
        exposure notes are left out, so this is safe to share.
      </p>

      <div className="community-meta">
        <p>
          <strong>{checklist.locationName}</strong> &middot; air quality today:{' '}
          <strong>{checklist.officialBand}</strong>
        </p>
        <p className="hint">
          Reading observed {formatTimestamp(checklist.observedAt)} from{' '}
          <a href={checklist.sourceUrl} target="_blank" rel="noreferrer noopener">
            {checklist.sourceName}
          </a>
          .
        </p>
      </div>

      {checklist.items.length === 0 ? (
        <p className="alert alert-info" role="note">
          Today&rsquo;s plan is all personal protection, with no shared actions
          to pass on. Check again if conditions worsen.
        </p>
      ) : (
        <ol className="community-list">
          {checklist.items.map((item) => (
            <li key={item.id} className="community-item">
              <h3>{item.title}</h3>
              <p>{item.action}</p>
              <p className="community-effect">
                <span className="community-effect-label">Effect on the area:</span>{' '}
                {item.communityImpact}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="button-row">
        <button type="button" className="button button-secondary" onClick={copy}>
          Copy as text
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => window.print()}
        >
          Print this plan
        </button>
      </div>

      <p className="status" role="status" aria-live="polite">
        {copied === 'done' && 'Checklist copied to your clipboard.'}
        {copied === 'failed' &&
          'Copying was blocked by your browser. Select the text above instead.'}
      </p>
    </section>
  );
}
