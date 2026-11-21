/** RideMitra form validation helpers. Each validator returns an error string or ''. */

const pad = (n) => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const maxDateISO = (days = 180) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const CITY_RE = /^[\p{L}][\p{L}\s.'()-]{1,49}$/u;
const NAME_RE = /^[\p{L}][\p{L}\s.'-]{1,49}$/u;

/** Strip spaces/dashes and an optional +91 / 91 / 0 prefix. Returns 10 digits or the cleaned input. */
export function normalisePhone(v) {
  let d = String(v || '').replace(/[\s()-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export const v = {
  city(value, label = 'City') {
    const s = String(value || '').trim();
    if (!s) return `${label} is required.`;
    if (!CITY_RE.test(s)) return `Enter a valid ${label.toLowerCase()} (letters only, 2–50 characters).`;
    return '';
  },
  differentCities(from, to) {
    if (from && to && from.trim().toLowerCase() === to.trim().toLowerCase()) return 'Destination must be different from the starting city.';
    return '';
  },
  date(value, { required = true } = {}) {
    if (!value) return required ? 'Travel date is required.' : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date.';
    if (value < todayISO()) return 'Travel date cannot be in the past.';
    if (value > maxDateISO()) return 'Rides can be planned up to 6 months ahead.';
    return '';
  },
  time(value, date) {
    if (!value) return 'Departure time is required.';
    if (!/^\d{2}:\d{2}$/.test(value)) return 'Enter a valid time.';
    if (date === todayISO()) {
      const [h, m] = value.split(':').map(Number);
      const dep = new Date(); dep.setHours(h, m, 0, 0);
      if (dep.getTime() < Date.now() + 15 * 60 * 1000) return 'Departure must be at least 15 minutes from now.';
    }
    return '';
  },
  seats(value, { min = 1, max = 6, label = 'Seats' } = {}) {
    const n = Number(value);
    if (value === '' || value == null) return `${label} is required.`;
    if (!Number.isInteger(n) || n < min || n > max) return `${label} must be a whole number from ${min} to ${max}.`;
    return '';
  },
  price(value) {
    if (value === '' || value == null) return 'Price per passenger is required.';
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Enter the price as a whole number of rupees.';
    if (n < 1) return 'Price must be at least ₹1.';
    if (n > 10000) return 'Price cannot exceed ₹10,000 per passenger.';
    return '';
  },
  name(value, label = 'Name') {
    const s = String(value || '').trim();
    if (!s) return `${label} is required.`;
    if (!NAME_RE.test(s)) return `Enter a valid ${label.toLowerCase()} (letters only, 2–50 characters).`;
    return '';
  },
  vehicle(value) {
    const s = String(value || '').trim();
    if (!s) return 'Vehicle name/model is required.';
    if (s.length < 2 || s.length > 60) return 'Vehicle details must be 2–60 characters.';
    return '';
  },
  phone(value) {
    const s = String(value || '').trim();
    if (!s) return 'Mobile number is required.';
    if (!/^[6-9]\d{9}$/.test(normalisePhone(s))) return 'Enter a valid 10-digit Indian mobile number (starting 6–9).';
    return '';
  },
};

/** Show/clear an inline error for an input inside a `.field` wrapper. */
export function setError(input, message) {
  const field = input.closest('.field');
  if (!field) return;
  let el = field.querySelector('.err');
  if (!el) { el = document.createElement('small'); el.className = 'err'; el.id = `${input.id}-err`; field.appendChild(el); }
  el.textContent = message;
  field.classList.toggle('invalid', !!message);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) input.setAttribute('aria-describedby', el.id); else input.removeAttribute('aria-describedby');
}

/**
 * Run a map of { inputId: () => errorString } against a form.
 * Returns true when every check passes; focuses the first invalid input otherwise.
 */
export function validateForm(form, checks) {
  let first = null;
  for (const [id, check] of Object.entries(checks)) {
    const input = form.querySelector(`#${id}`);
    const msg = check();
    setError(input, msg);
    if (msg && !first) first = input;
  }
  if (first) first.focus();
  return !first;
}
