/**
 * Loading page — shows an animated spinner and progress bar while
 * the challenge data is being fetched. Uses SSE (EventSource) to
 * receive real-time progress updates from the server.
 */

import { Layout } from './layout.js';

interface LoadingPageProps {
  username: string;
}

export function LoadingPage({ username }: LoadingPageProps) {
  const sseUrl = `/api/challenge/${encodeURIComponent(username)}/progress`;
  const challengeUrl = `/challenge/${encodeURIComponent(username)}`;

  return (
    <Layout title={`Loading ${username} — EDH 32 Deck Challenge`}>
      <div class="loading-container">
        <div class="loading-spinner-wrapper">
          <div class="loading-spinner" />
        </div>

        <h1 class="loading-title">Loading {username}'s Decks</h1>

        <div class="loading-progress-container">
          <div class="loading-progress-bar" id="progress-bar" style="width: 0%" />
        </div>
        <div class="loading-progress-text" id="progress-text">0%</div>

        <div class="loading-status" id="status-message">Preparing to connect to Moxfield</div>
        <div class="loading-detail" id="status-detail"></div>

        <div class="loading-phases" id="phases-list">
          <div class="phase-item" id="phase-connecting">
            <span class="phase-icon">⏳</span>
            <span class="phase-label">Connect to Moxfield</span>
          </div>
          <div class="phase-item" id="phase-loading-decks">
            <span class="phase-icon">⏳</span>
            <span class="phase-label">Load deck data</span>
          </div>
          <div class="phase-item" id="phase-organizing">
            <span class="phase-icon">⏳</span>
            <span class="phase-label">Organize into color slots</span>
          </div>
          <div class="phase-item" id="phase-combos">
            <span class="phase-icon">⏳</span>
            <span class="phase-label">Search for combos</span>
          </div>
          <div class="phase-item" id="phase-complete">
            <span class="phase-icon">⏳</span>
            <span class="phase-label">Finalize results</span>
          </div>
        </div>

        <p class="loading-hint">
          First lookup takes 10-30 seconds while we fetch your decks from Moxfield.
          <br />Subsequent visits will be instant (cached for 15 minutes).
        </p>
      </div>

      <script dangerouslySetInnerHTML={{ __html: loadingScript(sseUrl, challengeUrl) }} />
    </Layout>
  );
}

function loadingScript(sseUrl: string, challengeUrl: string): string {
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
    'finalizing': 'phase-complete',
    'complete': 'phase-complete'
  };

  var phaseOrder = ['phase-connecting', 'phase-loading-decks', 'phase-organizing', 'phase-combos', 'phase-complete'];
  var completedPhases = new Set();
  var currentPhaseId = null;

  function setPhaseActive(phase) {
    var elementId = phaseMap[phase];
    if (!elementId) return;

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
    progressText.textContent = data.progress + '%';
    statusMessage.textContent = data.message;
    statusDetail.textContent = data.detail || '';

    setPhaseActive(data.phase);
  });

  source.addEventListener('complete', function(e) {
    var data = JSON.parse(e.data);
    source.close();

    progressBar.style.width = '100%';
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
      var retryHtml = '<div style="margin-top: 2rem; text-align: center;">' +
        '<a href="javascript:window.location.reload()" style="color: var(--accent-green); margin-right: 1.5rem;">Try Again</a>' +
        '<a href="/" style="color: var(--accent-purple);">Back to Home</a></div>';
      container.insertAdjacentHTML('beforeend', retryHtml);
      return;
    }

    // EventSource built-in error (connection lost)
    source.close();
    statusMessage.textContent = 'Connection lost. Please refresh to try again.';
    statusDetail.textContent = '';
    progressBar.classList.add('error');
    progressText.textContent = 'Error';
  });

  // Fallback: if nothing happens in 90s, just go to the challenge page directly
  setTimeout(function() {
    if (source.readyState !== 2) {
      source.close();
      window.location.href = ${JSON.stringify(challengeUrl)};
    }
  }, 90000);
})();
`;
}
