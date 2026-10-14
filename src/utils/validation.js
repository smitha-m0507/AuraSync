const personalDomains = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'live.com',
  'msn.com',
  'yandex.com',
  'gmx.com'
]);

export function isOfficialEmail(email) {
  const match = String(email).trim().match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  if (!match) return false;
  const domain = match[1].toLowerCase();
  if (personalDomains.has(domain)) return false;
  if (/(gmail|yahoo|hotmail|outlook|icloud|aol|proton|live|msn|yandex|gmx|mail\.com)/.test(domain)) {
    return false;
  }
  return true;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(minutes) {
  const safeMinutes = Math.max(1, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function getInitials(name) {
  return String(name || 'AuraSync')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
