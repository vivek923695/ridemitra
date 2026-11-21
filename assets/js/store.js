/**
 * RideMitra data layer (Phase 2 — browser storage).
 *
 * Every method is async and returns plain objects, so this module can later be
 * swapped for an API-backed implementation (e.g. Netlify Database) without
 * changing the UI code. See docs/data-model.md for the schema.
 *
 * @typedef {Object} Ride
 * @property {string}  id
 * @property {string}  from            Starting city
 * @property {string}  to              Destination city
 * @property {string}  date            Travel date, "YYYY-MM-DD" (local)
 * @property {string}  time            Departure time, "HH:MM" (24h, local)
 * @property {number}  seatsTotal      Seats offered when the ride was published
 * @property {number}  seatsAvailable  Seats still open for booking
 * @property {number}  pricePerSeat    Price per passenger in INR
 * @property {string}  vehicle         Vehicle name / model
 * @property {string}  driverName
 * @property {string}  driverPhone     Normalised 10-digit Indian mobile number
 * @property {string}  ownerId         Device/user id of the person who offered the ride
 * @property {'active'|'cancelled'} status
 * @property {boolean} isDemo          true for clearly-labelled sample listings
 * @property {number}  createdAt       Epoch ms
 *
 * @typedef {Object} Booking
 * @property {string}  id
 * @property {string}  rideId
 * @property {string}  userId          Device/user id of the passenger
 * @property {string}  passengerName
 * @property {string}  passengerPhone  Normalised 10-digit Indian mobile number
 * @property {number}  seats
 * @property {'booked'|'cancelled'} status
 * @property {number}  createdAt       Epoch ms
 */

const RIDES_KEY = 'ridemitra_rides_v3';
const BOOKINGS_KEY = 'ridemitra_bookings_v3';
const USER_KEY = 'ridemitra_user_id';
const LEGACY_RIDES_KEY = 'ridemitra_v2_rides';
const LEGACY_BOOKINGS_KEY = 'ridemitra_v2_bookings';

const read = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function getUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) { id = uid('u'); localStorage.setItem(USER_KEY, id); }
  return id;
}

/** Migrate rides/bookings saved by the Phase 1 prototype so nothing is lost. */
function migrateLegacy() {
  const legacyRides = read(LEGACY_RIDES_KEY);
  const legacyBookings = read(LEGACY_BOOKINGS_KEY);
  if (!legacyRides.length && !legacyBookings.length) return;
  const me = getUserId();
  const rides = read(RIDES_KEY);
  const bookings = read(BOOKINGS_KEY);
  const idMap = {};
  for (const r of legacyRides) {
    const [date = '', time = ''] = String(r.date || '').split('T');
    const id = `r_legacy_${r.id}`;
    idMap[r.id] = id;
    if (rides.some((x) => x.id === id)) continue;
    rides.push({
      id, from: r.from || '', to: r.to || '', date, time: time.slice(0, 5) || '09:00',
      seatsTotal: Number(r.seats) || 1, seatsAvailable: Number(r.seats) || 1,
      pricePerSeat: Number(r.price) || 0, vehicle: r.vehicle || '', driverName: r.driver || '',
      driverPhone: '', ownerId: me, status: 'active', isDemo: false, createdAt: r.created || Date.now(),
    });
  }
  for (const b of legacyBookings) {
    const rideId = idMap[b.rideId];
    if (!rideId) continue;
    const id = `b_legacy_${b.id}`;
    if (bookings.some((x) => x.id === id)) continue;
    bookings.push({
      id, rideId, userId: me, passengerName: b.name || '', passengerPhone: String(b.phone || '').replace(/\D/g, '').slice(-10),
      seats: 1, status: 'booked', createdAt: b.created || Date.now(),
    });
    const ride = rides.find((x) => x.id === rideId);
    if (ride) ride.seatsAvailable = Math.max(0, ride.seatsAvailable - 1);
  }
  write(RIDES_KEY, rides);
  write(BOOKINGS_KEY, bookings);
  localStorage.removeItem(LEGACY_RIDES_KEY);
  localStorage.removeItem(LEGACY_BOOKINGS_KEY);
}
migrateLegacy();

/* ---------- City matching ---------- */
const CITY_ALIASES = {
  bangalore: 'bengaluru', bombay: 'mumbai', madras: 'chennai', calcutta: 'kolkata',
  gurgaon: 'gurugram', poona: 'pune', baroda: 'vadodara', mysore: 'mysuru',
  trivandrum: 'thiruvananthapuram', cochin: 'kochi', benares: 'varanasi', banaras: 'varanasi',
  allahabad: 'prayagraj', 'new delhi': 'delhi', vizag: 'visakhapatnam',
};
export function normaliseCity(s) {
  const c = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return CITY_ALIASES[c] || c;
}
const cityMatches = (rideCity, query) => {
  if (!query) return true;
  const a = normaliseCity(rideCity), q = normaliseCity(query);
  return a === q || a.includes(q) || q.includes(a);
};

/* ---------- Time helpers ---------- */
export function rideDeparture(ride) {
  const [y, m, d] = ride.date.split('-').map(Number);
  const [hh = 0, mm = 0] = (ride.time || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh, mm);
}
export const hasDeparted = (ride) => rideDeparture(ride).getTime() < Date.now();

/* ---------- Rides ---------- */
export async function listRides() { return read(RIDES_KEY); }

export async function getRide(id) { return read(RIDES_KEY).find((r) => r.id === id) || null; }

/**
 * Search bookable rides.
 * @param {{from?:string,to?:string,date?:string,passengers?:number}} q
 */
export async function searchRides(q = {}) {
  const passengers = Number(q.passengers) || 1;
  return read(RIDES_KEY)
    .filter((r) => r.status === 'active' && !hasDeparted(r))
    .filter((r) => cityMatches(r.from, q.from) && cityMatches(r.to, q.to))
    .filter((r) => !q.date || r.date === q.date)
    .filter((r) => r.seatsAvailable >= passengers)
    .sort((a, b) => (a.isDemo - b.isDemo) || (rideDeparture(a) - rideDeparture(b)));
}

/** @param {Omit<Ride,'id'|'ownerId'|'status'|'isDemo'|'createdAt'|'seatsAvailable'>} data */
export async function createRide(data) {
  const ride = {
    id: uid('r'), ...data, seatsAvailable: data.seatsTotal,
    ownerId: getUserId(), status: 'active', isDemo: false, createdAt: Date.now(),
  };
  const rides = read(RIDES_KEY);
  rides.unshift(ride);
  write(RIDES_KEY, rides);
  return ride;
}

export async function cancelRide(id) {
  const rides = read(RIDES_KEY);
  const ride = rides.find((r) => r.id === id);
  if (!ride) throw new Error('Ride not found.');
  if (ride.ownerId !== getUserId()) throw new Error('Only the driver who offered this ride can cancel it.');
  ride.status = 'cancelled';
  write(RIDES_KEY, rides);
  return ride;
}

export async function myOfferedRides() {
  const me = getUserId();
  return read(RIDES_KEY).filter((r) => r.ownerId === me && !r.isDemo)
    .sort((a, b) => rideDeparture(a) - rideDeparture(b));
}

/* ---------- Bookings ---------- */
export async function bookingsForRide(rideId) {
  return read(BOOKINGS_KEY).filter((b) => b.rideId === rideId);
}

export async function myBookingForRide(rideId) {
  const me = getUserId();
  return read(BOOKINGS_KEY).find((b) => b.rideId === rideId && b.userId === me && b.status === 'booked') || null;
}

export async function myBookings() {
  const me = getUserId();
  const rides = read(RIDES_KEY);
  return read(BOOKINGS_KEY).filter((b) => b.userId === me)
    .map((b) => ({ ...b, ride: rides.find((r) => r.id === b.rideId) || null }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** @param {{rideId:string,passengerName:string,passengerPhone:string,seats:number}} data */
export async function bookRide(data) {
  const rides = read(RIDES_KEY);
  const ride = rides.find((r) => r.id === data.rideId);
  if (!ride) throw new Error('This ride no longer exists.');
  if (ride.isDemo) throw new Error('This is a demo listing and cannot be booked.');
  if (ride.status !== 'active') throw new Error('This ride has been cancelled by the driver.');
  if (hasDeparted(ride)) throw new Error('This ride has already departed.');
  if (ride.ownerId === getUserId()) throw new Error('You cannot book a ride you offered.');
  if (await myBookingForRide(ride.id)) throw new Error('You have already booked this ride.');
  if (data.seats < 1 || data.seats > ride.seatsAvailable) throw new Error(`Only ${ride.seatsAvailable} seat(s) left on this ride.`);
  const booking = {
    id: uid('b'), rideId: ride.id, userId: getUserId(), passengerName: data.passengerName,
    passengerPhone: data.passengerPhone, seats: data.seats, status: 'booked', createdAt: Date.now(),
  };
  ride.seatsAvailable -= data.seats;
  const bookings = read(BOOKINGS_KEY);
  bookings.push(booking);
  write(RIDES_KEY, rides);
  write(BOOKINGS_KEY, bookings);
  return booking;
}

export async function cancelBooking(id) {
  const bookings = read(BOOKINGS_KEY);
  const booking = bookings.find((b) => b.id === id);
  if (!booking || booking.userId !== getUserId()) throw new Error('Booking not found.');
  if (booking.status === 'cancelled') return booking;
  booking.status = 'cancelled';
  const rides = read(RIDES_KEY);
  const ride = rides.find((r) => r.id === booking.rideId);
  if (ride) ride.seatsAvailable = Math.min(ride.seatsTotal, ride.seatsAvailable + booking.seats);
  write(BOOKINGS_KEY, bookings);
  write(RIDES_KEY, rides);
  return booking;
}

/* ---------- Demo data (always flagged isDemo, never bookable) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dayFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export async function hasDemoRides() { return read(RIDES_KEY).some((r) => r.isDemo); }

export async function loadDemoRides() {
  const samples = [
    ['Delhi', 'Jaipur', 1, '07:30', 3, 650, 'Sample hatchback'],
    ['Mumbai', 'Pune', 1, '18:00', 2, 450, 'Sample sedan'],
    ['Bengaluru', 'Mysuru', 2, '08:15', 4, 400, 'Sample SUV'],
    ['Lucknow', 'Kanpur', 3, '10:00', 2, 250, 'Sample hatchback'],
  ];
  const rides = read(RIDES_KEY).filter((r) => !r.isDemo);
  samples.forEach(([from, to, d, time, seats, price, vehicle], i) => rides.push({
    id: `r_demo_${i + 1}`, from, to, date: dayFromNow(d), time, seatsTotal: seats, seatsAvailable: seats,
    pricePerSeat: price, vehicle, driverName: `Demo Driver ${String.fromCharCode(65 + i)}`, driverPhone: '',
    ownerId: 'demo', status: 'active', isDemo: true, createdAt: Date.now(),
  }));
  write(RIDES_KEY, rides);
}

export async function clearDemoRides() {
  write(RIDES_KEY, read(RIDES_KEY).filter((r) => !r.isDemo));
}
