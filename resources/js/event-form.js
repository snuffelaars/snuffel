class EventBoardGameManager {
  constructor() {
    this.storageKey = 'snuffel-events-v1';
    this.supabaseConfig = window.SUPABASE_CONFIG || null;
    this.bggApiToken = window.BGG_API_TOKEN || null;
    this.bggProxyUrl = window.BGG_PROXY_URL || null;
    this.adminPassword = window.SNUFFEL_ADMIN_PASSWORD || 'snuffel-admin';
    this.form = document.getElementById('event-form');
    this.eventsList = document.getElementById('events-list');
    this.statusElement = document.getElementById('form-status');
    this.bggSearchInput = document.getElementById('bgg-search');
    this.calendarDataUrl = this.getCalendarDataUrl();
    this.calendarFallbackDates = this.getFallbackCalendarDates();
    this.bggResults = document.getElementById('bgg-results');
    this.lookupButton = document.getElementById('lookup-bgg');
    this.boardgameNameInput = document.getElementById('boardgame-name');
    this.maxPlayersInput = document.getElementById('max-players');
    this.creatorNameInput = document.getElementById('creator-name');
    this.canExplainInput = document.getElementById('can-explain');
    this.creatorJoinsInput = document.getElementById('creator-joins');
    this.bggIdInput = document.getElementById('bgg-id');
    this.thumbnailInput = document.getElementById('thumbnail-url');
    this.descriptionInput = document.getElementById('description');
    this.events = [];
    this.bindEvents();
    this.addVisibilityHandlers();
    this.initializeDateField();
    this.loadEvents();
  }

  getCalendarDataUrl() {
    const currentPath = window.location.pathname || '';
    if (currentPath.includes('/pages/')) {
      return '../resources/json/kalender.json';
    }

    return 'resources/json/kalender.json';
  }

  async initializeDateField() {
    const dateInput = this.form?.querySelector('input[name="date"]') || document.querySelector('input[name="date"]');
    if (!dateInput) {
      return;
    }

    const today = this.getDateOnlyString(new Date());

    try {
      const response = await fetch(this.calendarDataUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Kalender HTTP ${response.status}`);
      }

      const data = await response.json();
      const upcomingDate = this.getUpcomingCalendarDate(data, today);
      dateInput.value = upcomingDate || today;
    } catch (error) {
      console.warn('Kon kalenderdata niet laden voor de datumvoorselectie:', error);
      const fallbackDate = this.getUpcomingCalendarDate(this.calendarFallbackDates, today);
      dateInput.value = fallbackDate || today;
    }
  }

  getUpcomingCalendarDate(data, today) {
    if (!Array.isArray(data)) {
      return '';
    }

    return data
      .map((item) => this.normalizeCalendarDate(item?.date))
      .filter(Boolean)
      .sort()
      .find((value) => value >= today) || '';
  }

  getFallbackCalendarDates() {
    return [
      { date: '2025-12-20', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-01-31', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-02-21', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-03-07', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-04-11', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-05-09', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-06-06', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-07-11', time: '19:45', location: 'De Snuffel hostel' },
      { date: '2026-08-15', time: '19:45', location: 'De Snuffel hostel' },
    ];
  }

  normalizeCalendarDate(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
  }

  getDateOnlyString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      creatorName: row.creator_name || row.creatorName || '',
      creatorEmail: row.creator_email || row.creatorEmail || '',
      deleteCode: row.delete_code || row.deleteCode || '',
      canExplain: row.creator_explains ?? row.canExplain ?? true,
      creatorJoins: row.creator_joins ?? row.creatorJoins ?? true,
      signups: Array.isArray(row.signups) ? row.signups : [],
      createdAt: row.created_at || row.createdAt,
    };
  }

  mapEventToSupabaseRow(event, includeCreatorFields = true) {
    const row = {
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

    if (includeCreatorFields) {
      row.creator_explains = event.canExplain;
      row.creator_joins = event.creatorJoins;
    }

    if (event.creatorName) {
      row.creator_name = event.creatorName;
    }

    return row;
  }

  async persistToSupabase(event, includeCreatorFields = true) {
    const response = await fetch(`${this.supabaseConfig.url}/rest/v1/boardgame_tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(this.mapEventToSupabaseRow(event, includeCreatorFields)),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const parsed = errorText ? errorText : `Status ${response.status}`;
      throw new Error(`Supabase POST HTTP ${response.status}: ${parsed}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async persistSignupToSupabase(signup) {
    const basePayloads = [
      { boardgame_table_id: signup.tableId, name: signup.name, email: signup.email, joined_at: signup.joinedAt },
      { event_id: signup.tableId, name: signup.name, email: signup.email, joined_at: signup.joinedAt },
      { table_id: signup.tableId, name: signup.name, email: signup.email, joined_at: signup.joinedAt },
    ];
    const fallbackPayloads = [
      { boardgame_table_id: signup.tableId, name: signup.name, joined_at: signup.joinedAt },
      { event_id: signup.tableId, name: signup.name, joined_at: signup.joinedAt },
      { table_id: signup.tableId, name: signup.name, joined_at: signup.joinedAt },
    ];

    let lastError = null;

    for (const payload of [...basePayloads, ...fallbackPayloads]) {
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

  getCreatorDisplayName(creatorEmail) {
    const trimmedEmail = (creatorEmail || '').toString().trim();
    if (!trimmedEmail) {
      return 'Organisator';
    }

    const localPart = trimmedEmail.split('@')[0]?.trim();
    if (!localPart) {
      return 'Organisator';
    }

    return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  createCreatorSignupRecord(creatorName, creatorEmail, eventId) {
    return {
      id: this.generateId(),
      name: creatorName || this.getCreatorDisplayName(creatorEmail),
      email: creatorEmail,
      joinedAt: new Date().toISOString(),
      tableId: eventId,
    };
  }

  async handleCreateEvent(event) {
    event.preventDefault();

    if (!this.form) {
      return;
    }

    const formData = new FormData(this.form);
    const title = (formData.get('boardgame-name') || '').toString().trim();
    const creatorName = (formData.get('creator-name') || '').toString().trim();
    const creatorEmail = (formData.get('creator-email') || '').toString().trim();
    const date = (formData.get('date') || '').toString().trim();
    const time = (formData.get('time') || '').toString().trim();
    const maxPlayers = Number(formData.get('max-players') || 0);
    const canExplain = this.canExplainInput ? this.canExplainInput.checked : true;
    const creatorJoins = this.creatorJoinsInput ? this.creatorJoinsInput.checked : true;

    if (!title || !creatorName || !date || !time || !maxPlayers) {
      this.setStatus('Vul alle verplichte velden in, inclusief de naam en een geldig max. aantal spelers.', true);
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
      creatorName,
      creatorEmail,
      deleteCode,
      canExplain,
      creatorJoins,
      signups: [],
      createdAt: new Date().toISOString(),
    };

    const creatorSignup = creatorJoins
      ? this.createCreatorSignupRecord(creatorName, creatorEmail, newEvent.id)
      : null;

    if (creatorSignup) {
      newEvent.signups = [creatorSignup];
    }

    this.setStatus('Evenement wordt opgeslagen...');

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        let savedEvent;

        try {
          savedEvent = await this.persistToSupabase(newEvent);
        } catch (error) {
          const message = error?.message || '';
          if (message.includes('creator_explains') || message.includes('creator_joins') || message.includes('unknown column')) {
            console.warn('Retrying Supabase insert without creator_explains/creator_joins:', error);
            savedEvent = await this.persistToSupabase(newEvent, false);
          } else {
            throw error;
          }
        }

        const mappedEvent = this.mapSupabaseRowToEvent({ ...savedEvent, signups: savedEvent.signups || [] });

        this.events = [mappedEvent, ...this.events];
        this.renderEvents();

        if (creatorSignup) {
          try {
            const persistedSignup = await this.persistSignupToSupabase({
              tableId: savedEvent.id || newEvent.id,
              name: creatorSignup.name,
              email: creatorSignup.email,
              joinedAt: creatorSignup.joinedAt,
            });

            mappedEvent.signups = [{ ...creatorSignup, id: persistedSignup?.id || creatorSignup.id }];
            this.renderEvents();
          } catch (signupError) {
            console.warn('Kon de organisator niet automatisch inschrijven:', signupError);
          }
        }
      } else {
        this.events = [newEvent, ...this.events];
        this.saveToLocalStorage(this.events);
        this.renderEvents();
      }

      this.form.reset();
      await this.initializeDateField();
      if (this.bggResults) {
        this.bggResults.innerHTML = '';
      }

      await this.showDeleteCodeNotice(deleteCode, creatorEmail, title, creatorSignup ? 'Je bent automatisch ingeschreven als deelnemer.' : '');
      try {
        await this.loadEvents();
      } catch (error) {
        console.error('Kon evenementen niet opnieuw laden:', error);
      }
    } catch (error) {
      console.error('Kon evenement niet opslaan:', error);
      this.setStatus('Er ging iets mis bij het opslaan van het evenement.', true);
    }
  }

  async handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const formData = new FormData(form);
    const eventId = form.dataset.eventId;
    const action = submitter?.dataset?.action || (formData.get('signup-action') || 'join').toString().trim();
    const name = (formData.get('signup-name') || '').toString().trim();
    const email = (formData.get('signup-email') || '').toString().trim();

    if (!name) {
      this.setStatus('Vul je naam in om je in te schrijven.', true);
      return;
    }

    if (!email) {
      this.setStatus('Vul je e-mailadres in om je in te schrijven.', true);
      return;
    }

    if (!this.isValidEmail(email)) {
      this.setStatus('Vul een geldig e-mailadres in om je in te schrijven.', true);
      return;
    }

    if (action === 'leave') {
      return this.handleUnsubscribe(eventId, name, email);
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
      email,
      joinedAt: new Date().toISOString(),
    };
    targetEvent.signups.push(signupRecord);
    this.renderEvents();

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        await this.persistSignupToSupabase({
          tableId: eventId,
          name,
          email,
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

  async handleUnsubscribe(tableId, name, email) {
    if (!tableId) {
      return;
    }

    this.setStatus('Je uitschrijving wordt verwerkt...');

    try {
      const response = await fetch(`${this.supabaseConfig.url}/functions/v1/unsubscribe-table`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseConfig.anonKey,
          Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
        },
        body: JSON.stringify({ tableId, name, email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Unsubscribe HTTP ${response.status}`);
      }

      await this.loadEvents();
      this.setStatus('Je bent uitgeschreven van de tafel.');
    } catch (error) {
      console.error('Kon uitschrijving niet verwerken:', error);
      this.setStatus('Er ging iets mis bij het uitschrijven.', true);
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

    const enteredCode = (window.prompt('Voer de verwijdercode in die je hebt ontvangen.\n\nLet op: controleer ook je spam/junk folder!') || '').toString().trim();

    if (!enteredCode) {
      this.setStatus('Voer je verwijdercode in.', true);
      return;
    }

    if (String(targetEvent.deleteCode || '').toUpperCase() !== enteredCode.toUpperCase()) {
      this.setStatus('De verwijdercode is onjuist.', true);
      return;
    }

    this.setStatus('Tafel wordt verwijderd...');

    try {
      if (this.supabaseConfig?.url && this.supabaseConfig?.anonKey) {
        await this.deleteFromSupabase(eventId, enteredCode);
      }

      this.events = this.events.filter((event) => event.id !== eventId);
      if (!this.supabaseConfig?.url || !this.supabaseConfig?.anonKey) {
        this.saveToLocalStorage(this.events);
      }

      const notifiedParticipants = await this.sendCancellationEmails(targetEvent);
      this.renderEvents();
      this.setStatus(notifiedParticipants ? 'De tafel is verwijderd. De deelnemers hebben een melding ontvangen.' : 'De tafel is verwijderd.');
    } catch (error) {
      console.error('Kon tafel niet verwijderen:', error);
      this.setStatus('Er ging iets mis bij het verwijderen van de tafel.', true);
    }
  }

  async deleteFromSupabase(eventId, deleteCode) {
    const response = await fetch(`${this.supabaseConfig.url}/functions/v1/delete-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseConfig.anonKey,
        Authorization: `Bearer ${this.supabaseConfig.anonKey}`,
      },
      body: JSON.stringify({ eventId, deleteCode }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Supabase delete HTTP ${response.status}`);
    }
  }

  async sendCancellationEmails(event) {
    if (!this.supabaseConfig?.url || !this.supabaseConfig?.anonKey) {
      return false;
    }

    const recipients = Array.from(new Map((event.signups || [])
      .map((signup) => [String(signup.email || '').trim().toLowerCase(), signup]))
      .values())
      .map((signup) => ({
        name: signup.name || 'Deelnemer',
        email: String(signup.email || '').trim(),
      }))
      .filter(({ email }) => this.isValidEmail(email));

    if (recipients.length === 0) {
      return false;
    }

    const subject = `Tafel gecanceld: ${event.title}`;
    const body = `Hallo,

De tafel "${event.title}" op De Snuffelaars is geannuleerd.

Je kunt op zoek gaan naar een andere tafel of een nieuwe tafel aanmaken.`;

    let sentAll = true;

    for (const recipient of recipients) {
      try {
        const emailed = await this.sendTableEmail({
          to: recipient.email,
          title: event.title,
          subject,
          body: `Hallo ${recipient.name},\n\n${body}`,
        });

        if (!emailed) {
          sentAll = false;
        }
      } catch (error) {
        console.error('Kon annuleringsemail niet versturen:', error);
        sentAll = false;
      }
    }

    return sentAll;
  }

  renderEvents() {
    if (!this.eventsList) {
      return;
    }

    const upcomingEvents = this.events
      .filter((event) => this.isEventUpcoming(event))
      .sort((left, right) => this.compareEventDates(left, right));

    if (upcomingEvents.length === 0) {
      this.eventsList.innerHTML = '<p class="empty-state">Er zijn momenteel geen toekomstige spelavonden met open tafels.</p>';
      return;
    }

    const groupedEvents = upcomingEvents.reduce((groups, event) => {
      const dateKey = this.getEventDateKey(event);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }

      groups[dateKey].push(event);
      return groups;
    }, {});

    this.eventsList.innerHTML = Object.entries(groupedEvents)
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([dateKey, eventsForDate]) => {
        return `
          <section class="event-group">
            <h3 class="event-group-title">Tafels voor spelavond op ${this.escapeHtml(this.formatEventDateLabel(dateKey))}</h3>
            <div class="event-group-cards">
              ${eventsForDate.map((event) => this.renderEventCard(event)).join('')}
            </div>
          </section>
        `;
      })
      .join('');

    this.eventsList.querySelectorAll('.signup-form').forEach((form) => {
      form.addEventListener('submit', (event) => this.handleSignup(event));
    });
  }

  isEventUpcoming(event) {
    const eventDateTime = this.getEventDateTime(event);
    if (!eventDateTime) {
      return false;
    }

    return eventDateTime >= new Date();
  }

  compareEventDates(left, right) {
    const leftDateTime = this.getEventDateTime(left);
    const rightDateTime = this.getEventDateTime(right);

    if (!leftDateTime || !rightDateTime) {
      return this.getEventDateKey(left).localeCompare(this.getEventDateKey(right));
    }

    return leftDateTime - rightDateTime;
  }

  getEventDateKey(event) {
    return this.normalizeCalendarDate(event?.date) || 'onbekend';
  }

  getEventDateTime(event) {
    const dateValue = this.normalizeCalendarDate(event?.date);
    const timeValue = this.normalizeEventTime(event?.time);

    if (!dateValue || !timeValue) {
      return null;
    }

    const [year, month, day] = dateValue.split('-').map(Number);
    const [hours, minutes] = timeValue.split(':').map(Number);

    return new Date(year, month - 1, day, hours, minutes);
  }

  normalizeEventTime(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmed) ? trimmed : '';
  }

  formatEventDateLabel(dateValue) {
    const normalizedDate = this.normalizeCalendarDate(dateValue);
    if (!normalizedDate) {
      return 'onbekende datum';
    }

    const [year, month, day] = normalizedDate.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(parsedDate);
  }

  renderEventCard(event) {
    const signupCount = event.signups?.length || 0;
    const signupNames = (event.signups || []).map((signup) => signup.name).join(', ');
    const remainingSpots = event.maxPlayers ? event.maxPlayers - signupCount : 'onbeperkt';
    const badgeText = event.maxPlayers ? `${signupCount}/${event.maxPlayers}` : `${signupCount} deelnemer(s)`;
    const canExplainText = event.canExplain === false ? 'Nee' : 'Ja';
    const creatorJoinsText = event.creatorJoins === false ? 'Nee' : 'Ja';

    return `
      <article class="event-card">
        <div class="event-card-top">
          <div>
            <h3>${this.escapeHtml(event.title)}</h3>
            <p>${this.linkify(event.description || 'Geen extra beschrijving')}</p>
          </div>
          ${event.thumbnail ? `<img src="${this.escapeHtml(event.thumbnail)}" alt="${this.escapeHtml(event.title)}">` : ''}
        </div>
        <p><strong>Start:</strong> ${this.escapeHtml(event.date)} om ${this.escapeHtml(event.time)}</p>
        <p><strong>Max spelers:</strong> ${this.escapeHtml(String(event.maxPlayers || 'Onbekend'))}</p>
        <p><strong>Spel uitleg:</strong> ${this.escapeHtml(canExplainText)}</p>
        <p><strong>Organisator doet mee:</strong> ${this.escapeHtml(creatorJoinsText)}</p>
        <p><strong>Inschrijvingen:</strong> <span class="signup-count">${this.escapeHtml(badgeText)}</span></p>
        <p><strong>Vrije plaatsen:</strong> ${this.escapeHtml(String(remainingSpots))}</p>
        <p><strong>Deelnemers:</strong> ${this.escapeHtml(signupNames || 'Nog niemand')}</p>
        <p class="event-card-note">Verwijderbaar met het e-mailadres en de verwijdercode die je bij het aanmaken hebt ontvangen.</p>
        <div class="event-card-actions">
          <form class="signup-form" data-event-id="${this.escapeHtml(event.id)}">
            <input type="hidden" name="signup-action" value="join" />
            <input type="text" name="signup-name" placeholder="Jouw naam" autocomplete="name" required />
            <input type="email" name="signup-email" placeholder="Jouw e-mailadres" autocomplete="email" required />
            <button type="submit" class="button small" data-action="join">Inschrijven</button>
            <button type="submit" class="button small danger-button" data-action="leave">Uitschrijven</button>
          </form>
          <button type="button" class="button small danger-button delete-event-button" data-event-id="${this.escapeHtml(event.id)}" data-event-title="${this.escapeHtml(event.title)}">Verwijderen</button>
        </div>
      </article>
    `;
  }

  async fetchBggXml(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const urls = [];

    if (this.bggProxyUrl) {
      const proxyUrl = new URL(this.bggProxyUrl, window.location.origin);
      proxyUrl.searchParams.set('endpoint', endpoint);
      for (const [key, value] of Object.entries(params)) {
        proxyUrl.searchParams.set(key, value);
      }
      urls.push(proxyUrl.toString());
    }

    if (this.bggApiToken) {
      urls.push(`https://boardgamegeek.com/xmlapi2/${endpoint}?${query}`);
    }

    if (urls.length === 0) {
      throw new Error('BGG search requires a local proxy or a valid BGG API token. Set window.BGG_PROXY_URL or window.BGG_API_TOKEN.');
    }

    let lastError = null;

    for (const url of urls) {
      try {
        const headers = {
          Accept: 'application/xml,text/xml'
        };

        if (url.startsWith('https://boardgamegeek.com') && this.bggApiToken) {
          headers.Authorization = `Bearer ${this.bggApiToken}`;
        }

        const response = await fetch(url, {
          headers,
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const xml = await response.text();
        if (!xml || xml.includes('Unauthorized')) {
          throw new Error('Unauthorized');
        }

        return xml;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('BGG request failed');
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
      const xml = await this.fetchBggXml('search', {
        query,
        type: 'boardgame'
      });
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
      const xml = await this.fetchBggXml('thing', {
        id: bggId,
        stats: '1'
      });
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

  async showDeleteCodeNotice(deleteCode, creatorEmail, title, extraMessage = '') {
    const subject = `Verwijdercode voor tafel: ${title}`;
    const body = `Hallo,\n\nJe hebt een tafel aangemaakt op De Snuffelaars.\n\nTafel: ${title}\nVerwijdercode: ${deleteCode}\n\nGebruik deze code om de tafel later zelf te verwijderen.`;
    const extraNotice = extraMessage ? ` ${extraMessage}` : '';

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
          this.setStatus(`Tafel is aangemaakt. De verwijdercode is verzonden naar ${creatorEmail}.${extraNotice}`);
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

    this.setStatus(`Tafel is aangemaakt. Bewaar de verwijdercode ${deleteCode}. Je kunt deze later gebruiken om de tafel zelf te verwijderen.${extraNotice}`);
  }

  async sendTableEmail({ to, title, subject, body, deleteCode }) {
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

  async sendDeleteCodeEmail({ to, title, deleteCode, subject, body }) {
    return this.sendTableEmail({ to, title, deleteCode, subject, body });
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

  linkify(text) {
    if (!text) return '';
    const escaped = this.escapeHtml(text);
    // URLs starting with http(s)
    const urlPattern = /\bhttps?:\/\/[\w\-@:%._+~#=\/\?&;,\(\)\[\]~]+/g;
    // URLs starting with www.
    const wwwPattern = /\bwww\.[\w\-@:%._+~#=\/\?&;,\(\)\[\]~]+/g;

    const linked = escaped
      .replace(urlPattern, (match) => {
        const href = this.escapeHtml(match);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(match)}</a>`;
      })
      .replace(wwwPattern, (match) => {
        const href = this.escapeHtml('https://' + match);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(match)}</a>`;
      });

    return linked;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.eventBoardGameManager = new EventBoardGameManager();
});
