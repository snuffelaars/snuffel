const today = new Date();

const options = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

const formatter = new Intl.DateTimeFormat('nl-NL', options);
const formattedDate = formatter.format(today);

const todayDateElement = document.getElementById('today-date');
if (todayDateElement) {
  todayDateElement.textContent = `Vandaag: ${formattedDate}`;
}

const footer = document.querySelector('footer');
if (footer) {
  footer.innerHTML = `&copy; ${today.getFullYear()} De Snuffelaars - bordspelclub`;
}

const timerElement = document.getElementById('next-event-timer');
const kalenderListElement = document.getElementById('kalender-list');
const kalenderDataScript = document.getElementById('kalender-data');
let kalenderItems = [];

const parseItemDateTime = (item) => {
  const dateString = item.dataset.date;
  const timeString = item.dataset.time || '19:30';
  return new Date(`${dateString}T${timeString}:00`);
};

const formatEventDateLabel = (date) => {
  const formatted = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const formatDuration = (milliseconds) => {
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
};

const renderCalendar = (events) => {
  if (!kalenderListElement) {
    return;
  }

  kalenderListElement.innerHTML = events
    .map((event) => {
      const eventDate = new Date(`${event.date}T${event.time || '19:30'}:00`);
      const formattedDate = formatEventDateLabel(eventDate);
      const location = event.location || 'De Snuffel hostel';

      return `
        <div class="kalender-item" data-date="${event.date}" data-time="${event.time || '19:30'}">
          <p><strong>${formattedDate}</strong> | ${event.time || '19:30'} uur – ${location}</p>
        </div>
      `;
    })
    .join('');

  kalenderItems = Array.from(document.querySelectorAll('.kalender-item'));
  updatekalender();
  setInterval(updatekalender, 1000);
};

const updatekalender = () => {
  const now = new Date();
  const nextIndex = kalenderItems.findIndex((item) => parseItemDateTime(item) >= now);

  kalenderItems.forEach((item, index) => {
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

  if (timerElement) {
    if (nextIndex === -1) {
      timerElement.textContent = 'Geen volgende spelavond gepland.';
      return;
    }

    const targetDate = parseItemDateTime(kalenderItems[nextIndex]);
    const diff = targetDate - now;
    if (diff <= 0) {
      timerElement.textContent = 'De volgende spelavond is begonnen of is nu bezig.';
      return;
    }

    const compact = formatDuration(diff);
    timerElement.textContent = `Volgende spelavond in ${compact}`;
  }
};

const loadEvents = async () => {
  try {
    const response = await fetch('../resources/json/kalender.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const events = await response.json();
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('Geen evenementen gevonden');
    }

    return events;
  } catch (error) {
    if (kalenderDataScript?.textContent) {
      const fallbackEvents = JSON.parse(kalenderDataScript.textContent);
      if (Array.isArray(fallbackEvents) && fallbackEvents.length > 0) {
        return fallbackEvents;
      }
    }

    throw error;
  }
};

loadEvents()
  .then((events) => {
    renderCalendar(events);
  })
  .catch((error) => {
    console.error('Kon kalender niet laden:', error);
    if (kalenderListElement) {
      kalenderListElement.innerHTML = '<p>De kalender kan momenteel niet worden geladen.</p>';
    }
    if (timerElement) {
      timerElement.textContent = 'De kalender kan momenteel niet worden geladen.';
    }
  });
