/* Busari Electric station finder.
 * Data: /assets/data/stations.json (generated from src/data/stations.json).
 * Map: Leaflet + OpenStreetMap tiles. Place search: OpenStreetMap Nominatim (US only).
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-locator]');
  if (!root || typeof L === 'undefined') {
    var s = document.querySelector('[data-status]');
    if (s) { s.textContent = 'The map could not load. Check your connection and refresh the page.'; s.dataset.tone = 'error'; }
    return;
  }

  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';
  var US_CENTER = [39.5, -98.35];
  var LIVE_REFRESH_MS = 60000;

  var ICON = {
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 2 4 14h7l-1.5 8L20 10h-7z"/></svg>',
    clock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    store: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/></svg>',
    nav: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
    pin: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>'
  };

  var els = {
    form: root.querySelector('[data-search-form]'),
    input: root.querySelector('#loc-q'),
    locate: root.querySelector('[data-locate]'),
    filters: root.querySelector('[data-filters]'),
    status: root.querySelector('[data-status]'),
    results: root.querySelector('[data-results]'),
    notice: root.querySelector('[data-sample-notice]')
  };

  var state = { stations: [], origin: null, originLabel: '', activeId: null, liveUrl: '' };
  var markers = {};
  var youMarker = null;
  var desktop = window.matchMedia('(min-width: 1024px)');

  /* ---------- map ---------- */
  var map = L.map('map', { zoomControl: true, scrollWheelZoom: true, tap: true }).setView(US_CENTER, desktop.matches ? 4 : 3);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);

  function pinIcon(st, active) {
    var open = availableCount(st) > 0;
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (open ? '' : ' is-busy') + (active ? ' is-active' : '') + '">' + ICON.bolt + '</div>',
      iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18]
    });
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function availableCount(st) { return st.connectors.reduce(function (n, c) { return n + (c.available || 0); }, 0); }
  function totalCount(st) { return st.connectors.reduce(function (n, c) { return n + c.count; }, 0); }
  function maxKw(st) { return Math.max.apply(null, st.connectors.map(function (c) { return c.kw; })); }
  function miles(a, b) {
    var R = 3958.8, toRad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toRad, dLng = (b[1] - a[1]) * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtMiles(m) { return m < 10 ? m.toFixed(1) + ' mi' : Math.round(m).toLocaleString('en-US') + ' mi'; }
  function directionsUrl(st) { return 'https://www.google.com/maps/dir/?api=1&destination=' + st.lat + ',' + st.lng; }
  function setStatus(msg, tone) { els.status.textContent = msg; if (tone) els.status.dataset.tone = tone; else delete els.status.dataset.tone; }
  function address(st) { return (st.sample ? '' : st.street + ', ') + st.city + ', ' + st.state + ' ' + st.zip; }

  function readFilters() {
    var f = { available: false, dc: false, plugs: [] };
    els.filters.querySelectorAll('input').forEach(function (i) {
      if (!i.checked) return;
      if (i.name === 'plug') f.plugs.push(i.value); else f[i.name] = true;
    });
    return f;
  }
  function matches(st, f) {
    var cons = st.connectors.filter(function (c) {
      if (f.dc && c.level !== 'dc') return false;
      if (f.plugs.length && f.plugs.indexOf(c.type) === -1) return false;
      return true;
    });
    if (!cons.length) return false;
    if (f.available && !cons.some(function (c) { return c.available > 0; })) return false;
    return true;
  }

  /* ---------- render ---------- */
  function render() {
    var f = readFilters();
    var list = state.stations.filter(function (st) { return matches(st, f); });
    list.forEach(function (st) { st._dist = state.origin ? miles(state.origin, [st.lat, st.lng]) : null; });
    if (state.origin) list.sort(function (a, b) { return a._dist - b._dist; });
    else list.sort(function (a, b) { return a.state.localeCompare(b.state) || a.city.localeCompare(b.city); });

    var nearestOpenId = null;
    if (state.origin) {
      var open = list.filter(function (st) { return availableCount(st) > 0; })[0];
      if (open) nearestOpenId = open.id;
    }

    // markers
    Object.keys(markers).forEach(function (id) {
      var st = state.stations.filter(function (s) { return s.id === id; })[0];
      var show = list.indexOf(st) !== -1;
      if (show && !map.hasLayer(markers[id])) markers[id].addTo(map);
      if (!show && map.hasLayer(markers[id])) map.removeLayer(markers[id]);
      markers[id].setIcon(pinIcon(st, id === state.activeId));
      markers[id].setPopupContent(popup(st));
    });

    if (!list.length) {
      els.results.innerHTML = '<li class="results-empty"><h2>No stations match these filters</h2><p>Turn off a filter to see more stations.</p></li>';
    } else {
      els.results.innerHTML = list.map(function (st) { return card(st, st.id === nearestOpenId); }).join('');
    }

    var shown = list.length + (list.length === 1 ? ' station' : ' stations');
    if (state.origin) setStatus(shown + ', nearest to ' + state.originLabel + ' first.');
    else setStatus(shown + '. Share your location or search to sort by distance.');
    return list;
  }

  function card(st, nearestOpen) {
    var avail = availableCount(st), total = totalCount(st);
    var plugs = st.connectors.map(function (c) {
      return '<li class="plug"><b>' + esc(c.type) + '</b><span>' + (c.level === 'dc' ? 'DC fast' : 'Level 2') + ', up to ' + c.kw + ' kW</span>' +
        '<em class="' + (c.available ? '' : 'none') + '">' + c.available + ' of ' + c.count + ' free</em></li>';
    }).join('');
    return '<li class="station' + (st.id === state.activeId ? ' is-active' : '') + '" id="st-' + esc(st.id) + '" data-id="' + esc(st.id) + '">' +
      '<div class="station-top"><h2><button type="button" data-focus="' + esc(st.id) + '">' + esc(st.name) + '</button></h2>' +
      (st._dist != null ? '<span class="station-dist">' + fmtMiles(st._dist) + '</span>' : '') + '</div>' +
      '<p class="station-addr">' + esc(address(st)) + '</p>' +
      '<div class="station-flags">' +
        (nearestOpen ? '<span class="badge nearest-flag">Nearest open charger</span>' : '') +
        (avail ? '<span class="badge badge-go">' + avail + ' of ' + total + ' plugs free</span>' : '<span class="badge badge-busy">All ' + total + ' plugs in use</span>') +
        (st.sample ? '<span class="badge badge-sample">Sample</span>' : '') +
      '</div>' +
      '<ul class="plugs">' + plugs + '</ul>' +
      '<div class="station-meta"><span>' + ICON.clock + esc(st.hours) + '</span>' +
        (st.amenities && st.amenities.length ? '<span>' + ICON.store + esc(st.amenities.join(', ')) + '</span>' : '') + '</div>' +
      '<div class="station-actions">' +
        '<a class="btn btn-primary" href="' + directionsUrl(st) + '" target="_blank" rel="noopener">' + ICON.nav + 'Directions</a>' +
        '<button class="btn btn-outline" type="button" data-focus="' + esc(st.id) + '">' + ICON.pin + 'Show on map</button>' +
      '</div></li>';
  }

  function popup(st) {
    var avail = availableCount(st);
    return '<h3>' + esc(st.name) + '</h3><p>' + esc(address(st)) + '</p>' +
      '<p><span class="badge ' + (avail ? 'badge-go' : 'badge-busy') + '">' + (avail ? avail + ' of ' + totalCount(st) + ' plugs free' : 'All plugs in use') + '</span></p>' +
      '<p>Up to ' + maxKw(st) + ' kW: ' + esc(st.connectors.map(function (c) { return c.type; }).join(', ')) + '</p>' +
      '<a class="btn btn-primary" href="' + directionsUrl(st) + '" target="_blank" rel="noopener">Directions</a>';
  }

  function focusStation(id, opts) {
    opts = opts || {};
    var st = state.stations.filter(function (s) { return s.id === id; })[0];
    if (!st) return;
    state.activeId = id;
    render();
    var m = markers[id];
    map.setView([st.lat, st.lng], Math.max(map.getZoom(), 13), { animate: !opts.instant });
    m.openPopup();
    var cardEl = document.getElementById('st-' + id);
    if (opts.scrollList && cardEl) cardEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!desktop.matches && opts.scrollMap) document.querySelector('.locator-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fitToNearest(list) {
    if (!state.origin || !list.length) return;
    // Frame the stations within 50 miles; if none are that close, frame just the nearest one.
    var near = list.filter(function (s) { return s._dist <= 50; }).slice(0, 5);
    if (!near.length) near = [list[0]];
    var pts = [state.origin].concat(near.map(function (s) { return [s.lat, s.lng]; }));
    map.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 13 });
  }

  function setOrigin(latlng, label) {
    state.origin = latlng;
    state.originLabel = label;
    if (youMarker) map.removeLayer(youMarker);
    youMarker = L.marker(latlng, { icon: L.divIcon({ className: '', html: '<div class="you-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, interactive: false, zIndexOffset: -1000 }).addTo(map);
    var list = render();
    fitToNearest(list);
  }

  /* ---------- locate + geocode ---------- */
  function locate() {
    if (!('geolocation' in navigator)) { setStatus('This browser cannot share your location. Enter a city or ZIP code instead.', 'error'); return; }
    setStatus('Finding your location…');
    els.locate.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      els.locate.disabled = false;
      setOrigin([pos.coords.latitude, pos.coords.longitude], 'your location');
      updateUrl({ near: 'me' });
    }, function (err) {
      els.locate.disabled = false;
      var msg = err.code === 1
        ? 'Location access is off for this site. Allow it in your browser settings, or enter a city or ZIP code.'
        : 'We could not get your location. Enter a city or ZIP code instead.';
      setStatus(msg, 'error');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function geocode(q) {
    q = q.trim();
    if (!q) { setStatus('Enter a city, ZIP code or address.', 'error'); els.input.focus(); return; }
    setStatus('Searching for ' + q + '…');
    var url = GEOCODE_URL + '?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(q);
    fetch(url, { headers: { 'Accept-Language': 'en-US' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (!data.length) { setStatus('We could not find "' + q + '". Try a 5-digit ZIP code or "City, State".', 'error'); return; }
        setOrigin([parseFloat(data[0].lat), parseFloat(data[0].lon)], q);
        updateUrl({ q: q });
      })
      .catch(function () { setStatus('Search is not responding right now. Use "Use my location" or try again in a moment.', 'error'); });
  }

  function updateUrl(params) {
    try {
      var u = new URL(window.location.href);
      ['q', 'near', 'station'].forEach(function (k) { u.searchParams.delete(k); });
      Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
      history.replaceState(null, '', u.pathname + (u.search ? u.search : ''));
    } catch (e) { /* older browsers: skip */ }
  }

  /* ---------- live status ---------- */
  function applyLive(data) {
    state.stations.forEach(function (st) {
      var s = data[st.id];
      if (!s) return;
      st.connectors.forEach(function (c) { if (typeof s[c.type] === 'number') c.available = Math.max(0, Math.min(c.count, s[c.type])); });
    });
    render();
  }
  function pollLive() {
    if (!state.liveUrl) return;
    fetch(state.liveUrl, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) applyLive(d); }).catch(function () {});
  }

  /* ---------- events ---------- */
  els.form.addEventListener('submit', function (e) { e.preventDefault(); geocode(els.input.value); });
  els.locate.addEventListener('click', locate);
  els.filters.addEventListener('change', function () { render(); });
  els.results.addEventListener('click', function (e) {
    var b = e.target.closest('[data-focus]');
    if (b) focusStation(b.getAttribute('data-focus'), { scrollMap: true });
  });
  desktop.addEventListener && desktop.addEventListener('change', function () { map.invalidateSize(); });

  /* ---------- boot ---------- */
  fetch((document.documentElement.dataset.base || '') + '/assets/data/stations.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.stations = data.stations;
      state.liveUrl = data.liveStatusUrl || '';
      if (state.stations.some(function (s) { return s.sample; })) els.notice.hidden = false;

      state.stations.forEach(function (st) {
        markers[st.id] = L.marker([st.lat, st.lng], { icon: pinIcon(st, false), title: st.name, alt: st.name, riseOnHover: true })
          .bindPopup(popup(st), { maxWidth: 260 })
          .on('click', function () { state.activeId = st.id; render(); var c = document.getElementById('st-' + st.id); if (c && desktop.matches) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); })
          .addTo(map);
      });
      var list = render();
      if (list.length && !state.origin) map.fitBounds(L.latLngBounds(list.map(function (s) { return [s.lat, s.lng]; })), { padding: [32, 32] });

      var params = new URLSearchParams(window.location.search);
      if (params.get('station')) focusStation(params.get('station'), { instant: true, scrollList: true });
      else if (params.get('near') === 'me') locate();
      else if (params.get('q')) { els.input.value = params.get('q'); geocode(params.get('q')); }

      if (state.liveUrl) { pollLive(); setInterval(pollLive, LIVE_REFRESH_MS); }
    })
    .catch(function () {
      setStatus('Station list could not load. Refresh the page to try again.', 'error');
    });
})();
