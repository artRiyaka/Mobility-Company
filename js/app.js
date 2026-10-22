(function () {
  const DB = window.NORTHLINE;
  const SESSION = "northline.session";
  const BOOKINGS = "northline.bookings";
  const DRAFT = "northline.draft";
  const PENDING = "northline.pendingConfirm";
  const NOTES = "northline.notes";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function isoDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function combine(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  function money(amount) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(Math.round(amount));
  }

  function formatWhen(value) {
    const date = new Date(value);
    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(date);
    const time = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
    const start = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const diff = Math.round((start(date) - start(new Date())) / 86400000);
    const prefix = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : day;
    return diff === 0 || diff === 1 ? `${prefix} · ${time}` : `${day} · ${time}`;
  }

  function serviceById(id) { return DB.services.find((item) => item.id === id); }
  function cabinById(id) { return DB.cabins.find((item) => item.id === id); }

  function placeById(id) {
    if (id === "as-directed") {
      return { id: "as-directed", name: "As directed", region: "Chauffeur", kind: "flexible", lat: null, lng: null };
    }
    return DB.places.find((item) => item.id === id) || null;
  }

  function milesBetween(a, b) {
    if (!a || !b || a.id === b.id || a.lat == null || b.lat == null) return 0;
    const rad = (n) => (n * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const distance = 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
    return Math.max(1, Math.round(distance * 1.28));
  }

  function quietHours(timeStr) {
    if (!timeStr) return false;
    const [hh, mm] = timeStr.split(":").map(Number);
    const mins = hh * 60 + mm;
    return mins < 6 * 60 + 30 || mins >= 22 * 60;
  }

  function currentMember() {
    try {
      const raw = sessionStorage.getItem(SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function login(id, passcode) {
    if (id !== DB.member.id || passcode !== DB.member.passcode) return false;
    const member = DB.member;
    sessionStorage.setItem(SESSION, JSON.stringify({
      name: member.name,
      since: member.since,
      plan: member.plan,
      desk: member.desk
    }));
    return true;
  }

  function logout() {
    sessionStorage.removeItem(SESSION);
    location.href = "index.html";
  }

  function safeNext(value) {
    if (!value) return "account.html";
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch (err) { return "account.html"; }
    if (decoded.startsWith("/") || decoded.startsWith("\\") || /^[a-z]+:/i.test(decoded) || decoded.includes("..")) {
      return "account.html";
    }
    const path = decoded.split("?")[0].split("#")[0];
    const allowed = [
      "index.html", "services.html", "service-city.html", "service-airside.html",
      "service-company.html", "service-chauffeur.html", "service-intercity.html",
      "booking.html", "account.html", "about.html", "contact.html"
    ];
    return allowed.includes(path) ? decoded : "account.html";
  }

  let memoryBookings = null;

  function writeBookings(list) {
    memoryBookings = list;
    try { localStorage.setItem(BOOKINGS, JSON.stringify(list)); } catch (err) { /* demo keeps memory */ }
  }

  function atOffset(offset, hours, minutes) {
    const date = addDays(new Date(), offset);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  function buildSeed() {
    return DB.seed.map((item) => {
      const when = atOffset(item.dayOffset, item.hours, item.minutes);
      const draft = {
        service: item.service,
        cabin: item.cabin,
        from: item.from,
        to: item.to,
        date: isoDate(when),
        time: `${pad(item.hours)}:${pad(item.minutes)}`,
        passengers: item.passengers,
        blockHours: item.blockHours,
        flight: item.flight,
        notes: item.notes
      };
      const quote = priceTrip(draft, { schedule: false });
      return {
        id: item.id,
        status: item.status,
        at: when.toISOString(),
        driver: item.driver,
        rider: DB.member.name,
        service: item.service,
        cabin: item.cabin,
        from: item.from,
        to: item.to,
        passengers: item.passengers,
        blockHours: item.blockHours,
        flight: item.flight,
        notes: item.notes,
        miles: quote.miles,
        price: quote.total
      };
    });
  }

  function readBookings() {
    if (memoryBookings) return normalize(memoryBookings);
    try {
      const raw = localStorage.getItem(BOOKINGS);
      if (!raw) {
        const seeded = buildSeed();
        writeBookings(seeded);
        return seeded;
      }
      const parsed = JSON.parse(raw);
      return normalize(Array.isArray(parsed) ? parsed : buildSeed());
    } catch (err) {
      memoryBookings = buildSeed();
      return memoryBookings;
    }
  }

  function normalize(list) {
    const now = Date.now();
    let changed = false;
    list.forEach((trip) => {
      if (trip.status === "Confirmed" && new Date(trip.at).getTime() < now - 2 * 60 * 60 * 1000) {
        trip.status = "Completed";
        changed = true;
      }
    });
    if (changed) writeBookings(list);
    else memoryBookings = list;
    return list;
  }

  function resetBookings() {
    try { localStorage.removeItem(BOOKINGS); } catch (err) { /* ignore */ }
    memoryBookings = null;
    return readBookings();
  }

  function nextId(existing) {
    let id = "";
    do {
      id = `NL-${10000 + Math.floor(Math.random() * 90000)}`;
    } while (existing.some((item) => item.id === id));
    return id;
  }

  function pickDriver(id) {
    const total = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return DB.drivers[total % DB.drivers.length];
  }

  function priceTrip(draft, options = {}) {
    const service = serviceById(draft.service);
    const cabin = cabinById(draft.cabin || "city");
    const from = placeById(draft.from);
    const to = placeById(draft.to);
    const errors = [];
    if (!service) errors.push("Choose a service.");
    if (!from) errors.push("Choose a pickup.");
    if (!to) errors.push("Choose a drop-off.");
    if (from && to && from.id === to.id) errors.push("Pickup and drop-off need to be different places.");
    if (!draft.date) errors.push("Choose a date.");
    if (!draft.time) errors.push("Choose a time.");

    let when = null;
    if (draft.date && draft.time) {
      when = combine(draft.date, draft.time);
      if (Number.isNaN(when.getTime())) errors.push("That date does not read clearly.");
      else if (options.schedule !== false) {
        const minLead = Date.now() + 45 * 60 * 1000;
        const maxLead = addDays(new Date(), 90).getTime();
        if (when.getTime() < minLead) errors.push("Book at least 45 minutes ahead.");
        else if (when.getTime() > maxLead) errors.push("Trips can be planned up to 90 days ahead.");
      }
    }

    const passengers = Number(draft.passengers) || 1;
    if (cabin && passengers > cabin.guests) {
      errors.push(`${cabin.name} carries ${cabin.guests} guests. Choose Group, or lower the count.`);
    }

    const miles = service && service.model === "hourly" ? 0 : milesBetween(from, to);
    const hours = Math.max(service && service.minHours ? service.minHours : 3, Number(draft.blockHours) || 3);
    let lines = [];
    let total = 0;

    if (service && cabin && errors.length === 0) {
      const scale = cabin.multiplier;
      if (service.model === "hourly") {
        const rate = Math.round(service.hourly * scale);
        total = rate * hours;
        lines = [
          { label: `${cabin.name} cabin · ${money(rate)} / hour`, value: money(rate * hours) }
        ];
      } else {
        const base = Math.round(service.base * scale);
        const distance = Math.round(service.perMile * miles * scale);
        const quiet = service.earlySurcharge && quietHours(draft.time) ? Math.round(service.earlySurcharge * scale) : 0;
        total = base + distance + quiet;
        const floor = Math.round((service.minFare || 0) * scale);
        let minimum = 0;
        if (total < floor) {
          minimum = floor - total;
          total = floor;
        }
        lines = [
          { label: "Base fare", value: money(base) },
          { label: `Distance · ${miles} mi`, value: money(distance) }
        ];
        if (quiet) lines.push({ label: "Early or late airport", value: money(quiet) });
        if (minimum) lines.push({ label: "Minimum fare", value: money(minimum) });
      }
    }

    const advisories = [];
    if (service && from && to && errors.length === 0) {
      const airportTrip = from.kind === "airport" || to.kind === "airport";
      if (miles > 80 && service.id !== "intercity" && service.id !== "chauffeur") {
        advisories.push("This distance suits Intercity. You can switch the service, or keep this one.");
      }
      if (service.id === "airside" && !airportTrip) {
        advisories.push("Airside includes airport wait. For two street addresses, City motion is the usual choice.");
      }
      if (service.id === "intercity" && miles > 0 && miles < 20) {
        advisories.push("A short hop is usually City motion.");
      }
      if (service.id === "chauffeur") {
        advisories.push("The clock starts at pickup. Extra hours can be added with dispatch by phone.");
      }
    }

    return { ok: errors.length === 0, errors, miles, total, lines, advisories, when, hours };
  }

  function createBooking(draft) {
    const quote = priceTrip(draft);
    if (!quote.ok) return { ok: false, errors: quote.errors };
    if (!currentMember()) return { ok: false, errors: ["Sign in to place this trip on your desk."] };
    const existing = readBookings();
    const id = nextId(existing);
    const trip = {
      id,
      status: "Confirmed",
      at: quote.when.toISOString(),
      driver: pickDriver(id),
      rider: currentMember().name,
      service: draft.service,
      cabin: draft.cabin,
      from: draft.from,
      to: draft.to,
      passengers: Number(draft.passengers) || 1,
      blockHours: serviceById(draft.service).model === "hourly" ? quote.hours : null,
      flight: (draft.flight || "").trim(),
      notes: (draft.notes || "").trim(),
      miles: quote.miles,
      price: quote.total
    };
    existing.push(trip);
    writeBookings(existing);
    return { ok: true, trip };
  }

  function cancelBooking(id) {
    const list = readBookings();
    const trip = list.find((item) => item.id === id);
    if (!trip || trip.status !== "Confirmed") return { ok: false, reason: "This trip can no longer be cancelled." };
    if (new Date(trip.at).getTime() - Date.now() < 60 * 60 * 1000) {
      return { ok: false, reason: "Cancellation closes one hour before departure." };
    }
    trip.status = "Cancelled";
    writeBookings(list);
    return { ok: true };
  }

  function readDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeDraft(draft) {
    sessionStorage.setItem(DRAFT, JSON.stringify(draft));
  }

  function fillPlaces(select, { flexible = false, selected = "" } = {}) {
    if (!select) return;
    const current = selected || select.value;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = select.dataset.placeholder || "Choose a place";
    select.append(placeholder);
    const regions = [];
    DB.places.forEach((place) => {
      if (!regions.includes(place.region)) regions.push(place.region);
    });
    regions.forEach((region) => {
      const group = document.createElement("optgroup");
      group.label = region;
      DB.places.filter((place) => place.region === region).forEach((place) => {
        const option = document.createElement("option");
        option.value = place.id;
        option.textContent = place.name;
        group.append(option);
      });
      select.append(group);
    });
    if (flexible) {
      const option = document.createElement("option");
      option.value = "as-directed";
      option.textContent = "As directed";
      select.append(option);
    }
    const allowed = [...select.options].some((option) => option.value === current);
    select.value = allowed ? current : "";
  }

  function bindDateLimits(input) {
    if (!input) return;
    const today = new Date();
    input.min = isoDate(today);
    input.max = isoDate(addDays(today, 90));
  }

  function initChrome() {
    const clock = $("#desk-clock");
    const paintClock = () => {
      if (!clock) return;
      clock.textContent = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date());
    };
    paintClock();
    window.setInterval(paintClock, 30000);

    const member = currentMember();
    $$("[data-auth]").forEach((link) => {
      if (!member) return;
      link.textContent = member.name.split(" ")[0];
      link.href = "account.html";
      link.setAttribute("aria-label", "Your trips");
    });

    const toggle = $(".nav-toggle");
    const nav = $("#site-nav");
    if (toggle && nav) {
      const main = document.querySelector("main");
      const footer = document.querySelector("footer");
      const utility = document.querySelector(".utility");
      const setOpen = (open) => {
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        nav.classList.toggle("is-open", open);
        document.body.classList.toggle("menu-open", open);
        if (main) main.inert = open;
        if (footer) footer.inert = open;
        if (utility) utility.inert = open;
      };
      const close = () => setOpen(false);
      toggle.addEventListener("click", () => {
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
      });
      nav.addEventListener("click", (event) => {
        if (event.target.closest("a")) close();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
      });
    }

    const top = $(".top");
    if (top) {
      const onScroll = () => top.classList.toggle("is-stuck", window.scrollY > 4);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  function initReveal() {
    const nodes = $$(".reveal");
    if (!nodes.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16 });
    nodes.forEach((node) => observer.observe(node));
  }

  function initHome() {
    const board = $("#board-body");
    if (board) {
      DB.board.forEach((row) => {
        const item = document.createElement("div");
        item.className = "board-row";
        item.innerHTML = `
          <div class="board-route"><b>${escapeHtml(row.from)}</b><span>to ${escapeHtml(row.to)}</span></div>
          <div class="board-cabin">${escapeHtml(row.cabin)}</div>
          <div class="board-status"><span class="dot${row.live ? " live" : ""}"></span>${escapeHtml(row.state)}</div>
          <div class="num">${escapeHtml(row.eta)}</div>`;
        board.append(item);
      });
    }

    const service = $("#home-service");
    const from = $("#home-from");
    const to = $("#home-to");
    const date = $("#home-date");
    const time = $("#home-time");
    if (!service || !from || !to) return;

    DB.services.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      service.append(option);
    });
    service.value = "airside";
    fillPlaces(from, { selected: "sfo" });
    fillPlaces(to, { selected: "fidi" });
    bindDateLimits(date);
    if (date && !date.value) date.value = isoDate(addDays(new Date(), 1));
    if (time && !time.value) time.value = "16:40";
  }

  function initLogin() {
    const form = $("#login-form");
    if (!form) return;
    const params = new URLSearchParams(location.search);
    const next = safeNext(params.get("next"));
    if (currentMember()) {
      location.replace(next);
      return;
    }
    const memberInput = $("#member-id");
    const passInput = $("#passcode");
    memberInput.value = DB.member.id;
    passInput.value = DB.member.passcode;
    const error = $("#login-error");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      button.textContent = "Opening your desk";
      window.setTimeout(() => {
        if (login(memberInput.value, passInput.value)) {
          location.href = next;
          return;
        }
        button.disabled = false;
        button.textContent = "Login";
        error.hidden = false;
      }, 350);
    });
  }

  function initContact() {
    const form = $("#contact-form");
    if (!form) return;
    const success = $("#contact-success");
    const list = $("#note-list");

    function readNotes() {
      try { return JSON.parse(localStorage.getItem(NOTES) || "[]"); }
      catch (err) { return []; }
    }

    function paintNotes() {
      const notes = readNotes();
      const saved = $("#saved-notes");
      list.replaceChildren();
      if (!notes.length) {
        if (saved) saved.hidden = true;
        return;
      }
      if (saved) saved.hidden = false;
      notes.slice().reverse().forEach((note) => {
        const item = document.createElement("article");
        item.className = "message";
        item.innerHTML = `<b>${escapeHtml(note.topic)}</b> · ${escapeHtml(note.name)}
          <p>${escapeHtml(note.message)}</p>
          <p class="fine">${escapeHtml(formatWhen(note.at))}</p>`;
        list.append(item);
      });
    }

    paintNotes();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const message = String(data.get("message") || "").trim();
      const topic = String(data.get("topic") || "New trip");
      const phone = String(data.get("phone") || "").trim();
      if (!name || !message) return;
      const notes = readNotes();
      notes.push({ name, message, topic, phone, at: new Date().toISOString() });
      try { localStorage.setItem(NOTES, JSON.stringify(notes)); } catch (err) { /* ignore */ }
      form.hidden = true;
      success.hidden = false;
      paintNotes();
    });
  }

  function initAccount() {
    const root = $("#account-root");
    if (!root) return;
    if (!currentMember()) {
      location.replace("login.html?next=account.html");
      return;
    }

    const member = currentMember();

    function render() {
      const trips = readBookings().slice().sort((a, b) => new Date(a.at) - new Date(b.at));
      const upcoming = trips.filter((trip) => trip.status === "Confirmed" && new Date(trip.at).getTime() >= Date.now() - 60 * 60 * 1000);
      const history = trips.filter((trip) => !upcoming.includes(trip)).sort((a, b) => new Date(b.at) - new Date(a.at));
      root.replaceChildren();

      const head = document.createElement("header");
      head.className = "account-head";
      head.innerHTML = `
        <p class="eyebrow">Member desk</p>
        <h1>Your trips.</h1>
        <p class="account-meta">${escapeHtml(member.name)} · ${escapeHtml(member.desk)} desk · Member since ${escapeHtml(member.since)} · ${escapeHtml(member.plan)}</p>`;
      root.append(head);

      const metrics = document.createElement("div");
      metrics.className = "metrics";
      [
        [String(upcoming.length), "Open trips"],
        [String(trips.filter((trip) => trip.status === "Completed").length), "Completed"],
        [member.plan, "Account plan"]
      ].forEach(([value, label]) => {
        const stat = document.createElement("div");
        stat.className = "stat";
        stat.innerHTML = `<b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span>`;
        metrics.append(stat);
      });
      root.append(metrics);

      const actions = document.createElement("div");
      actions.className = "account-actions";
      actions.innerHTML = `<a class="btn btn-primary" href="booking.html">Plan a trip</a>
        <button class="btn btn-ghost" type="button" id="logout">Log out</button>`;
      root.append(actions);

      root.append(sectionLabel("Upcoming"));
      root.append(renderTrips(upcoming, true));
      root.append(sectionLabel("History"));
      root.append(renderTrips(history, false));

      const restore = document.createElement("div");
      restore.className = "confirm-inline";
      restore.style.marginTop = "28px";
      restore.innerHTML = `<button class="text-link" type="button" id="restore">Restore sample trips</button>
        <span class="fine">Trips in this demo stay in this browser.</span>`;
      root.append(restore);

      $("#logout").addEventListener("click", logout);
      $("#restore").addEventListener("click", () => {
        const row = $("#restore").parentElement;
        row.innerHTML = `<span>Replace the desk with the original sample trips?</span>
          <button class="btn btn-small btn-ink" type="button" id="restore-yes">Restore</button>
          <button class="btn btn-small btn-ghost" type="button" id="restore-no">Keep mine</button>`;
        $("#restore-yes").addEventListener("click", () => {
          resetBookings();
          render();
        });
        $("#restore-no").addEventListener("click", render);
      });
    }

    function sectionLabel(text) {
      const label = document.createElement("h2");
      label.className = "group-label";
      label.textContent = text;
      return label;
    }

    function renderTrips(list, upcoming) {
      const wrap = document.createElement("div");
      wrap.className = "trip-list";
      if (!list.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = upcoming ? "No open trips. The next one can start from a route you already know." : "Completed and cancelled trips will collect here.";
        wrap.append(empty);
        return wrap;
      }
      list.forEach((trip) => wrap.append(tripCard(trip)));
      return wrap;
    }

    function tripCard(trip) {
      const service = serviceById(trip.service);
      const cabin = cabinById(trip.cabin);
      const from = placeById(trip.from);
      const to = placeById(trip.to);
      const card = document.createElement("article");
      card.className = `trip${trip.status === "Cancelled" ? " is-cancelled" : ""}`;
      const guests = `${trip.passengers} guest${trip.passengers > 1 ? "s" : ""}`;
      const span = trip.blockHours ? `${trip.blockHours} hours` : `${trip.miles || 0} mi`;
      card.innerHTML = `
        <div class="trip-top">
          <h3>${escapeHtml(service ? service.name : "Trip")}</h3>
          <span class="pill pill-${escapeHtml(trip.status.toLowerCase())}">${escapeHtml(trip.status)}</span>
        </div>
        <p>${escapeHtml(formatWhen(trip.at))}</p>
        <p class="route-line-text">${escapeHtml(from ? from.name : "Pickup")} → ${escapeHtml(to ? to.name : "Drop-off")}</p>
        <p class="fine">${escapeHtml(cabin ? cabin.name : "Cabin")} · ${escapeHtml(guests)} · ${escapeHtml(span)}${trip.flight ? ` · Flight ${escapeHtml(trip.flight)}` : ""}</p>
        <div class="trip-foot">
          <div>
            <strong class="num">${money(trip.price || 0)}</strong>
            <p class="fine">Driver · ${escapeHtml(trip.driver || "Assigning")}</p>
          </div>
          <div class="trip-actions"></div>
        </div>`;
      const actions = $(".trip-actions", card);
      if (trip.status === "Confirmed") {
        const rebook = document.createElement("a");
        rebook.className = "btn btn-small btn-ghost";
        rebook.textContent = "Book again";
        rebook.href = `booking.html?service=${encodeURIComponent(trip.service)}&from=${encodeURIComponent(trip.from)}&to=${encodeURIComponent(trip.to)}&cabin=${encodeURIComponent(trip.cabin)}`;
        actions.append(rebook);
        const cancel = document.createElement("button");
        cancel.className = "btn btn-small btn-ghost";
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => askCancel(actions, trip.id));
        actions.append(cancel);
      }
      if (trip.notes) {
        const note = document.createElement("p");
        note.className = "fine";
        note.textContent = trip.notes;
        card.append(note);
      }
      return card;
    }

    function askCancel(actions, id) {
      actions.replaceChildren();
      const note = document.createElement("div");
      note.className = "confirm-inline";
      note.innerHTML = `<span>Cancel this trip?</span>`;
      const yes = document.createElement("button");
      yes.className = "btn btn-small btn-ink";
      yes.type = "button";
      yes.textContent = "Confirm cancel";
      const no = document.createElement("button");
      no.className = "btn btn-small btn-ghost";
      no.type = "button";
      no.textContent = "Keep it";
      yes.addEventListener("click", () => {
        const result = cancelBooking(id);
        if (!result.ok) {
          note.replaceChildren();
          const reason = document.createElement("span");
          reason.textContent = result.reason;
          note.append(reason);
          return;
        }
        render();
      });
      no.addEventListener("click", render);
      note.append(yes, no);
      actions.append(note);
    }

    render();
  }

  function initBooking() {
    const form = $("#booking-form");
    if (!form) return;

    const state = {
      step: 1,
      service: "city",
      from: "",
      to: "",
      date: isoDate(addDays(new Date(), 1)),
      time: "09:30",
      passengers: 1,
      blockHours: 3,
      flight: "",
      notes: "",
      cabin: "city"
    };

    const params = new URLSearchParams(location.search);
    const doneId = params.get("done");
    if (doneId) {
      const existing = readBookings().find((trip) => trip.id === doneId);
      if (existing) {
        showDone(existing);
        return;
      }
    }

    const queryKeys = ["service", "from", "to", "date", "time", "cabin"];
    const hasQuery = queryKeys.some((key) => params.get(key));
    if (params.get("resume") === "1") Object.assign(state, readDraft() || {});
    else if (hasQuery) {
      queryKeys.forEach((key) => {
        if (params.get(key)) state[key] = params.get(key);
      });
    } else {
      const draft = readDraft();
      if (draft) Object.assign(state, draft);
    }

    const fields = {
      service: $("#trip-service"),
      from: $("#trip-from"),
      to: $("#trip-to"),
      date: $("#trip-date"),
      time: $("#trip-time"),
      flight: $("#trip-flight"),
      notes: $("#trip-notes")
    };

    DB.services.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      fields.service.append(option);
    });
    bindDateLimits(fields.date);

    function syncServiceFields() {
      const service = serviceById(state.service);
      const hourly = service && service.model === "hourly";
      $("#hours-field").hidden = !hourly;
      $("#flight-field").hidden = state.service !== "airside";
      fillPlaces(fields.to, { flexible: hourly, selected: state.to });
      if (hourly && !state.to) state.to = "as-directed";
      if (!hourly && state.to === "as-directed") state.to = "";
      fields.to.value = state.to;
    }

    function readForm() {
      state.service = fields.service.value;
      state.from = fields.from.value;
      state.to = fields.to.value;
      state.date = fields.date.value;
      state.time = fields.time.value;
      state.flight = fields.flight.value;
      state.notes = fields.notes.value;
      writeDraft(state);
    }

    function writeForm() {
      fields.service.value = state.service;
      syncServiceFields();
      fillPlaces(fields.from, { selected: state.from });
      fillPlaces(fields.to, { flexible: serviceById(state.service)?.model === "hourly", selected: state.to });
      fields.date.value = state.date;
      fields.time.value = state.time;
      fields.flight.value = state.flight || "";
      fields.notes.value = state.notes || "";
      $("#guest-count").textContent = String(state.passengers);
      $("#hour-count").textContent = String(state.blockHours);
    }

    function setStep(step, scroll) {
      state.step = step;
      $$("[data-step]").forEach((panel) => {
        panel.hidden = Number(panel.dataset.step) !== step;
      });
      $$("[data-goto]").forEach((button) => {
        const index = Number(button.dataset.goto);
        if (index === step) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
        button.disabled = index > step;
      });
      const panel = $(`[data-step="${step}"]`);
      if (scroll && panel) {
        const top = panel.getBoundingClientRect().top;
        if (top < 70) window.scrollTo({ top: window.scrollY + top - 90, behavior: "smooth" });
      }
      if (step === 2) paintCabins();
      if (step === 3) paintReview();
      paintFare();
    }

    function paintFare() {
      const quote = priceTrip(state);
      const price = $("#fare-price");
      const meta = $("#fare-meta");
      const lines = $("#fare-lines");
      const notes = $("#fare-notes");
      lines.replaceChildren();
      notes.replaceChildren();
      if (!quote.ok) {
        price.textContent = "—";
        meta.textContent = quote.errors[0] || "Add a route to price this trip.";
        return;
      }
      price.textContent = money(quote.total);
      const service = serviceById(state.service);
      const when = state.date && state.time ? formatWhen(combine(state.date, state.time)) : "";
      meta.textContent = `${service.name} · ${when}`;
      quote.lines.forEach((line) => {
        const row = document.createElement("div");
        row.innerHTML = `<dt>${escapeHtml(line.label)}</dt><dd class="num">${escapeHtml(line.value)}</dd>`;
        lines.append(row);
      });
      const total = document.createElement("div");
      total.className = "total";
      total.innerHTML = `<dt>Fare to confirm</dt><dd class="num">${money(quote.total)}</dd>`;
      lines.append(total);
      quote.advisories.forEach((text) => {
        const note = document.createElement("p");
        note.className = "advisory";
        note.textContent = text;
        notes.append(note);
      });
    }

    function showErrors(errors) {
      const box = $("#form-errors");
      if (!errors.length) {
        box.hidden = true;
        box.textContent = "";
        return;
      }
      box.hidden = false;
      box.textContent = errors[0];
    }

    function paintCabins() {
      const wrap = $("#cabin-options");
      wrap.replaceChildren();
      const passengers = state.passengers;
      DB.cabins.forEach((cabin) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `cabin-option${state.cabin === cabin.id ? " is-selected" : ""}`;
        const disabled = passengers > cabin.guests;
        button.disabled = disabled;
        const draft = { ...state, cabin: cabin.id };
        const quote = priceTrip(draft);
        button.innerHTML = `
          <span class="tag">${escapeHtml(cabin.mark)}</span>
          <strong>${escapeHtml(cabin.name)}</strong>
          <small>${escapeHtml(cabin.blurb)} ${escapeHtml(cabin.bags)}.</small>
          <b class="num">${disabled ? `Up to ${cabin.guests} guests` : quote.ok ? money(quote.total) : "—"}</b>`;
        button.addEventListener("click", () => {
          state.cabin = cabin.id;
          writeDraft(state);
          paintCabins();
          paintFare();
        });
        wrap.append(button);
      });
    }

    function paintReview() {
      const quote = priceTrip(state);
      const box = $("#review-copy");
      const service = serviceById(state.service);
      const cabin = cabinById(state.cabin);
      const from = placeById(state.from);
      const to = placeById(state.to);
      const member = currentMember();
      if (!quote.ok) {
        box.textContent = quote.errors[0];
        return;
      }
      const bits = [
        service.name,
        formatWhen(quote.when),
        `${from.name} → ${to.name}`,
        `${cabin.name} cabin`,
        `${state.passengers} guest${state.passengers > 1 ? "s" : ""}`
      ];
      if (service.model === "hourly") bits.push(`${quote.hours} hours`);
      if (state.flight) bits.push(`Flight ${state.flight.trim()}`);
      box.innerHTML = `<p>${bits.map(escapeHtml).join(" · ")}</p>
        <p class="fine" style="margin-top:8px">${member ? `Held for ${escapeHtml(member.name)}.` : "Sign in to hold this trip on your desk. The form is ready — login is one click."}</p>
        ${state.notes ? `<p class="fine" style="margin-top:8px">${escapeHtml(state.notes)}</p>` : ""}`;
      const confirm = $("#confirm-trip");
      confirm.textContent = member ? "Confirm trip" : "Login and confirm";
    }

    function showDone(trip) {
      sessionStorage.removeItem(DRAFT);
      sessionStorage.removeItem(PENDING);
      $("#booking-form").hidden = true;
      $(".progress").hidden = true;
      $("#booking-intro").hidden = true;
      const layout = $(".booking-layout");
      layout.classList.add("is-done");
      $("#fare").hidden = true;
      const done = $("#booking-done");
      const service = serviceById(trip.service);
      const cabin = cabinById(trip.cabin);
      const from = placeById(trip.from);
      const to = placeById(trip.to);
      done.hidden = false;
      done.innerHTML = `
        <svg class="done-mark" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
          <path class="route-line" d="M15 27.5 L23 35 L38 18" fill="none" stroke="#E23D12" stroke-width="2.2" pathLength="1"></path>
        </svg>
        <p class="eyebrow">Trip confirmed</p>
        <h1>You're set.</h1>
        <p class="ref num">${escapeHtml(trip.id)}</p>
        <p class="lede">${escapeHtml(service.name)} · ${escapeHtml(formatWhen(trip.at))}</p>
        <p>${escapeHtml(from.name)} → ${escapeHtml(to.name)}</p>
        <p class="fine">${escapeHtml(cabin.name)} cabin · Driver ${escapeHtml(trip.driver)} · Fare ${money(trip.price)}</p>
        <p class="fine">No payment is taken in this demo. The trip is on your member desk.</p>
        <div class="done-actions">
          <a class="btn btn-primary" href="account.html">View your trips</a>
          <a class="btn btn-ghost" href="booking.html">Plan another</a>
        </div>`;
    }

    fields.service.addEventListener("change", () => {
      state.service = fields.service.value;
      if (state.service === "chauffeur" && !state.to) state.to = "as-directed";
      syncServiceFields();
      readForm();
      paintFare();
    });
    ["from", "to", "date", "time", "flight", "notes"].forEach((key) => {
      fields[key].addEventListener("input", () => {
        readForm();
        showErrors([]);
        paintFare();
      });
      fields[key].addEventListener("change", () => {
        readForm();
        paintFare();
      });
    });

    $("#guest-minus").addEventListener("click", () => {
      state.passengers = Math.max(1, state.passengers - 1);
      $("#guest-count").textContent = String(state.passengers);
      writeDraft(state);
      paintFare();
    });
    $("#guest-plus").addEventListener("click", () => {
      state.passengers = Math.min(6, state.passengers + 1);
      $("#guest-count").textContent = String(state.passengers);
      if (cabinById(state.cabin).guests < state.passengers) state.cabin = "group";
      writeDraft(state);
      paintFare();
    });
    $("#hour-minus").addEventListener("click", () => {
      const min = serviceById(state.service)?.minHours || 3;
      state.blockHours = Math.max(min, state.blockHours - 1);
      $("#hour-count").textContent = String(state.blockHours);
      writeDraft(state);
      paintFare();
    });
    $("#hour-plus").addEventListener("click", () => {
      state.blockHours = Math.min(12, state.blockHours + 1);
      $("#hour-count").textContent = String(state.blockHours);
      writeDraft(state);
      paintFare();
    });

    $$("[data-goto]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = Number(button.dataset.goto);
        if (target < state.step) setStep(target, true);
      });
    });

    $("#back-details").addEventListener("click", () => setStep(1, true));
    $("#back-cabin").addEventListener("click", () => setStep(2, true));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      readForm();
      if (state.step === 1) {
        const quote = priceTrip(state);
        if (!quote.ok) {
          showErrors(quote.errors);
          paintFare();
          return;
        }
        showErrors([]);
        setStep(2, true);
        return;
      }
      if (state.step === 2) {
        const quote = priceTrip(state);
        if (!quote.ok) {
          showErrors(quote.errors);
          setStep(1, true);
          return;
        }
        showErrors([]);
        setStep(3, true);
        return;
      }
      confirmTrip();
    });

    function confirmTrip() {
      readForm();
      const quote = priceTrip(state);
      if (!quote.ok) {
        showErrors(quote.errors);
        setStep(1, true);
        return;
      }
      if (!currentMember()) {
        writeDraft(state);
        sessionStorage.setItem(PENDING, "1");
        location.href = `login.html?next=${encodeURIComponent("booking.html?resume=1")}`;
        return;
      }
      const result = createBooking(state);
      if (!result.ok) {
        showErrors(result.errors);
        return;
      }
      history.replaceState({}, "", `booking.html?done=${encodeURIComponent(result.trip.id)}`);
      showDone(result.trip);
    }

    $("#confirm-trip").addEventListener("click", confirmTrip);

    const suggest = $("#use-intercity");
    if (suggest) {
      suggest.addEventListener("click", () => {
        state.service = "intercity";
        fields.service.value = "intercity";
        syncServiceFields();
        writeDraft(state);
        paintFare();
      });
    }

    writeForm();
    paintFare();

    if (sessionStorage.getItem(PENDING) === "1" && currentMember()) {
      sessionStorage.removeItem(PENDING);
      const quote = priceTrip(state);
      if (quote.ok) {
        const result = createBooking(state);
        if (result.ok) {
          history.replaceState({}, "", `booking.html?done=${encodeURIComponent(result.trip.id)}`);
          showDone(result.trip);
          return;
        }
      }
    }

    setStep(1, false);
  }

  function boot() {
    initChrome();
    const page = document.body.dataset.page;
    if (page === "home") initHome();
    if (page === "booking") initBooking();
    if (page === "account") initAccount();
    if (page === "contact") initContact();
    if (page === "login") initLogin();
    initReveal();
  }

  boot();
})();
