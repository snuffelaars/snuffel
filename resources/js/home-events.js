const homeEventsContainer = document.getElementById('home-next-event');
const homeTimerElement = document.getElementById('home-next-event-timer');
const homeDataScript = document.getElementById('home-events-data');

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

const renderNextEvent = (events) => {
  if (!homeEventsContainer || !homeTimerElement) {
    return;
  }

  const now = new Date();
  const upcomingEvents = events
    .map((event) => ({
      ...event,
      dateTime: new Date(`${event.date}T${event.time || '19:30'}:00`),
    }))
    .filter((event) => event.dateTime >= now)
    .sort((a, b) => a.dateTime - b.dateTime);

  if (upcomingEvents.length === 0) {
    homeEventsContainer.innerHTML = '<p>Er is momenteel geen volgende spelavond gepland.</p>';
    homeTimerElement.textContent = '';
    return;
  }

  const nextEvent = upcomingEvents[0];
  const eventDateLabel = formatEventDateLabel(nextEvent.dateTime);
  homeEventsContainer.innerHTML = `
    <p><strong>${eventDateLabel}</strong></p>
    <p>${nextEvent.time || '19:30'} uur – ${nextEvent.location || 'De Snuffel hostel'}</p>
  `;

  const updateTimer = () => {
    const diff = nextEvent.dateTime - new Date();
    if (diff <= 0) {
      homeTimerElement.textContent = 'De spelavond is begonnen of is nu bezig.';
      return;
    }

    // Use a shorter label to avoid overflow: if days exist show "Xd HH:MM:SS", otherwise "HH:MM:SS"
    const compact = formatDuration(diff);
    homeTimerElement.textContent = `Volgende spelavond in ${compact}`;
  };

  updateTimer();
  setInterval(updateTimer, 1000);
};

const loadHomeEvents = async () => {
  try {
    const response = await fetch('resources/json/kalender.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const events = await response.json();
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('Geen evenementen gevonden');
    }

    return events;
  } catch (error) {
    if (homeDataScript?.textContent) {
      const fallbackEvents = JSON.parse(homeDataScript.textContent);
      if (Array.isArray(fallbackEvents) && fallbackEvents.length > 0) {
        return fallbackEvents;
      }
    }

    throw error;
  }
};

loadHomeEvents()
  .then((events) => {
    renderNextEvent(events);
  })
  .catch((error) => {
    console.error('Kon de homepage-kalender niet laden:', error);
    if (homeEventsContainer) {
      homeEventsContainer.innerHTML = '<p>De volgende spelavond kan momenteel niet worden geladen.</p>';
    }
    if (homeTimerElement) {
      homeTimerElement.textContent = '';
    }
  });
