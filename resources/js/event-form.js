class EventBoardGameManager {
  constructor() {
    this.storageKey = 'snuffel-events-v1';
    this.supabaseConfig = window.SUPABASE_CONFIG || null;
    this.form = document.getElementById('event-form');
    this.eventsList = document.getElementById('events-list');
    this.statusElement = document.getElementById('form-status');
    this.bggSearchInput = document.getElementById('bgg-search');
    this.bggResults = document.getElementById('bgg-results');
    this.lookupButton = document.getElementById('lookup-bgg');
    this.boardgameNameInput = document.getElementById('boardgame-name');
    this.maxPlayersInput = document.getElementById('max-players');
    this.bggIdInput = document.getElementById('bgg-id');
    this.thumbnailInput = document.getElementById('thumbnail-url');
    this.descriptionInput = document.getElementById('description');
    this.events = [];
    this.bindEvents();
    this.loadEvents();
  }

  bindEvents() {
    if (this.form) {
      this.form.addEventListener('submit', (event) => this.handleCreateEvent(event));
    }

    if (this.lookupButton) {
      this.lookupButton.addEventListener('click', () => this.searchBoardGame());
    }

    if (this.bggSearchInput) {
      this.bggSearchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.searchBoardGame();
        }
      });
    }
  }

  async loadEvents() {
    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        this.events = await this.loadFromSupabase();
      } else {
        this.events = this.loadFromLocalStorage();
      }

      this.renderEvents();
    } catch (error) {
      console.error('Kon evenementen niet laden:', error);
      this.setStatus('Kon evenementen niet laden. De lokale fallback wordt gebruikt.', true);
      this.events = this.loadFromLocalStorage();
      this.renderEvents();
    }
  }

  loadFromLocalStorage() {
    const raw = window.localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Kon lokale data niet parsen:', error);
      return [];
    }
  }

  saveToLocalStorage(events) {
    window.localStorage.setItem(this.storageKey, JSON.stringify(events));
  }

  async loadFromSupabase() {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/events?select=*`, {
      headers: {
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data.map((item) => ({ ...item, signups: item.signups || [] })) : [];
  }

  async persistToSupabase(event) {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Supabase POST HTTP ${response.status}`);
    }

    return response.json();
  }

  async updateSupabaseEvent(event) {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/events?id=eq.${event.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Supabase PATCH HTTP ${response.status}`);
    }
  }

  setStatus(message, isError = false) {
    if (!this.statusElement) {
      return;
    }

    this.statusElement.textContent = message;
    this.statusElement.classList.toggle('status-error', isError);
  }

  async handleCreateEvent(event) {
    event.preventDefault();

    if (!this.form) {
      return;
    }

    const formData = new FormData(this.form);
    const title = (formData.get('boardgame-name') || '').toString().trim();
    const date = (formData.get('date') || '').toString().trim();
    const time = (formData.get('time') || '').toString().trim();
    const maxPlayers = Number(formData.get('max-players') || 0);

    if (!title || !date || !time || !maxPlayers) {
      this.setStatus('Vul alle verplichte velden in, inclusief een geldig max. aantal spelers.', true);
      return;
    }

    const newEvent = {
      id: this.generateId(),
      title,
      boardgameName: title,
      date,
      time,
      maxPlayers,
      bggId: (formData.get('bgg-id') || '').toString().trim(),
      thumbnail: (formData.get('thumbnail-url') || '').toString().trim(),
      description: (formData.get('description') || '').toString().trim(),
      signups: [],
      createdAt: new Date().toISOString(),
    };

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        await this.persistToSupabase(newEvent);
      } else {
        this.events = [newEvent, ...this.events];
        this.saveToLocalStorage(this.events);
      }

      this.form.reset();
      if (this.bggResults) {
        this.bggResults.innerHTML = '';
      }

      this.setStatus('Evenement is aangemaakt. Mensen kunnen zich direct inschrijven.');
      await this.loadEvents();
    } catch (error) {
      console.error('Kon evenement niet opslaan:', error);
      this.setStatus('Er ging iets mis bij het opslaan van het evenement.', true);
    }
  }

  async handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const eventId = form.dataset.eventId;
    const name = (new FormData(form).get('signup-name') || '').toString().trim();

    if (!name) {
      this.setStatus('Vul je naam in om je in te schrijven.', true);
      return;
    }

    const targetEvent = this.events.find((item) => item.id === eventId);
    if (!targetEvent) {
      this.setStatus('Het evenement kon niet worden gevonden.', true);
      return;
    }

    if (targetEvent.maxPlayers && targetEvent.signups?.length >= targetEvent.maxPlayers) {
      this.setStatus('Er is geen plek meer vrij voor dit evenement.', true);
      return;
    }

    targetEvent.signups = targetEvent.signups || [];
    targetEvent.signups.push({
      id: this.generateId(),
      name,
      joinedAt: new Date().toISOString(),
    });

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        await this.updateSupabaseEvent(targetEvent);
      } else {
        this.saveToLocalStorage(this.events);
      }

      this.setStatus('Je bent ingeschreven. De teller en deelnemerslijst zijn bijgewerkt.');
      this.renderEvents();
    } catch (error) {
      console.error('Kon inschrijving niet opslaan:', error);
      this.setStatus('Er ging iets mis bij het verwerken van je inschrijving.', true);
    }
  }

  renderEvents() {
    if (!this.eventsList) {
      return;
    }

    if (this.events.length === 0) {
      this.eventsList.innerHTML = '<p class="empty-state">Er zijn nog geen evenementen. Maak de eerste spelavond aan.</p>';
      return;
    }

    this.eventsList.innerHTML = this.events
      .map((event) => this.renderEventCard(event))
      .join('');

    this.eventsList.querySelectorAll('.signup-form').forEach((form) => {
      form.addEventListener('submit', (event) => this.handleSignup(event));
    });
  }

  renderEventCard(event) {
    const signupCount = event.signups?.length || 0;
    const signupNames = (event.signups || []).map((signup) => signup.name).join(', ');
    const remainingSpots = event.maxPlayers ? event.maxPlayers - signupCount : 'onbeperkt';
    const badgeText = event.maxPlayers ? `${signupCount}/${event.maxPlayers}` : `${signupCount} deelnemer(s)`;

    return `
      <article class="event-card">
        <div class="event-card-top">
          <div>
            <h3>${this.escapeHtml(event.title)}</h3>
            <p>${this.escapeHtml(event.description || 'Geen extra beschrijving')}</p>
          </div>
          ${event.thumbnail ? `<img src="${this.escapeHtml(event.thumbnail)}" alt="${this.escapeHtml(event.title)}">` : ''}
        </div>
        <p><strong>Start:</strong> ${this.escapeHtml(event.date)} om ${this.escapeHtml(event.time)}</p>
        <p><strong>Max spelers:</strong> ${this.escapeHtml(String(event.maxPlayers || 'Onbekend'))}</p>
        <p><strong>Inschrijvingen:</strong> <span class="signup-count">${this.escapeHtml(badgeText)}</span></p>
        <p><strong>Vrije plaatsen:</strong> ${this.escapeHtml(String(remainingSpots))}</p>
        <p><strong>Deelnemers:</strong> ${this.escapeHtml(signupNames || 'Nog niemand')}</p>
        <form class="signup-form" data-event-id="${this.escapeHtml(event.id)}">
          <input type="text" name="signup-name" placeholder="Jouw naam" required />
          <button type="submit" class="button small">Inschrijven</button>
        </form>
      </article>
    `;
  }

  async searchBoardGame() {
    if (!this.bggSearchInput || !this.bggResults) {
      return;
    }

    const query = this.bggSearchInput.value.trim();
    if (!query) {
      this.setStatus('Typ een bordspelnaam om te zoeken in BGG.', true);
      return;
    }

    this.setStatus('BGG zoekt naar resultaten…');
    this.bggResults.innerHTML = '<p>Bezig met zoeken…</p>';

    try {
      const response = await fetch(`https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame`);
      if (!response.ok) {
        throw new Error(`BGG HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parser = new DOMParser();
      const document = parser.parseFromString(xml, 'application/xml');
      const items = Array.from(document.querySelectorAll('item'));

      if (items.length === 0) {
        this.bggResults.innerHTML = '<p>Geen resultaten gevonden in BGG.</p>';
        this.setStatus('Geen resultaten gevonden in BGG.', true);
        return;
      }

      this.bggResults.innerHTML = items
        .slice(0, 5)
        .map((item) => {
          const id = item.getAttribute('id') || '';
          const name = item.querySelector('name')?.getAttribute('value') || 'Onbekend spel';
          return `<button type="button" class="search-result" data-bgg-id="${this.escapeHtml(id)}">${this.escapeHtml(name)}</button>`;
        })
        .join('');

      this.bggResults.querySelectorAll('.search-result').forEach((button) => {
        button.addEventListener('click', () => this.loadBoardGameDetails(button.dataset.bggId));
      });

      this.setStatus('Selecteer een resultaat om details en max. spelers te laden.');
    } catch (error) {
      console.error('Kon BGG niet laden:', error);
      this.bggResults.innerHTML = '<p>BGG is momenteel niet beschikbaar. Controleer je verbinding of probeer later opnieuw.</p>';
      this.setStatus('BGG is momenteel niet beschikbaar.', true);
    }
  }

  async loadBoardGameDetails(bggId) {
    if (!bggId) {
      return;
    }

    this.setStatus('Details worden opgehaald uit BGG…');
    this.bggResults.innerHTML = '<p>Details worden geladen…</p>';

    try {
      const response = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`);
      if (!response.ok) {
        throw new Error(`BGG detail HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parser = new DOMParser();
      const document = parser.parseFromString(xml, 'application/xml');
      const item = document.querySelector('item');
      const name = item?.querySelector('name[type="primary"]')?.getAttribute('value') || item?.querySelector('name')?.getAttribute('value') || 'Onbekend spel';
      const thumbnail = item?.querySelector('thumbnail')?.textContent || '';
      const description = item?.querySelector('description')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const maxPlayers = item?.querySelector('maxplayers')?.getAttribute('value') || '';

      if (this.boardgameNameInput) {
        this.boardgameNameInput.value = name;
      }
      if (this.maxPlayersInput) {
        this.maxPlayersInput.value = maxPlayers;
      }
      if (this.bggIdInput) {
        this.bggIdInput.value = bggId;
      }
      if (this.thumbnailInput) {
        this.thumbnailInput.value = thumbnail;
      }
      if (this.descriptionInput) {
        this.descriptionInput.value = description;
      }

      this.bggResults.innerHTML = `
        <div class="bgg-preview">
          <strong>${this.escapeHtml(name)}</strong>
          <p>${this.escapeHtml(description.slice(0, 220) || 'Geen beschrijving beschikbaar.')}</p>
          <p><strong>Max spelers:</strong> ${this.escapeHtml(maxPlayers || 'onbekend')}</p>
        </div>
      `;
      this.setStatus('Details geladen uit BGG. Je kunt het evenement nu opslaan.');
    } catch (error) {
      console.error('Kon BGG-details niet laden:', error);
      this.bggResults.innerHTML = '<p>Kon de details niet laden van BGG.</p>';
      this.setStatus('Kon de details niet laden van BGG.', true);
    }
  }

  generateId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.eventBoardGameManager = new EventBoardGameManager();
});
