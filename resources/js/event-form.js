class EventBoardGameManager {
  constructor() {
    this.storageKey = 'snuffel-events-v1';
    this.supabaseConfig = window.SUPABASE_CONFIG || null;
    this.adminPassword = window.SNUFFEL_ADMIN_PASSWORD || 'snuffel-admin';
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
    this.addVisibilityHandlers();
    this.loadEvents();
  }

  bindEvents() {
    if (this.form) {
      this.form.addEventListener('submit', (event) => this.handleCreateEvent(event));
    }

    if (this.eventsList) {
      this.eventsList.addEventListener('click', (event) => {
        const button = event.target.closest('.delete-event-button');
        if (button) {
          event.preventDefault();
          this.handleDeleteEvent(button.dataset.eventId, button.dataset.eventTitle);
        }
      });
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

  addVisibilityHandlers() {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.setStatus('Pagina opnieuw laden…');
        this.loadEvents().catch((error) => {
          console.error('Kon evenementen niet opnieuw laden:', error);
        });
      }
    });
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
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/boardgame_tables?select=*,signups(*)`, {
      headers: {
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Supabase HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    if (data.length > 0 && !('signups' in data[0])) {
      const signups = await this.loadSignupsFromSupabase();
      return this.mergeEventsWithSignups(data, signups);
    }

    return data.map((item) => this.mapSupabaseRowToEvent(item));
  }

  async loadSignupsFromSupabase() {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/signups?select=*`, {
      headers: {
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Supabase signups HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  mergeEventsWithSignups(events, signups) {
    return events.map((event) => {
      const eventSignups = signups.filter((signup) => {
        return (
          signup.table_id === event.id ||
          signup.event_id === event.id ||
          signup.boardgame_table_id === event.id
        );
      });

      return this.mapSupabaseRowToEvent({ ...event, signups: eventSignups });
    });
  }

  mapSupabaseRowToEvent(row) {
    return {
      id: row.id,
      title: row.boardgame_name || row.title || '',
      boardgameName: row.boardgame_name || row.title || '',
      date: row.date,
      time: row.time,
      maxPlayers: Number(row.max_players || row.maxPlayers || 0),
      bggId: row.bgg_id || row.bggId || '',
      thumbnail: row.thumbnail_url || row.thumbnail || '',
      description: row.description || '',
      creatorEmail: row.creator_email || row.creatorEmail || '',
      deleteCode: row.delete_code || row.deleteCode || '',
      signups: Array.isArray(row.signups) ? row.signups : [],
      createdAt: row.created_at || row.createdAt,
    };
  }

  mapEventToSupabaseRow(event) {
    return {
      boardgame_name: event.boardgameName || event.title,
      date: event.date,
      time: event.time,
      max_players: event.maxPlayers,
      bgg_id: event.bggId,
      thumbnail_url: event.thumbnail,
      description: event.description,
      creator_email: event.creatorEmail,
      delete_code: event.deleteCode,
      created_at: event.createdAt,
    };
  }

  async persistToSupabase(event) {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/boardgame_tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(this.mapEventToSupabaseRow(event)),
    });

    if (!response.ok) {
      throw new Error(`Supabase POST HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async persistSignupToSupabase(signup) {
    const payloadCandidates = [
      { boardgame_table_id: signup.tableId, name: signup.name, joined_at: signup.joinedAt },
      { event_id: signup.tableId, name: signup.name, joined_at: signup.joinedAt },
      { table_id: signup.tableId, name: signup.name, joined_at: signup.joinedAt },
    ];

    let lastError = null;

    for (const payload of payloadCandidates) {
      try {
        const response = await fetch(`${this.supabaseConfig.url}/rest/v1/signups`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.supabaseConfig.anonKey,
            Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return response.json();
        }

        lastError = new Error(`Supabase signup POST HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Kon inschrijving niet naar Supabase sturen.');
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
    const creatorEmail = (formData.get('creator-email') || '').toString().trim();
    const date = (formData.get('date') || '').toString().trim();
    const time = (formData.get('time') || '').toString().trim();
    const maxPlayers = Number(formData.get('max-players') || 0);

    if (!title || !date || !time || !maxPlayers) {
      this.setStatus('Vul alle verplichte velden in, inclusief een geldig max. aantal spelers.', true);
      return;
    }

    if (!this.isValidEmail(creatorEmail)) {
      this.setStatus('Vul een geldig e-mailadres in zodat we een verwijdercode kunnen bewaren.', true);
      return;
    }

    const deleteCode = this.generateDeleteCode();
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
      creatorEmail,
      deleteCode,
      signups: [],
      createdAt: new Date().toISOString(),
    };

    this.setStatus('Evenement wordt opgeslagen...');

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        const savedEvent = await this.persistToSupabase(newEvent);
        const mappedEvent = this.mapSupabaseRowToEvent({ ...savedEvent, signups: savedEvent.signups || [] });
        this.events = [mappedEvent, ...this.events];
      } else {
        this.events = [newEvent, ...this.events];
        this.saveToLocalStorage(this.events);
      }

      this.renderEvents();
      this.form.reset();
      if (this.bggResults) {
        this.bggResults.innerHTML = '';
      }

      await this.showDeleteCodeNotice(deleteCode, creatorEmail, title);
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
    const signupRecord = {
      id: this.generateId(),
      name,
      joinedAt: new Date().toISOString(),
    };
    targetEvent.signups.push(signupRecord);
    this.renderEvents();

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        await this.persistSignupToSupabase({
          tableId: eventId,
          name,
          joinedAt: signupRecord.joinedAt,
        });
        await this.loadEvents();
      } else {
        this.saveToLocalStorage(this.events);
      }

      this.setStatus('Je bent ingeschreven. De teller en deelnemerslijst zijn bijgewerkt.');
    } catch (error) {
      console.error('Kon inschrijving niet opslaan:', error);
      this.setStatus('Er ging iets mis bij het verwerken van je inschrijving.', true);
    }
  }

  async handleDeleteEvent(eventId, eventTitle) {
    if (!eventId) {
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je tafel \"${eventTitle || 'deze tafel'}\" wilt verwijderen?`);
    if (!confirmed) {
      return;
    }

    const targetEvent = this.events.find((event) => event.id === eventId);
    if (!targetEvent) {
      this.setStatus('De tafel kon niet worden gevonden.', true);
      return;
    }

    const enteredEmail = (window.prompt('Voer het e-mailadres in dat je bij de tafel hebt gebruikt.') || '').toString().trim();
    const enteredCode = (window.prompt('Voer de verwijdercode in die je hebt ontvangen.') || '').toString().trim();

    if (!enteredEmail || !enteredCode) {
      this.setStatus('Vul zowel je e-mailadres als je verwijdercode in.', true);
      return;
    }

    if (String(targetEvent.creatorEmail || '').toLowerCase() !== enteredEmail.toLowerCase()) {
      this.setStatus('Het e-mailadres komt niet overeen met deze tafel.', true);
      return;
    }

    if (String(targetEvent.deleteCode || '').toUpperCase() !== enteredCode.toUpperCase()) {
      this.setStatus('De verwijdercode is onjuist.', true);
      return;
    }

    this.setStatus('Tafel wordt verwijderd...');

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        await this.deleteFromSupabase(eventId);
      }

      this.events = this.events.filter((event) => event.id !== eventId);
      if (!this.supabaseConfig?.url || !this.supabaseConfig?.anonKey) {
        this.saveToLocalStorage(this.events);
      }

      this.renderEvents();
      this.setStatus('De tafel is verwijderd.');
    } catch (error) {
      console.error('Kon tafel niet verwijderen:', error);
      this.setStatus('Er ging iets mis bij het verwijderen van de tafel.', true);
    }
  }

  async deleteFromSupabase(eventId) {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/boardgame_tables?id=eq.${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: {
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase delete HTTP ${response.status}`);
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
        <p class="event-card-note">Verwijderbaar met het e-mailadres en de verwijdercode die je bij het aanmaken hebt ontvangen.</p>
        <div class="event-card-actions">
          <form class="signup-form" data-event-id="${this.escapeHtml(event.id)}">
            <input type="text" name="signup-name" placeholder="Jouw naam" required />
            <button type="submit" class="button small">Inschrijven</button>
          </form>
          <button type="button" class="button small danger-button delete-event-button" data-event-id="${this.escapeHtml(event.id)}" data-event-title="${this.escapeHtml(event.title)}">Verwijderen</button>
        </div>
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

  async showDeleteCodeNotice(deleteCode, creatorEmail, title) {
    const subject = `Verwijdercode voor tafel: ${title}`;
    const body = `Hallo,\n\nJe hebt een tafel aangemaakt op De Snuffelaars.\n\nTafel: ${title}\nVerwijdercode: ${deleteCode}\n\nGebruik deze code om de tafel later zelf te verwijderen.`;

    if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey && creatorEmail) {
      try {
        const emailed = await this.sendDeleteCodeEmail({
          to: creatorEmail,
          title,
          deleteCode,
          subject,
          body,
        });

        if (emailed) {
          this.setStatus(`Tafel is aangemaakt. De verwijdercode is verzonden naar ${creatorEmail}.`);
          return;
        }
      } catch (error) {
        console.error('Kon de verwijdercode-e-mail niet versturen:', error);
      }
    }

    if (creatorEmail) {
      const mailtoSubject = encodeURIComponent(subject);
      const mailtoBody = encodeURIComponent(body);
      window.location.href = `mailto:${encodeURIComponent(creatorEmail)}?subject=${mailtoSubject}&body=${mailtoBody}`;
    }

    this.setStatus(`Tafel is aangemaakt. Bewaar de verwijdercode ${deleteCode}. Je kunt deze later gebruiken om de tafel zelf te verwijderen.`);
  }

  async sendDeleteCodeEmail({ to, title, deleteCode, subject, body }) {
    if (!this.supabaseConfig?.url || !this.supabaseConfig?.anonKey) {
      return false;
    }

    const response = await fetch(`${this.supabaseConfig.url}/functions/v1/send-table-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
      body: JSON.stringify({
        to,
        title,
        deleteCode,
        subject,
        body,
        siteName: 'De Snuffelaars',
      }),
    });

    if (!response.ok) {
      throw new Error(`E-mailfunctie HTTP ${response.status}`);
    }

    const data = await response.json();
    return Boolean(data?.success);
  }

  generateDeleteCode() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `SNF-${randomPart}`;
  }

  isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
