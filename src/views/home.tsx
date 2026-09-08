/**
 * Landing page — username search form.
 */

import { Layout } from './layout.js';

export function HomePage() {
  return (
    <Layout title="The Command Crypt — EDH Deck Tools">
      <div class="hero">
        <h1>
          <span class="logo-mark hero-mark" aria-hidden="true">
            <svg
              class="logo-mark-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              fill="currentColor"
            >
              {/* Skull icon reused from the site favicon (src/public/favicon.svg). */}
              <path d="M480 491.4C538.5 447.4 576 379.8 576 304C576 171.5 461.4 64 320 64C178.6 64 64 171.5 64 304C64 379.8 101.5 447.4 160 491.4L160 528C160 554.5 181.5 576 208 576L240 576L240 536C240 522.7 250.7 512 264 512C277.3 512 288 522.7 288 536L288 576L352 576L352 536C352 522.7 362.7 512 376 512C389.3 512 400 522.7 400 536L400 576L432 576C458.5 576 480 554.5 480 528L480 491.4zM160 320C160 284.7 188.7 256 224 256C259.3 256 288 284.7 288 320C288 355.3 259.3 384 224 384C188.7 384 160 355.3 160 320zM416 256C451.3 256 480 284.7 480 320C480 355.3 451.3 384 416 384C380.7 384 352 355.3 352 320C352 284.7 380.7 256 416 256z" />
            </svg>
          </span>
          <span class="hero-title-text">The Command Crypt</span>
        </h1>

        <p class="hero-subtitle">
          Track your progress toward building a Commander deck for every color
          identity in Magic: The Gathering. Enter your Moxfield username to see
          how you're doing.
        </p>

        <div class="hero-search">
          <form class="search-form-wrap" action="/search" method="get" id="home-search-form">
            <fieldset class="mode-toggle" aria-label="What do you want to check?">
              <label class="mode-option">
                <input type="radio" name="mode" value="challenge" checked />
                <span class="mode-option-label">📊 32 Deck Challenge</span>
              </label>
              <label class="mode-option">
                <input type="radio" name="mode" value="cedh" />
                <span class="mode-option-label">⚔️ Build a cEDH Deck</span>
              </label>
              <label class="mode-option">
                <input type="radio" name="mode" value="build" />
                <span class="mode-option-label">🛠️ Build a Commander</span>
              </label>
            </fieldset>
            <div class="search-form">
              <input
                type="text"
                name="username"
                placeholder="Enter Moxfield username..."
                required
                minLength={2}
                maxLength={50}
                autofocus
              />
              <button type="submit">Go</button>
            </div>

            {/*
              Commander selection fields — only relevant for "Build a Commander"
              mode. Hidden by default (challenge is preselected). The inline
              script below reveals them when `build` is selected and toggles the
              `required`/`name` attributes so non-build submissions aren't blocked
              and build submissions carry commander/partner/companion.
            */}
            <fieldset
              class="commander-fields"
              id="commander-fields"
              aria-label="Commander selection"
              hidden
            >
              <div class="commander-field">
                <label for="commander-input">
                  Commander <span class="field-required">(required)</span>
                </label>
                <div class="autocomplete" data-autocomplete="commanders">
                  <input
                    type="text"
                    id="commander-input"
                    data-build-name="commander"
                    placeholder="Search for a commander..."
                    autocomplete="off"
                    role="combobox"
                    aria-expanded="false"
                    aria-autocomplete="list"
                    aria-controls="commander-input-list"
                    maxLength={200}
                  />
                  <ul
                    class="autocomplete-list"
                    id="commander-input-list"
                    role="listbox"
                    hidden
                  />
                </div>
              </div>

              <div class="commander-field">
                <label for="partner-input">
                  Partner <span class="field-optional">(optional)</span>
                </label>
                <div class="autocomplete" data-autocomplete="commanders">
                  <input
                    type="text"
                    id="partner-input"
                    data-build-name="partner"
                    placeholder="Search for a partner commander..."
                    autocomplete="off"
                    role="combobox"
                    aria-expanded="false"
                    aria-autocomplete="list"
                    aria-controls="partner-input-list"
                    maxLength={200}
                  />
                  <ul
                    class="autocomplete-list"
                    id="partner-input-list"
                    role="listbox"
                    hidden
                  />
                </div>
              </div>

              <div class="commander-field">
                <label for="companion-input">
                  Companion <span class="field-optional">(optional)</span>
                </label>
                <div class="autocomplete" data-autocomplete="companions">
                  <input
                    type="text"
                    id="companion-input"
                    data-build-name="companion"
                    placeholder="Search for a companion..."
                    autocomplete="off"
                    role="combobox"
                    aria-expanded="false"
                    aria-autocomplete="list"
                    aria-controls="companion-input-list"
                    maxLength={200}
                  />
                  <ul
                    class="autocomplete-list"
                    id="companion-input-list"
                    role="listbox"
                    hidden
                  />
                </div>
              </div>

              {/*
                Opt-in deck picker. When checked, the build submission is routed
                to the deck-selection ("character select") screen first, so the
                user can choose which of their commander decks seed the owned
                collection. The `name` is toggled by the inline script so it's
                only submitted in build mode.
              */}
              <label class="deck-picker-toggle">
                <input
                  type="checkbox"
                  id="select-decks-input"
                  data-build-name="selectDecks"
                />
                <span class="deck-picker-label">
                  Let me pick which decks to include
                  <span class="deck-picker-hint">
                    Choose specific decks to seed your collection instead of all
                    of them — e.g. only your Knights deck.
                  </span>
                </span>
              </label>
            </fieldset>
          </form>
          <p class="search-hint">
            First lookup takes 10-30 seconds while we fetch your decks from Moxfield.
          </p>
        </div>

        <div class="features">
          <div class="feature-card">
            <h3>📊 32 Slots</h3>
            <p>
              All 32 color identities from colorless to 5-color. See which ones
              you've filled and which are still open.
            </p>
          </div>
          <div class="feature-card">
            <h3>🎨 Commander Art</h3>
            <p>
              Each filled slot shows your commander's card art from Scryfall.
              Partners and multi-deck slots supported.
            </p>
          </div>
          <div class="feature-card">
            <h3>⚔️ cEDH Match</h3>
            <p>
              Switch to "Build a cEDH Deck" to see which competitive decks from
              the cEDH Decklist Database you're closest to owning — with a buy
              list of the cards you're missing.
            </p>
          </div>
          <div class="feature-card">
            <h3>🛠️ Build a Commander</h3>
            <p>
              Pick any commander (plus optional partner and companion) and see
              which of EDHREC's recommended cards you already own versus what
              you'd need to buy — with a CAD-priced buy list.
            </p>
          </div>
          <div class="feature-card">
            <h3>💰 CAD Buy Lists</h3>
            <p>
              Missing cards are priced from Scryfall and converted to Canadian
              dollars at the day's exchange rate, so every buy list totals up in
              CAD.
            </p>
          </div>
          <div class="feature-card">
            <h3>⚡ Instant Revisits</h3>
            <p>
              Your first lookup fetches everything from Moxfield; results are
              cached for 15 minutes so coming back is instant. Force a refresh
              any time you update your decks.
            </p>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: homeScript() }} />
    </Layout>
  );
}

/**
 * Inline, dependency-free progressive enhancement for the home form:
 *  - Show/hide the commander fields based on the selected mode, and toggle the
 *    `required`/`name` attributes so challenge/cedh submissions aren't blocked
 *    by the commander field and build submissions carry the right params.
 *  - Debounced, keyboard-accessible Scryfall autocomplete for the commander,
 *    partner (commanders endpoint), and companion (companions endpoint) inputs.
 *    Degrades gracefully when the endpoint returns { error } or fails.
 */
function homeScript(): string {
  return `
(function() {
  var form = document.getElementById('home-search-form');
  if (!form) return;

  var commanderFields = document.getElementById('commander-fields');
  var modeRadios = form.querySelectorAll('input[name="mode"]');
  var buildInputs = form.querySelectorAll('[data-build-name]');

  // --- Mode toggle: reveal/hide build fields, toggle name/required ---
  function selectedMode() {
    for (var i = 0; i < modeRadios.length; i++) {
      if (modeRadios[i].checked) return modeRadios[i].value;
    }
    return 'challenge';
  }

  function syncMode() {
    var isBuild = selectedMode() === 'build';
    if (commanderFields) commanderFields.hidden = !isBuild;

    buildInputs.forEach(function(input) {
      var fieldName = input.getAttribute('data-build-name');
      if (isBuild) {
        // Activate the field so its value is submitted with the GET form.
        input.setAttribute('name', fieldName);
        if (fieldName === 'commander') input.setAttribute('required', 'required');
      } else {
        // Deactivate: no name means it's excluded from the submission, and
        // removing required prevents it from blocking challenge/cedh submits.
        input.removeAttribute('name');
        input.removeAttribute('required');
      }
    });
  }

  modeRadios.forEach(function(radio) {
    radio.addEventListener('change', syncMode);
  });
  syncMode();

  // --- Autocomplete ---
  var MIN_CHARS = 2;
  var DEBOUNCE_MS = 300;

  function debounce(fn, wait) {
    var t;
    return function() {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function() { fn.apply(ctx, args); }, wait);
    };
  }

  function endpointFor(kind) {
    return kind === 'companions'
      ? '/api/scryfall/companions'
      : '/api/scryfall/commanders';
  }

  function setupAutocomplete(wrapper) {
    var input = wrapper.querySelector('[data-build-name]');
    var list = wrapper.querySelector('.autocomplete-list');
    if (!input || !list) return;

    var kind = wrapper.getAttribute('data-autocomplete') || 'commanders';
    var activeIndex = -1;
    var currentSeq = 0;

    function closeList() {
      list.innerHTML = '';
      list.hidden = true;
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function renderSuggestions(suggestions) {
      list.innerHTML = '';
      activeIndex = -1;
      if (!suggestions || suggestions.length === 0) {
        closeList();
        return;
      }
      suggestions.forEach(function(s, i) {
        var li = document.createElement('li');
        li.className = 'autocomplete-item';
        li.setAttribute('role', 'option');
        li.id = input.id + '-opt-' + i;
        li.setAttribute('aria-selected', 'false');
        li.textContent = s.name;
        li.addEventListener('mousedown', function(e) {
          // mousedown (not click) so it fires before the input blur.
          e.preventDefault();
          choose(s.name);
        });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function choose(name) {
      input.value = name;
      closeList();
      input.focus();
    }

    function highlight(index) {
      var items = list.querySelectorAll('.autocomplete-item');
      if (items.length === 0) return;
      if (index < 0) index = items.length - 1;
      if (index >= items.length) index = 0;
      activeIndex = index;
      for (var i = 0; i < items.length; i++) {
        var on = i === activeIndex;
        items[i].classList.toggle('active', on);
        items[i].setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) input.setAttribute('aria-activedescendant', items[i].id);
      }
    }

    var doFetch = debounce(function() {
      var q = input.value.trim();
      if (q.length < MIN_CHARS) { closeList(); return; }
      var seq = ++currentSeq;
      fetch(endpointFor(kind) + '?q=' + encodeURIComponent(q), {
        headers: { 'Accept': 'application/json' }
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (seq !== currentSeq) return; // stale response
          // Degrade gracefully on the endpoint's error flag.
          if (!data || data.error) { closeList(); return; }
          renderSuggestions(data.suggestions || []);
        })
        .catch(function() {
          if (seq !== currentSeq) return;
          closeList();
        });
    }, DEBOUNCE_MS);

    input.addEventListener('input', doFetch);

    input.addEventListener('keydown', function(e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(activeIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(activeIndex - 1); }
      else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          var items = list.querySelectorAll('.autocomplete-item');
          if (items[activeIndex]) { e.preventDefault(); choose(items[activeIndex].textContent); }
        }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    input.addEventListener('blur', function() {
      // Delay so a mousedown selection can complete first.
      setTimeout(closeList, 150);
    });
  }

  form.querySelectorAll('.autocomplete').forEach(setupAutocomplete);
})();
`;
}
