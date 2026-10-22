/* Demo store for Northline. Swap this object for an API later.
   Bookings persist in localStorage. Login checks the member record below.
   The sign-in form masks both values; nothing on the page prints them. */
window.NORTHLINE = {
  name: "Northline",
  phoneDisplay: "(415) 555-0140",
  phoneTel: "+14155550140",
  member: {
    id: "NL-20481",
    passcode: "linework",
    name: "Alex Marin",
    since: "2024",
    plan: "Company travel",
    desk: "San Francisco"
  },
  drivers: ["Maya Chen", "Andre Ellis", "Sofia Rahman", "Jonah Blake", "Camille Ortiz"],
  services: [
    {
      id: "city",
      name: "City motion",
      page: "service-city.html",
      short: "Point to point across the metro, on a clock you set.",
      model: "distance",
      base: 18,
      perMile: 3.4,
      minFare: 28
    },
    {
      id: "airside",
      name: "Airside",
      page: "service-airside.html",
      short: "Airport arrivals and departures, with wait time in the fare.",
      model: "distance",
      base: 46,
      perMile: 3.8,
      minFare: 68,
      earlySurcharge: 15
    },
    {
      id: "company",
      name: "Company travel",
      page: "service-company.html",
      short: "Guest trips and standing routes on one company account.",
      model: "distance",
      base: 22,
      perMile: 3.5,
      minFare: 34
    },
    {
      id: "chauffeur",
      name: "Chauffeur",
      page: "service-chauffeur.html",
      short: "A driver for the day or the evening, route left open.",
      model: "hourly",
      hourly: 95,
      minHours: 3,
      maxHours: 12
    },
    {
      id: "intercity",
      name: "Intercity",
      page: "service-intercity.html",
      short: "Door to door between the cities Northline serves.",
      model: "distance",
      base: 80,
      perMile: 2.4,
      minFare: 140
    }
  ],
  cabins: [
    {
      id: "city",
      name: "City",
      guests: 3,
      bags: "Two large bags",
      blurb: "A calm sedan for one to three.",
      multiplier: 1,
      mark: "Everyday"
    },
    {
      id: "executive",
      name: "Executive",
      guests: 3,
      bags: "Two large bags",
      blurb: "More quiet, more room, a smoother ride.",
      multiplier: 1.42,
      mark: "Most requested"
    },
    {
      id: "group",
      name: "Group",
      guests: 6,
      bags: "Six large bags",
      blurb: "A van for teams, families, and luggage.",
      multiplier: 1.68,
      mark: "Up to 6"
    }
  ],
  places: [
    { id: "fidi", name: "Financial District", region: "San Francisco", kind: "street", lat: 37.7935, lng: -122.3994 },
    { id: "mission", name: "Mission District", region: "San Francisco", kind: "street", lat: 37.7599, lng: -122.4148 },
    { id: "soma", name: "SoMa", region: "San Francisco", kind: "street", lat: 37.7785, lng: -122.395 },
    { id: "pacific", name: "Pacific Heights", region: "San Francisco", kind: "street", lat: 37.7925, lng: -122.4382 },
    { id: "sfo", name: "SFO International", region: "San Francisco", kind: "airport", lat: 37.6213, lng: -122.379 },
    { id: "oakland", name: "Oakland, City Center", region: "East Bay", kind: "street", lat: 37.8044, lng: -122.2712 },
    { id: "berkeley", name: "Berkeley", region: "East Bay", kind: "street", lat: 37.8715, lng: -122.273 },
    { id: "oak", name: "Oakland International (OAK)", region: "East Bay", kind: "airport", lat: 37.7126, lng: -122.2197 },
    { id: "sjd", name: "San Jose, Downtown", region: "South Bay", kind: "street", lat: 37.3382, lng: -121.8863 },
    { id: "sjc", name: "San Jose International (SJC)", region: "South Bay", kind: "airport", lat: 37.3639, lng: -121.9289 },
    { id: "ladt", name: "Downtown Los Angeles", region: "Los Angeles", kind: "street", lat: 34.0407, lng: -118.2468 },
    { id: "lax", name: "LAX", region: "Los Angeles", kind: "airport", lat: 33.9416, lng: -118.4085 },
    { id: "sm", name: "Santa Monica", region: "Los Angeles", kind: "street", lat: 34.0195, lng: -118.4912 },
    { id: "seadt", name: "Downtown Seattle", region: "Seattle", kind: "street", lat: 47.6062, lng: -122.3321 },
    { id: "sea", name: "Sea-Tac (SEA)", region: "Seattle", kind: "airport", lat: 47.4502, lng: -122.3088 },
    { id: "pdxdt", name: "Downtown Portland", region: "Portland", kind: "street", lat: 45.5152, lng: -122.6784 },
    { id: "pdx", name: "PDX", region: "Portland", kind: "airport", lat: 45.5898, lng: -122.5951 }
  ],
  board: [
    { from: "SFO International", to: "Financial District", cabin: "Executive", state: "On approach", eta: "14 min", live: true },
    { from: "Oakland, City Center", to: "SJC", cabin: "City", state: "En route", eta: "22 min", live: true },
    { from: "LAX", to: "Santa Monica", cabin: "Group", state: "At the curb", eta: "Now", live: false },
    { from: "Downtown Seattle", to: "Sea-Tac", cabin: "Executive", state: "En route", eta: "18 min", live: true },
    { from: "PDX", to: "Downtown Portland", cabin: "City", state: "On approach", eta: "11 min", live: true },
    { from: "Berkeley", to: "SFO International", cabin: "City", state: "Assigned", eta: "34 min", live: false }
  ],
  seed: [
    {
      id: "NL-18420",
      dayOffset: 1,
      hours: 16,
      minutes: 40,
      status: "Confirmed",
      service: "airside",
      cabin: "executive",
      from: "sfo",
      to: "fidi",
      passengers: 1,
      blockHours: null,
      flight: "UA 448",
      notes: "Arrivals curb, door 5.",
      driver: "Maya Chen"
    },
    {
      id: "NL-18421",
      dayOffset: 3,
      hours: 8,
      minutes: 15,
      status: "Confirmed",
      service: "city",
      cabin: "city",
      from: "oakland",
      to: "sjc",
      passengers: 1,
      blockHours: null,
      flight: "",
      notes: "",
      driver: "Andre Ellis"
    },
    {
      id: "NL-18422",
      dayOffset: 8,
      hours: 9,
      minutes: 0,
      status: "Confirmed",
      service: "chauffeur",
      cabin: "executive",
      from: "fidi",
      to: "as-directed",
      passengers: 2,
      blockHours: 4,
      flight: "",
      notes: "Morning meetings, then lunch in the Mission.",
      driver: "Sofia Rahman"
    },
    {
      id: "NL-17302",
      dayOffset: -4,
      hours: 11,
      minutes: 5,
      status: "Completed",
      service: "airside",
      cabin: "city",
      from: "lax",
      to: "sm",
      passengers: 2,
      blockHours: null,
      flight: "AS 210",
      notes: "",
      driver: "Jonah Blake"
    },
    {
      id: "NL-16910",
      dayOffset: -9,
      hours: 18,
      minutes: 30,
      status: "Cancelled",
      service: "city",
      cabin: "city",
      from: "mission",
      to: "sfo",
      passengers: 1,
      blockHours: null,
      flight: "",
      notes: "",
      driver: "Camille Ortiz"
    },
    {
      id: "NL-16114",
      dayOffset: -16,
      hours: 7,
      minutes: 45,
      status: "Completed",
      service: "intercity",
      cabin: "executive",
      from: "seadt",
      to: "pdxdt",
      passengers: 1,
      blockHours: null,
      flight: "",
      notes: "",
      driver: "Maya Chen"
    }
  ]
};
