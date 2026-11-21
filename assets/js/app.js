import * as store from './store.js';
import { v, validateForm, setError, normalisePhone, todayISO, maxDateISO } from './validation.js';

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const titleCase = (s) => String(s).trim().replace(/\s+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function formatDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return 'Any date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', opts);
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
const formatPhone = (p) => (p && p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : '');
const maskPhone = (p) => (p && p.length === 10 ? `+91 ${p.slice(0, 2)}XXX XXX${p.slice(8)}` : 'Not provided');

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function rideState(ride) {
  if (ride.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' };
  if (store.hasDeparted(ride)) return { key: 'departed', label: 'Departed' };
  if (ride.seatsAvailable <= 0) return { key: 'full', label: 'Full' };
  return { key: 'upcoming', label: 'Upcoming' };
}

const demoTag = '<span class="demo-tag" title="Sample listing for preview only">DEMO · Not a real ride</span>';

/* ---------- Home: search & listing ---------- */
let filters = { from: '', to: '', date: '', passengers: 1 };

function rideCard(r) {
  const seatsLabel = `${r.seatsAvailable} seat${r.seatsAvailable === 1 ? '' : 's'} left`;
  return `<article class="ride-card${r.isDemo ? ' is-demo' : ''}">
    ${r.isDemo ? demoTag : ''}
    <div class="ride-top"><div class="route">${esc(r.from)} → ${esc(r.to)}</div><div class="price">${inr(r.pricePerSeat)}<small class="per">/seat</small></div></div>
    <div class="ride-details"><span>📅 ${esc(formatDate(r.date))}</span><span>🕒 ${esc(formatTime(r.time))}</span><span>💺 ${seatsLabel}</span></div>
    ${r.vehicle ? `<div class="ride-details">🚘 ${esc(r.vehicle)}</div>` : ''}
    <div class="driver"><div class="avatar">${esc((r.driverName || 'D').charAt(0).toUpperCase())}</div><div><strong>${esc(r.driverName)}</strong><small>${r.isDemo ? 'Sample driver' : 'RideMitra driver'}</small></div></div>
    <a class="btn primary book" href="#/ride/${encodeURIComponent(r.id)}">${r.isDemo ? 'View demo details' : 'View details & book'}</a>
  </article>`;
}

async function renderRides() {
  const rides = await store.searchRides(filters);
  const all = await store.listRides();
  const anyReal = all.some((r) => !r.isDemo && r.status === 'active' && !store.hasDeparted(r));
  const hasDemo = await store.hasDemoRides();
  const filtered = filters.from || filters.to || filters.date || filters.passengers > 1;

  const parts = [];
  if (filters.from) parts.push(`from <strong>${esc(titleCase(filters.from))}</strong>`);
  if (filters.to) parts.push(`to <strong>${esc(titleCase(filters.to))}</strong>`);
  parts.push(filters.date ? `on <strong>${esc(formatDate(filters.date))}</strong>` : 'on any date');
  parts.push(`for <strong>${filters.passengers} passenger${filters.passengers > 1 ? 's' : ''}</strong>`);
  $('#ridesSummary').innerHTML = filtered
    ? `${rides.length} ride${rides.length === 1 ? '' : 's'} ${parts.join(' ')}. <button type="button" class="linkbtn" data-action="clear-search">Show all rides</button>`
    : 'Showing all upcoming rides. Use the search to find rides on your route.';

  $('#demoBar').hidden = !hasDemo;

  const el = $('#rides');
  if (rides.length) { el.innerHTML = rides.map(rideCard).join(''); return; }
  if (filtered) {
    el.innerHTML = `<div class="empty">🔍<br><strong>No rides match your search.</strong><br>Try another date, fewer passengers, or check back later.<div class="empty-actions"><button type="button" class="btn outline" data-action="clear-search">Show all rides</button><button type="button" class="btn primary" data-action="open-post">Offer this ride</button></div></div>`;
  } else {
    el.innerHTML = `<div class="empty">🚗<br><strong>No rides have been offered yet.</strong><br>Be the first to offer a ride on your route.<div class="empty-actions"><button type="button" class="btn primary" data-action="open-post">+ Offer a ride</button>${!anyReal && !hasDemo ? '<button type="button" class="btn outline" data-action="load-demo">Preview with demo rides</button>' : ''}</div></div>`;
  }
}

function setMode(mode) {
  $('#searchForm').style.display = mode === 'search' ? 'grid' : 'none';
  $('#postForm').style.display = mode === 'post' ? 'grid' : 'none';
  $$('.hero-card .tab').forEach((t) => {
    const active = t.dataset.mode === mode;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
}

function goHome() { if (location.hash && location.hash !== '#' && location.hash !== '#/') location.hash = '#/'; }

function openPost() {
  goHome();
  setMode('post');
  requestAnimationFrame(() => { $('.hero-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#postFrom').focus({ preventScroll: true }); });
}

function scrollToResults() { $('#ridesSection').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

async function onHeroSearch(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const ok = validateForm(f, {
    searchFrom: () => v.city($('#searchFrom').value, 'Starting city'),
    searchTo: () => v.city($('#searchTo').value, 'Destination city') || v.differentCities($('#searchFrom').value, $('#searchTo').value),
    searchDate: () => v.date($('#searchDate').value, { required: false }),
    searchSeats: () => v.seats($('#searchSeats').value, { label: 'Passengers' }),
  });
  if (!ok) return;
  filters = { from: $('#searchFrom').value.trim(), to: $('#searchTo').value.trim(), date: $('#searchDate').value, passengers: Number($('#searchSeats').value) };
  $('#filterFrom').value = filters.from; $('#filterTo').value = filters.to; $('#filterDate').value = filters.date;
  await renderRides();
  scrollToResults();
}

async function onFilter(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const ok = validateForm(f, {
    filterFrom: () => ($('#filterFrom').value.trim() ? v.city($('#filterFrom').value, 'Starting city') : ''),
    filterTo: () => ($('#filterTo').value.trim() ? v.city($('#filterTo').value, 'Destination city') : ''),
    filterDate: () => v.date($('#filterDate').value, { required: false }),
  });
  if (!ok) return;
  filters = { ...filters, from: $('#filterFrom').value.trim(), to: $('#filterTo').value.trim(), date: $('#filterDate').value };
  $('#searchFrom').value = filters.from; $('#searchTo').value = filters.to; $('#searchDate').value = filters.date;
  await renderRides();
}

async function clearSearch() {
  filters = { from: '', to: '', date: '', passengers: 1 };
  ['searchForm', 'filterForm'].forEach((id) => { $(`#${id}`).reset(); $$(`#${id} input, #${id} select`).forEach((i) => setError(i, '')); });
  await renderRides();
}

async function onPostRide(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const val = (id) => $(`#${id}`).value;
  const ok = validateForm(f, {
    postFrom: () => v.city(val('postFrom'), 'Starting city'),
    postTo: () => v.city(val('postTo'), 'Destination') || v.differentCities(val('postFrom'), val('postTo')),
    postDate: () => v.date(val('postDate')),
    postTime: () => v.time(val('postTime'), val('postDate')),
    postSeats: () => v.seats(val('postSeats'), { label: 'Available seats' }),
    postPrice: () => v.price(val('postPrice')),
    postVehicle: () => v.vehicle(val('postVehicle')),
    postDriver: () => v.name(val('postDriver'), 'Driver name'),
    postPhone: () => v.phone(val('postPhone')),
  });
  if (!ok) { showToast('Please fix the highlighted fields.'); return; }
  const ride = await store.createRide({
    from: titleCase(val('postFrom')), to: titleCase(val('postTo')), date: val('postDate'), time: val('postTime'),
    seatsTotal: Number(val('postSeats')), pricePerSeat: Number(val('postPrice')), vehicle: val('postVehicle').trim(),
    driverName: titleCase(val('postDriver')), driverPhone: normalisePhone(val('postPhone')),
  });
  f.reset();
  setMode('search');
  showToast('Ride published successfully!');
  location.hash = `#/ride/${encodeURIComponent(ride.id)}`;
}

/* ---------- Ride details ---------- */
async function renderRideDetails(id) {
  const ride = await store.getRide(id);
  const view = $('#appViewInner');
  if (!ride) {
    view.innerHTML = `<a class="backlink" href="#/">← Back to rides</a><div class="empty">🚫<br><strong>Ride not found.</strong><br>It may have been removed, or it was offered on another device.</div>`;
    return;
  }
  const me = store.getUserId();
  const isOwner = ride.ownerId === me;
  const myBooking = await store.myBookingForRide(ride.id);
  const state = rideState(ride);
  const showContact = (isOwner || myBooking) && ride.driverPhone;

  const banner = ride.isDemo
    ? `<div class="notice demo">🧪 <div><strong>Demo listing — not a real ride.</strong> This sample shows how a ride looks on RideMitra. It cannot be booked and has no real driver.</div></div>`
    : state.key === 'cancelled' ? `<div class="notice warn">⚠️ <div><strong>This ride was cancelled by the driver.</strong></div></div>`
    : state.key === 'departed' ? `<div class="notice muted">🕒 <div>This ride has already departed.</div></div>` : '';

  const info = [
    ['Starting city', esc(ride.from)],
    ['Destination', esc(ride.to)],
    ['Travel date', esc(formatDate(ride.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))],
    ['Departure time', esc(formatTime(ride.time))],
    ['Seats available', `${ride.seatsAvailable} of ${ride.seatsTotal}`],
    ['Price per passenger', inr(ride.pricePerSeat)],
    ['Vehicle', esc(ride.vehicle || 'Not specified')],
    ['Driver', esc(ride.driverName)],
    ['Contact number', ride.isDemo ? 'Not available (demo)' : showContact
      ? `<a href="tel:+91${esc(ride.driverPhone)}">${esc(formatPhone(ride.driverPhone))}</a>`
      : `${esc(maskPhone(ride.driverPhone))}<small class="hint">Full number is shown after you book.</small>`],
  ].map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('');

  view.innerHTML = `<a class="backlink" href="#/">← Back to rides</a>
  <div class="details-grid">
    <article class="panel details-main">
      ${banner}
      <div class="details-head">
        <div><span class="status ${state.key}">${state.label}</span>${ride.isDemo ? demoTag : ''}<h1 class="details-route">${esc(ride.from)} <span>→</span> ${esc(ride.to)}</h1></div>
        <div class="price">${inr(ride.pricePerSeat)}<small class="per">/passenger</small></div>
      </div>
      <dl class="info-grid">${info}</dl>
      <p class="fineprint">Ride ID: ${esc(ride.id)} · Posted ${esc(new Date(ride.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</p>
    </article>
    <aside class="panel booking-panel" id="bookingPanel">${await bookingPanel(ride, { isOwner, myBooking, state })}</aside>
  </div>`;
}

async function bookingPanel(ride, { isOwner, myBooking, state }) {
  if (isOwner) {
    const bookings = (await store.bookingsForRide(ride.id)).filter((b) => b.status === 'booked');
    const list = bookings.length
      ? `<ul class="plain-list">${bookings.map((b) => `<li><strong>${esc(b.passengerName)}</strong> · ${b.seats} seat${b.seats > 1 ? 's' : ''}<br><a href="tel:+91${esc(b.passengerPhone)}">${esc(formatPhone(b.passengerPhone))}</a></li>`).join('')}</ul>`
      : '<p class="muted">No bookings yet.</p>';
    return `<h2>You offered this ride</h2>
      <p class="muted">${ride.seatsTotal - ride.seatsAvailable} of ${ride.seatsTotal} seats booked.</p>
      <h3>Passengers</h3>${list}
      ${state.key !== 'cancelled' && state.key !== 'departed' ? `<button type="button" class="btn outline danger full" data-action="cancel-ride" data-id="${esc(ride.id)}">Cancel this ride</button>` : ''}`;
  }
  if (myBooking) {
    return `<div class="notice ok">✅ <div><strong>Ride booked!</strong> ${myBooking.seats} seat${myBooking.seats > 1 ? 's' : ''} · Total ${inr(myBooking.seats * ride.pricePerSeat)}</div></div>
      <p>Call the driver to confirm pick-up details:</p>
      ${ride.driverPhone ? `<a class="btn primary full" href="tel:+91${esc(ride.driverPhone)}">📞 Call ${esc(ride.driverName)}</a>` : ''}
      <p class="fineprint">Booked as ${esc(myBooking.passengerName)} (${esc(formatPhone(myBooking.passengerPhone))}).</p>
      ${state.key === 'upcoming' || state.key === 'full' ? `<button type="button" class="btn outline danger full" data-action="cancel-booking" data-id="${esc(myBooking.id)}">Cancel booking</button>` : ''}`;
  }
  if (ride.isDemo) {
    return `<h2>Book this ride</h2><p class="muted">Demo listings are for preview only and cannot be booked.</p><button type="button" class="btn primary full" disabled>Book Ride (demo)</button>`;
  }
  if (state.key !== 'upcoming') {
    const msg = { cancelled: 'This ride was cancelled and can no longer be booked.', departed: 'This ride has already departed.', full: 'All seats on this ride are booked.' }[state.key];
    return `<h2>Book this ride</h2><p class="muted">${msg}</p><button type="button" class="btn primary full" disabled>Book Ride</button><a class="btn outline full" href="#/">Find another ride</a>`;
  }
  const preset = Math.min(filters.passengers || 1, ride.seatsAvailable);
  const opts = Array.from({ length: ride.seatsAvailable }, (_, i) => i + 1)
    .map((n) => `<option value="${n}"${n === preset ? ' selected' : ''}>${n} seat${n > 1 ? 's' : ''}</option>`).join('');
  return `<h2>Book this ride</h2>
    <form id="bookForm" class="stack" novalidate data-ride="${esc(ride.id)}" data-price="${ride.pricePerSeat}">
      <div class="field"><label for="bookName">YOUR NAME</label><input id="bookName" autocomplete="name" placeholder="Enter your full name" required></div>
      <div class="field"><label for="bookPhone">MOBILE NUMBER</label><input id="bookPhone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number" required></div>
      <div class="field"><label for="bookSeats">SEATS</label><select id="bookSeats">${opts}</select></div>
      <div class="total"><span>Total fare</span><strong id="bookTotal">${inr(preset * ride.pricePerSeat)}</strong></div>
      <button class="btn primary full" type="submit">Book Ride</button>
      <p class="fineprint">Bookings are currently saved on this device. Please call the driver after booking to confirm your seat.</p>
    </form>`;
}

async function onBook(e) {
  e.preventDefault();
  const f = e.target;
  const rideId = f.dataset.ride;
  const ride = await store.getRide(rideId);
  const ok = validateForm(f, {
    bookName: () => v.name($('#bookName').value, 'Your name'),
    bookPhone: () => v.phone($('#bookPhone').value) || (ride && normalisePhone($('#bookPhone').value) === ride.driverPhone ? 'This is the driver’s number. Enter your own mobile number.' : ''),
    bookSeats: () => v.seats($('#bookSeats').value, { max: ride ? ride.seatsAvailable : 6, label: 'Seats' }),
  });
  if (!ok) return;
  try {
    await store.bookRide({ rideId, passengerName: titleCase($('#bookName').value), passengerPhone: normalisePhone($('#bookPhone').value), seats: Number($('#bookSeats').value) });
    showToast('Ride booked! Call the driver to confirm.');
    await renderRideDetails(rideId);
  } catch (err) { showToast(err.message); await renderRideDetails(rideId); }
}

/* ---------- My Rides ---------- */
let myTab = 'offered';

function myRideRow(r, extra = '') {
  const state = rideState(r);
  return `<article class="my-row">
    <div class="my-row-main">
      <div class="route">${esc(r.from)} → ${esc(r.to)}</div>
      <div class="ride-details"><span>📅 ${esc(formatDate(r.date))}</span><span>🕒 ${esc(formatTime(r.time))}</span><span>${inr(r.pricePerSeat)}/seat</span></div>
      ${extra}
    </div>
    <div class="my-row-side"><span class="status ${state.key}">${state.label}</span><a class="btn outline" href="#/ride/${encodeURIComponent(r.id)}">Details</a></div>
  </article>`;
}

async function renderMyRides() {
  const offered = await store.myOfferedRides();
  const booked = await store.myBookings();
  const view = $('#appViewInner');
  const offeredHtml = offered.length
    ? offered.map((r) => myRideRow(r, `<div class="ride-details"><span>💺 ${r.seatsTotal - r.seatsAvailable}/${r.seatsTotal} seats booked</span><span>🚘 ${esc(r.vehicle)}</span></div>`)).join('')
    : `<div class="empty">🚗<br><strong>You haven’t offered any rides yet.</strong><div class="empty-actions"><button type="button" class="btn primary" data-action="open-post">+ Offer a ride</button></div></div>`;
  const bookedHtml = booked.length
    ? booked.map((b) => (b.ride
      ? myRideRow(b.ride, `<div class="ride-details"><span>💺 ${b.seats} seat${b.seats > 1 ? 's' : ''} · ${inr(b.seats * b.ride.pricePerSeat)}</span><span>👤 ${esc(b.ride.driverName)}</span>${b.status === 'cancelled' ? '<span class="status cancelled">Booking cancelled</span>' : ''}</div>`)
      : `<article class="my-row"><div class="my-row-main"><div class="route">Ride no longer available</div></div></article>`)).join('')
    : `<div class="empty">🎒<br><strong>You haven’t booked any rides yet.</strong><div class="empty-actions"><a class="btn primary" href="#/">Find a ride</a></div></div>`;

  view.innerHTML = `<a class="backlink" href="#/">← Back to rides</a>
  <div class="panel">
    <div class="panel-title"><h2>My Rides</h2><button type="button" class="btn primary" data-action="open-post">+ Offer a ride</button></div>
    <p class="muted my-note">Rides you offer and book are saved on this device and browser.</p>
    <div class="tabs" role="tablist">
      <button type="button" class="tab${myTab === 'offered' ? ' active' : ''}" role="tab" aria-selected="${myTab === 'offered'}" data-mytab="offered">🚗 Offered by me (${offered.length})</button>
      <button type="button" class="tab${myTab === 'booked' ? ' active' : ''}" role="tab" aria-selected="${myTab === 'booked'}" data-mytab="booked">🎒 Booked by me (${booked.filter((b) => b.status === 'booked').length})</button>
    </div>
    <div class="my-list" ${myTab === 'offered' ? '' : 'hidden'} data-mylist="offered">${offeredHtml}</div>
    <div class="my-list" ${myTab === 'booked' ? '' : 'hidden'} data-mylist="booked">${bookedHtml}</div>
  </div>`;
}

/* ---------- Router ---------- */
async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, param] = hash.split('/');
  const isApp = page === 'ride' || page === 'my-rides';
  $$('.home-only').forEach((el) => { el.hidden = isApp; });
  $('#appView').hidden = !isApp;
  if (page === 'ride' && param) { await renderRideDetails(decodeURIComponent(param)); document.title = 'Ride details — RideMitra'; window.scrollTo(0, 0); }
  else if (page === 'my-rides') { await renderMyRides(); document.title = 'My Rides — RideMitra'; window.scrollTo(0, 0); }
  else { document.title = 'RideMitra V2 — Ride Sharing'; await renderRides(); }
}

/* ---------- Wiring ---------- */
function init() {
  const today = todayISO(), max = maxDateISO();
  ['searchDate', 'filterDate', 'postDate'].forEach((id) => { $(`#${id}`).min = today; $(`#${id}`).max = max; });

  $$('.hero-card .tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  $('#searchForm').addEventListener('submit', onHeroSearch);
  $('#filterForm').addEventListener('submit', onFilter);
  $('#postForm').addEventListener('submit', onPostRide);

  // Clear a field's error as soon as the user edits it.
  document.addEventListener('input', (e) => { if (e.target.matches('.field input, .field select')) setError(e.target, ''); });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'bookSeats') {
      const f = $('#bookForm');
      $('#bookTotal').textContent = inr(Number(e.target.value) * Number(f.dataset.price));
    }
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'bookForm') onBook(e); });

  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-mytab]');
    if (tab) {
      myTab = tab.dataset.mytab;
      $$('[data-mytab]').forEach((t) => { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
      $$('[data-mylist]').forEach((l) => { l.hidden = l.dataset.mylist !== myTab; });
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    try {
      if (action === 'open-post') openPost();
      else if (action === 'my-rides') location.hash = '#/my-rides';
      else if (action === 'refresh') { await renderRides(); showToast('Rides refreshed.'); }
      else if (action === 'clear-search') await clearSearch();
      else if (action === 'load-demo') { await store.loadDemoRides(); await renderRides(); showToast('Demo rides added — clearly labelled and not bookable.'); }
      else if (action === 'clear-demo') { await store.clearDemoRides(); await renderRides(); showToast('Demo rides removed.'); }
      else if (action === 'cancel-ride') {
        if (!confirm('Cancel this ride? Passengers will see it as cancelled.')) return;
        await store.cancelRide(id); showToast('Ride cancelled.'); await route();
      } else if (action === 'cancel-booking') {
        if (!confirm('Cancel your booking for this ride?')) return;
        await store.cancelBooking(id); showToast('Booking cancelled.'); await route();
      }
    } catch (err) { showToast(err.message); }
  });

  // Keep views in sync if another tab changes the data.
  window.addEventListener('storage', () => route());
  window.addEventListener('hashchange', route);
  route();
}

init();
