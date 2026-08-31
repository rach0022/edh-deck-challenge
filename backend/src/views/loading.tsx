/**
 * Loading page — shows an animated spinner and progress bar while
 * the challenge data is being fetched. Uses SSE (EventSource) to
 * receive real-time progress updates from the server.
 */

import { Layout } from './layout.js';

interface LoadingPageProps {
  username: string;
  /** Which flow this loading screen feeds into. Defaults to 'challenge'. */
  mode?: 'challenge' | 'cedh';
}

/** Phase rows shown for each mode. id must match a phaseMap target below. */
const PHASE_ROWS: Record<'challenge' | 'cedh', { id: string; label: string }[]> = {
  challenge: [
    { id: 'phase-connecting', label: 'Connect to Moxfield' },
    { id: 'phase-loading-decks', label: 'Load deck data' },
    { id: 'phase-organizing', label: 'Organize into color slots' },
    { id: 'phase-combos', label: 'Search for combos' },
    { id: 'phase-complete', label: 'Finalize results' },
  ],
  cedh: [
    { id: 'phase-connecting', label: 'Connect to Moxfield' },
    { id: 'phase-loading-decks', label: 'Load your decks' },
    { id: 'phase-matching', label: 'Match against cEDH decks' },
    { id: 'phase-complete', label: 'Finalize results' },
  ],
};

export function LoadingPage({ username, mode = 'challenge' }: LoadingPageProps) {
  const sseUrl =
    mode === 'cedh'
      ? `/api/cedh/${encodeURIComponent(username)}/progress`
      : `/api/challenge/${encodeURIComponent(username)}/progress`;
  const redirectUrl =
    mode === 'cedh'
      ? `/cedh/${encodeURIComponent(username)}`
      : `/challenge/${encodeURIComponent(username)}`;

  const title =
    mode === 'cedh'
      ? `Loading ${username} — Build a cEDH Deck`
      : `Loading ${username} — EDH 32 Deck Challenge`;

  const phaseRows = PHASE_ROWS[mode];

  return (
    <Layout title={title}>
      <div class="loading-container">
        <div class="loading-spinner-wrapper">
          <div class="loading-spinner" />
        </div>

        <h1 class="loading-title">Loading {username}'s Decks</h1>

        <div class="loading-progress-container">
          <div class="loading-progress-bar" id="progress-bar" style="width: 0%"
            role="progressbar" aria-valuenow={0} aria-valuemin={0} aria-valuemax={100}
            aria-label="Loading progress" />
        </div>
        <div class="loading-progress-text" id="progress-text">0%</div>

        <div class="loading-status" id="status-message" aria-live="polite">Preparing to connect to Moxfield</div>
        <div class="loading-detail" id="status-detail" aria-live="polite"></div>

        <div class="loading-phases" id="phases-list">
          {phaseRows.map((row) => (
            <div class="phase-item" id={row.id}>
              <span class="phase-icon" aria-hidden="true">⏳</span>
              <span class="phase-label">{row.label}</span>
            </div>
          ))}
        </div>

        <p class="loading-hint">
          First lookup takes 10-30 seconds while we fetch your decks from Moxfield.
          <br />Subsequent visits will be instant (cached for 15 minutes).
        </p>
      </div>

      <script dangerouslySetInnerHTML={{ __html: loadingScript(sseUrl, redirectUrl, phaseRows.map((r) => r.id)) }} />
    </Layout>
  );
}

function loadingScript(sseUrl: string, redirectUrl: string, phaseOrderIds: string[]): string {
  return `
(function() {
  var progressBar = document.getElementById('progress-bar');
  var progressText = document.getElementById('progress-text');
  var statusMessage = document.getElementById('status-message');
  var statusDetail = document.getElementById('status-detail');

  var phaseMap = {
    'cache-check': 'phase-connecting',
    'connecting': 'phase-connecting',
    'connected': 'phase-connecting',
    'loading-decks': 'phase-loading-decks',
    'organizing': 'phase-organizing',
    'combos': 'phase-combos',
    'matching': 'phase-matching',
    'finalizing': 'phase-complete',
    'complete': 'phase-complete'
  };

  var phaseOrder = ${JSON.stringify(phaseOrderIds)};
  var completedPhases = new Set();
  var currentPhaseId = null;

  function setPhaseActive(phase) {
    var elementId = phaseMap[phase];
    if (!elementId) return;
    // A phase may map to an id not present in this mode's list; ignore it.
    if (phaseOrder.indexOf(elementId) === -1) return;

    // Mark all phases before this one as complete
    for (var i = 0; i < phaseOrder.length; i++) {
      var pid = phaseOrder[i];
      if (pid === elementId) break;
      if (!completedPhases.has(pid)) {
        completedPhases.add(pid);
        var prevEl = document.getElementById(pid);
        if (prevEl) {
          prevEl.classList.remove('active');
          prevEl.classList.add('done');
          prevEl.querySelector('.phase-icon').textContent = '✓';
        }
      }
    }

    currentPhaseId = elementId;
    var el = document.getElementById(elementId);
    if (el && !completedPhases.has(elementId)) {
      el.classList.add('active');
      el.querySelector('.phase-icon').textContent = '⚡';
    }
  }

  function markAllDone() {
    var items = document.querySelectorAll('.phase-item');
    items.forEach(function(item) {
      item.classList.remove('active');
      item.classList.add('done');
      item.querySelector('.phase-icon').textContent = '✓';
    });
  }

  var source = new EventSource(${JSON.stringify(sseUrl)});

  source.addEventListener('progress', function(e) {
    var data = JSON.parse(e.data);

    progressBar.style.width = data.progress + '%';
    progressBar.setAttribute('aria-valuenow', data.progress);
    progressText.textContent = data.progress + '%';
    statusMessage.textContent = data.message;
    statusDetail.textContent = data.detail || '';

    setPhaseActive(data.phase);
  });

  source.addEventListener('complete', function(e) {
    var data = JSON.parse(e.data);
    source.close();

    progressBar.style.width = '100%';
    progressBar.setAttribute('aria-valuenow', 100);
    progressText.textContent = '100%';
    statusMessage.textContent = 'Done! Redirecting...';
    statusDetail.textContent = '';
    markAllDone();

    setTimeout(function() {
      window.location.href = data.redirect;
    }, 600);
  });

  source.addEventListener('error', function(e) {
    if (e.data) {
      var data = JSON.parse(e.data);
      source.close();
      statusMessage.textContent = data.message || 'An error occurred.';
      statusDetail.textContent = '';
      progressBar.style.width = '100%';
      progressBar.classList.add('error');
      progressText.textContent = 'Error';

      var container = document.querySelector('.loading-container');
      var retryHtml = '<div style="margin-top: 2rem; text-align: center; display: flex; gap: 1.5rem; justify-content: center;">' +
        '<button type="button" id="retry-btn" style="background: none; border: none; padding: 0; font: inherit; cursor: pointer; color: var(--accent-green); text-decoration: underline;">Try Again</button>' +
        '<a href="/" style="color: var(--accent-purple);">Back to Home</a></div>';
      container.insertAdjacentHTML('beforeend', retryHtml);
      var retryBtn = document.getElementById('retry-btn');
      if (retryBtn) retryBtn.addEventListener('click', function() { window.location.reload(); });
      return;
    }

    // EventSource built-in error (connection lost)
    source.close();
    statusMessage.textContent = 'Connection lost. Please refresh to try again.';
    statusDetail.textContent = '';
    progressBar.classList.add('error');
    progressText.textContent = 'Error';
  });

  // Fallback: if nothing happens in 90s, just go to the results page directly
  setTimeout(function() {
    if (source.readyState !== 2) {
      source.close();
      window.location.href = ${JSON.stringify(redirectUrl)};
    }
  }, 90000);
})();
`;
}
