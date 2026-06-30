class EventCalendarManager {
  constructor() {
    this.today = new Date();
  }

  static parseEventDateTime(event) {
    return new Date(`${event.date}T${event.time || '19:30'}:00`);
  }

  static formatEventDateLabel(date) {
    const formatted = new Intl.DateTimeFormat('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  static formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const weeks = Math.floor(totalSeconds / 604800);
    const days = Math.floor((totalSeconds % 604800) / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const two = (n) => String(n).padStart(2, '0');

    const parts = [];
    if (weeks > 0) {
      parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weken'}`);
    }
    if (days > 0) {
      parts.push(`${days}d`);
    }

    const timePart = `${two(hours)}:${two(minutes)}:${two(seconds)}`;
    if (parts.length > 0) {
      return `${parts.join(', ')} ${timePart}`;
    }

    return timePart;
  }

  async loadEvents({ dataUrl, fallbackScriptElement }) {
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const events = await response.json();
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('Geen evenementen gevonden');
      }

      return events;
    } catch (error) {
      if (fallbackScriptElement?.textContent) {
        try {
          const fallbackEvents = JSON.parse(fallbackScriptElement.textContent);
          if (Array.isArray(fallbackEvents) && fallbackEvents.length > 0) {
            return fallbackEvents;
          }
        } catch (fallbackError) {
          console.warn('Kon fallback-events niet parsen:', fallbackError);
        }
      }

      throw error;
    }
  }

  initPageHeader() {
    const todayDateElement = document.getElementById('today-date');
    if (todayDateElement) {
      const options = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      };
      const formatter = new Intl.DateTimeFormat('nl-NL', options);
      todayDateElement.textContent = `Vandaag: ${formatter.format(this.today)}`;
    }

    const footer = document.querySelector('footer');
    if (footer) {
      footer.innerHTML = `&copy; ${this.today.getFullYear()} De Snuffelaars - bordspelclub`;
    }
  }

  async initHomeSummary({
    containerElement,
    timerElement,
    dataUrl,
    fallbackScriptElement,
    emptyMessage = 'Er is momenteel geen volgende spelavond gepland.',
    loadingMessage = 'De volgende spelavond kan momenteel niet worden geladen.',
    timerLabel = 'Volgende spelavond in',
  }) {
    if (!containerElement || !timerElement) {
      return;
    }

    let timerIntervalId = null;
    const renderNextEvent = (events) => {
      const now = new Date();
      const upcomingEvents = events
        .map((event) => ({
          ...event,
          dateTime: EventCalendarManager.parseEventDateTime(event),
        }))
        .filter((event) => event.dateTime >= now)
        .sort((a, b) => a.dateTime - b.dateTime);

      if (upcomingEvents.length === 0) {
        containerElement.innerHTML = `<p>${emptyMessage}</p>`;
        timerElement.textContent = '';
        return;
      }

      const nextEvent = upcomingEvents[0];
      const eventDateLabel = EventCalendarManager.formatEventDateLabel(nextEvent.dateTime);
      containerElement.innerHTML = `
        <p><strong>${eventDateLabel}</strong></p>
        <p>${nextEvent.time || '19:30'} uur – ${nextEvent.location || 'De Snuffel hostel'}</p>
      `;

      const updateTimer = () => {
        const diff = nextEvent.dateTime - new Date();
        if (diff <= 0) {
          timerElement.textContent = 'De spelavond is begonnen of is nu bezig.';
          return;
        }

        timerElement.textContent = `${timerLabel} ${EventCalendarManager.formatDuration(diff)}`;
      };

      updateTimer();
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
      }
      timerIntervalId = window.setInterval(updateTimer, 1000);
    };

    try {
      const events = await this.loadEvents({ dataUrl, fallbackScriptElement });
      renderNextEvent(events);
    } catch (error) {
      console.error('Kon de homepage-kalender niet laden:', error);
      containerElement.innerHTML = `<p>${loadingMessage}</p>`;
      timerElement.textContent = '';
    }
  }

  async initCalendarView({
    listElement,
    timerElement,
    dataUrl,
    fallbackScriptElement,
    emptyMessage = 'Geen volgende spelavond gepland.',
    loadingMessage = 'De kalender kan momenteel niet worden geladen.',
    timerLabel = 'Volgende spelavond in',
  }) {
    if (!listElement && !timerElement) {
      return;
    }

    this.initPageHeader();

    let calendarItems = [];
    let timerIntervalId = null;

    const parseItemDateTime = (item) => EventCalendarManager.parseEventDateTime({
      date: item.dataset.date,
      time: item.dataset.time || '19:30',
    });

    const updateCalendar = () => {
      const now = new Date();
      const nextIndex = calendarItems.findIndex((item) => parseItemDateTime(item) >= now);

      calendarItems.forEach((item, index) => {
        item.classList.remove('kalender-next', 'kalender-past');
        if (nextIndex >= 0) {
          if (index < nextIndex) {
            item.classList.add('kalender-past');
          } else if (index === nextIndex) {
            item.classList.add('kalender-next');
          }
        } else {
          item.classList.add('kalender-past');
        }
      });

      if (!timerElement) {
        return;
      }

      if (nextIndex === -1) {
        timerElement.textContent = emptyMessage;
        return;
      }

      const targetDate = parseItemDateTime(calendarItems[nextIndex]);
      const diff = targetDate - now;
      if (diff <= 0) {
        timerElement.textContent = 'De volgende spelavond is begonnen of is nu bezig.';
        return;
      }

      timerElement.textContent = `${timerLabel} ${EventCalendarManager.formatDuration(diff)}`;
    };

    const renderCalendar = (events) => {
      if (!listElement) {
        return;
      }

      listElement.innerHTML = events
        .map((event) => {
          const eventDate = EventCalendarManager.parseEventDateTime(event);
          const formattedDate = EventCalendarManager.formatEventDateLabel(eventDate);
          const location = event.location || 'De Snuffel hostel';

          return `
            <div class="kalender-item" data-date="${event.date}" data-time="${event.time || '19:30'}">
              <p><strong>${formattedDate}</strong> | ${event.time || '19:30'} uur – ${location}</p>
            </div>
          `;
        })
        .join('');

      calendarItems = Array.from(listElement.querySelectorAll('.kalender-item'));
      updateCalendar();
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
      }
      timerIntervalId = window.setInterval(updateCalendar, 1000);
    };

    try {
      const events = await this.loadEvents({ dataUrl, fallbackScriptElement });
      renderCalendar(events);
    } catch (error) {
      console.error('Kon kalender niet laden:', error);
      if (listElement) {
        listElement.innerHTML = `<p>${loadingMessage}</p>`;
      }
      if (timerElement) {
        timerElement.textContent = loadingMessage;
      }
    }
  }
}

const calendarManager = new EventCalendarManager();

window.addEventListener('DOMContentLoaded', () => {
  const homeEventsContainer = document.getElementById('home-next-event');
  const homeTimerElement = document.getElementById('home-next-event-timer');
  const homeDataScript = document.getElementById('home-events-data');
  const kalenderListElement = document.getElementById('kalender-list');
  const nextEventTimerElement = document.getElementById('next-event-timer');
  const kalenderDataScript = document.getElementById('kalender-data');

  if (homeEventsContainer && homeTimerElement) {
    calendarManager.initHomeSummary({
      containerElement: homeEventsContainer,
      timerElement: homeTimerElement,
      dataUrl: 'resources/json/kalender.json',
      fallbackScriptElement: homeDataScript,
    });
  }

  if (kalenderListElement || nextEventTimerElement) {
    calendarManager.initCalendarView({
      listElement: kalenderListElement,
      timerElement: nextEventTimerElement,
      dataUrl: '../resources/json/kalender.json',
      fallbackScriptElement: kalenderDataScript,
    });
  }
});

window.EventCalendarManager = EventCalendarManager;
