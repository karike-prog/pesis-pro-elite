const $ = (id) => document.getElementById(id);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TEAM_LOGOS = {
  "AA": "images/logos/aa.png",
"HP": "images/logos/hp.png",
"Tahko": "images/logos/tahko.png",
"IPV": "images/logos/ipv.png",
"JoMa": "images/logos/joma.png",
"KeKi": "images/logos/keki.png",
"KPL": "images/logos/kpl.png",
"KoU": "images/logos/kou.png",
"Manse": "images/logos/manse.png",
"PattU": "images/logos/pattu.png",
"SoJy": "images/logos/sojy.png",
"KiPa": "images/logos/kipa.png",
"ViVe": "images/logos/veto.png",
  "Jussittaret": "images/logos/jussittaret.png",
"JoMa N": "images/logos/joma_n.png",
"JoMa": "images/logos/joma_n.png",
"Manse N": "images/logos/manse_n.png",
"Pesäkarhut": "images/logos/pesakarhut.png",
"Virkiä": "images/logos/virkia.png",
"Kirittäret": "images/logos/kirittaret.png",
"Lippo Naiset": "images/logos/lippo.png",
"PöU Pesis": "images/logos/poytya.png",
"Roihuttaret": "images/logos/roihu.png",
"Fera": "images/logos/fera.png",
"Jyske": "images/logos/jyske.png",
"Mailattaret": "images/logos/mailattaret.png",
  "HP": "images/logos/hp.png",
"KaMa": "images/logos/kama.png",
"Jkl Kiri": "images/logos/kiri.png",
"NJ": "images/logos/nj.png",
"PuMu": "images/logos/pumu.png",
"PuPe": "images/logos/pupe.png",
"SiKi": "images/logos/siki.png",
"SMJ": "images/logos/smj.png",
"UPV": "images/logos/upv.png",
"Ura": "images/logos/ura.png",
"SiiPe": "images/logos/siipe.png",
};
const PLAYER_STATS_URL =
  "https://www.pesistulokset.fi/api/players?seasonSeriesId=2945";

const FIRST_CATCHERS = {
  "AA": "Seeti Surakka",
  "Tahko": "Petteri Alanen",
  "JoMa": "Ukko Schroderus",
  "KeKi": "Topi Still",
  "KiPa": "Joona Lehtinen",
  "KoU": "Aku Kettunen",
  "KPL": "Elias Pitkänen",
  "Manse": "Juha Puhtimäki",
  "PattU": "Topi Kosonen",
  "SoJy": "Aapo Komulainen",
  "ViVe": "Ville Soini",

  "Jussittaret": "",
  "JoMa N": "",
  "Manse N": "",
  "Pesäkarhut": "",
  "Virkiä": "",
  "Kirittäret": "",
  "Lippo Naiset": "",
  "Roihuttaret": "",
  "Fera": "",
  "Mailattaret": "",
  "PöU Pesis": "",
  "Jyske": "",
};
function fmtDate(iso) {
  return new Date(iso).toLocaleString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function renderOfficialStandings(rows, targetId) {
  $(targetId).innerHTML = rows.map(row => {
    const logo = TEAM_LOGOS[row.team] || "images/logos/default.png";

    return `
      <tr>
     <td class="logoCell">
  <img src="${logo}" class="standings-logo" alt="${row.team}">
</td>
        <td><strong>${row.team}</strong></td>
        <td>${row.o}</td>
        <td>${row.v}</td>
        <td>${row.h}</td>
        <td>${row.p}</td>
      </tr>
    `;
  }).join("");
}
function getRuns(result, side) {
  if (!result) return 0;
  const p = side === "home" ? "home" : "away";
  const d = result.details || result;
  return Number(d[`runs_${p}_first_period`] || 0) +
         Number(d[`runs_${p}_second_period`] || 0);
}

function addTeam(stats, team) {
  if (!stats[team.id]) {
    stats[team.id] = {
      id: team.id,
      name: team.shorthand || team.name,
      played: 0,
      for: 0,
      against: 0,
      homePlayed: 0,
      homeFor: 0,
      homeAgainst: 0,
      awayPlayed: 0,
      awayFor: 0,
      awayAgainst: 0,
      recent: []
    };
  }
  return stats[team.id];
}
function buildStats(matches) {
  const stats = {};

  matches
    .filter(m => m.result && m.liveResult && m.liveResult.finished)
    .forEach(m => {
      const home = addTeam(stats, m.home);
      const away = addTeam(stats, m.away);

      const homeRuns = getRuns(m.result, "home");
      const awayRuns = getRuns(m.result, "away");

      home.played++;
      home.for += homeRuns;
      home.against += awayRuns;
      home.homePlayed++;
      home.homeFor += homeRuns;
      home.homeAgainst += awayRuns;
      home.recent.push({ date: m.date, for: homeRuns, against: awayRuns });

      away.played++;
      away.for += awayRuns;
      away.against += homeRuns;
      away.awayPlayed++;
      away.awayFor += awayRuns;
      away.awayAgainst += homeRuns;
      away.recent.push({ date: m.date, for: awayRuns, against: homeRuns });
    });

  Object.values(stats).forEach(t => {
    t.recent.sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  return stats;
}
function buildStandings(matches) {
  const table = {};

  function ensure(team) {
    const name = team.shorthand || team.name;
    if (!table[team.id]) {
      table[team.id] = { team: name, o: 0, v: 0, h: 0, p: 0 };
    }
    return table[team.id];
  }

  matches
    .filter(m => m.result && m.result.details)
    .forEach(m => {
      const home = ensure(m.home);
      const away = ensure(m.away);
      const d = m.result.details;

      const hp = Number(d.periods_home || 0);
      const ap = Number(d.periods_away || 0);

      home.o++;
      away.o++;

      if (hp === 2 && ap === 0) {
        home.v++; away.h++; home.p += 3;
      } else if (ap === 2 && hp === 0) {
        away.v++; home.h++; away.p += 3;
      } else if (hp === 2 && ap === 1) {
        home.v++; away.h++; home.p += 2; away.p += 1;
      } else if (ap === 2 && hp === 1) {
        away.v++; home.h++; away.p += 2; home.p += 1;
      } else if (hp === 1 && ap === 0) {
        home.v++; away.h++; home.p += 2;
      } else if (ap === 1 && hp === 0) {
        away.v++; home.h++; away.p += 2;
      }
    });

  return Object.values(table).sort((a, b) => {
    if (b.p !== a.p) return b.p - a.p;
    if (b.v !== a.v) return b.v - a.v;
    return a.team.localeCompare(b.team);
  });
}


function recentAvg(team, field) {
  const games = team.recent.slice(0, 5);
  if (!games.length) return null;
  return games.reduce((sum, g) => sum + g[field], 0) / games.length;
}

function average(a, b, fallback) {
  const values = [a, b].filter(v => Number.isFinite(v) && v > 0);
  if (!values.length) return fallback;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function weatherAdjustment(weather) {
  return 0;
}


function predict(homeTeam, awayTeam, stats, weather) {
  const home = stats[homeTeam.id];
  const away = stats[awayTeam.id];

  if (!home || !away) {
    return {
      homeRuns: 0,
      awayRuns: 0,
      homePct: 50,
      awayPct: 50,
      note: "Dataa liian vähän."
    };
  }

  const leagueAvg =
    Object.values(stats).reduce((sum, t) => sum + t.for, 0) /
    Math.max(1, Object.values(stats).reduce((sum, t) => sum + t.played, 0));

  const homeAttack = home.homePlayed ? home.homeFor / home.homePlayed : home.for / home.played;
  const homeDefense = home.homePlayed ? home.homeAgainst / home.homePlayed : home.against / home.played;
  const awayAttack = away.awayPlayed ? away.awayFor / away.awayPlayed : away.for / away.played;
  const awayDefense = away.awayPlayed ? away.awayAgainst / away.awayPlayed : away.against / away.played;

  let homeRuns = average(homeAttack, awayDefense, leagueAvg);
  let awayRuns = average(awayAttack, homeDefense, leagueAvg);

  const hRecentFor = recentAvg(home, "for");
  const hRecentAgainst = recentAvg(home, "against");
  const aRecentFor = recentAvg(away, "for");
  const aRecentAgainst = recentAvg(away, "against");

  if (hRecentFor !== null && aRecentAgainst !== null) {
    homeRuns = homeRuns * 0.75 + ((hRecentFor + aRecentAgainst) / 2) * 0.25;
  }

  if (aRecentFor !== null && hRecentAgainst !== null) {
    awayRuns = awayRuns * 0.75 + ((aRecentFor + hRecentAgainst) / 2) * 0.25;
  }

  homeRuns += 0.25;

 const wAdj = weatherAdjustment(weather?.start || weather);
  homeRuns += wAdj / 2;
  awayRuns += wAdj / 2;

  const diff = homeRuns - awayRuns;
  const homePct = Math.max(25, Math.min(75, 50 + diff * 6));

  return {
    homeRuns,
    awayRuns,
    homePct,
    awayPct: 100 - homePct,
    note: ""
  };
}
function shootoutProbability(prediction) {
  const diff = Math.abs(prediction.homePct - prediction.awayPct);
  const total = prediction.homeRuns + prediction.awayRuns;

  let p = 18;

  // Mitä tasaisempi peli, sitä suurempi kotiutuskisan riski
  if (diff <= 4) p += 12;
  else if (diff <= 8) p += 9;
  else if (diff <= 14) p += 6;
  else if (diff <= 22) p += 3;
  else p -= 3;

  // Vähäjuoksinen peli lisää tasurimahdollisuutta
  if (total < 9) p += 6;
  else if (total < 11) p += 4;
  else if (total < 13) p += 2;
  else p -= 2;

  // Rajat
  p = Math.max(8, Math.min(42, p));

  return Math.round(p);
}
function getLineupAdjustment(match, lineup) {

const hasPlayer = (players, name) =>
  players.some(p => (p.name || "").trim().toLowerCase() === name.trim().toLowerCase());

let homeRuns = 0;
let awayRuns = 0;
let applied = false;

const homeCatcher = FIRST_CATCHERS[match.home.shorthand];
const awayCatcher = FIRST_CATCHERS[match.away.shorthand];

if (homeCatcher && !hasPlayer(homePlayers, homeCatcher)) {
  homeRuns -= 0.5;
  awayRuns += 0.5;
  applied = true;
}

if (awayCatcher && !hasPlayer(awayPlayers, awayCatcher)) {
  awayRuns -= 0.5;
  homeRuns += 0.5;
  applied = true;
}

  // TODO:
  // Tarkista puuttuuko ykköslukkari
  // Tarkista puuttuuko Top20-lyöjä

  return {
    homeRuns,
    awayRuns,
    applied
  };
}
function getWeatherAdjustment(weather) {
  console.log(weather);
  if (!weather) return 0;

  const temp = Number(weather.temp ?? weather.temperature ?? 0);
  const wind = Number(weather.wind ?? weather.windSpeed ?? 0);
  const rain = Number(weather.rain ?? weather.precipitation ?? 0);

  let adj = 0;

  // Sade
  if (rain >= 3) adj -= 0.8;
  else if (rain >= 1) adj -= 0.5;
  else if (rain >= 0.2) adj -= 0.2;

  // Tuuli
  if (wind >= 12) adj -= 0.4;
  else if (wind >= 8) adj -= 0.2;

  // Lämpö
  if (temp >= 24 && temp <= 30) adj += 0.2;
  if (temp <= 10 && temp > -50) adj -= 0.3;

  // Rajataan järkeväksi
  adj = Math.max(-1.0, Math.min(0.5, adj));

  return Number(adj.toFixed(1));
}
function weatherHtml(weather) {
  if (!weather || weather.error) {
    return `<div class="weather">🌦️ Sää: ei saatavilla</div>`;
  }

  const now = weather.now || weather;
  const start = weather.start || weather;


  return `
    <div class="weather">
      <strong>🌦️ Sää nyt:</strong>
      ${now.temperature ?? "-"} °C,
      tuuli ${now.windSpeed ?? "-"} m/s,
      sade ${now.precipitation ?? "-"} mm/h
      <br>
      <strong>⏱️ Sää pelin alkaessa:</strong>
      ${start.temperature ?? "-"} °C,
      tuuli ${start.windSpeed ?? "-"} m/s,
      sade ${start.precipitation ?? "-"} mm/h

    </div>
  `;
}
const FALLBACK_STADIUMS = {
  "Kyrön Sähkö Center, Pöytyä": { lat: 60.764, lng: 22.697 },
  "K Power Stadion, Lapua": { lat: 62.970, lng: 23.009 },
  "Hehku Areena, Nurmo (Seinäjoki)": { lat: 62.870, lng: 22.883 },
  "Pihkalan pesäpallostadion, Hyvinkää": { lat: 60.635, lng: 24.859 },
  "Hietalahden Pesäpallostadion, Vaasa": { lat: 63.094, lng: 21.604 },
  "Osuma Arena, Kuopio": { lat: 62.893, lng: 27.677 },
  "Unico Arena, Seinäjoki": { lat: 62.792, lng: 22.841 },
  "Saltex Arena, Alajärvi": { lat: 63.001, lng: 23.816 },
  "KSS Energia Areena, Kouvola": { lat: 60.868, lng: 26.704 },
  "Rantakenttä, Kitee": { lat: 62.101, lng: 30.138 },
  "Huikoo Areena, Pori": {lat: 61.485,lng: 21.797},
  "Saarikenttä, Vimpeli": { lat: 63.1605, lng: 23.8220 },
  "Mantun kenttä, Siilinjärvi": { lat: 63.076, lng: 27.661 },
};

async function fetchWeather(match) {
  console.log("WEATHER MATCH:", match.stadium);
    let geometry = match.stadium?.details?.place?.geometry;


  const stadiumName = match.stadium?.name?.trim();

  if ((!geometry?.lat || !geometry?.lng) && FALLBACK_STADIUMS[stadiumName]) {
    geometry = FALLBACK_STADIUMS[stadiumName];
  }

  if (!geometry?.lat || !geometry?.lng) {
    return { error: "Ei stadionin koordinaatteja" };
  }

const startUrl =
  `/.netlify/functions/weather?lat=${geometry.lat}&lon=${geometry.lng}&time=${encodeURIComponent(match.date)}`;

const nowUrl =
  `/.netlify/functions/weather?lat=${geometry.lat}&lon=${geometry.lng}&time=${encodeURIComponent(new Date().toISOString())}`;

try {
  const startRes = await fetch(startUrl);
  const nowRes = await fetch(nowUrl);

  if (!startRes.ok || !nowRes.ok) {
    return { error: "Säähaku epäonnistui" };
  }

  return {
    start: await startRes.json(),
    now: await nowRes.json()
  };
} catch (e) {
  return { error: e.message };
}
}
function buildPlayerRatings(players) {
  return players
    .map(p => {
      const scorings = Number(p.scorings || 0);
      const runs = Number(p.runs || 0);
      const homeruns = Number(p.homeruns || 0);

      return {
        ...p,
        eliteRating: scorings + runs * 0.6 + homeruns * 1.5
      };
    })
    .sort((a, b) => b.eliteRating - a.eliteRating);
}
function buildTeamPlayerRatings(players) {
  const teams = {};

  players.forEach(p => {
    const teamId = p.team_ids?.[0];
    if (!teamId) return;

    if (!teams[teamId]) {
      teams[teamId] = [];
    }

    teams[teamId].push(p);
  });

  const result = {};

  Object.keys(teams).forEach(teamId => {
    const top5 = teams[teamId]
      .sort((a, b) => b.eliteRating - a.eliteRating)
      .slice(0, 5);

    const totalRating = top5.reduce(
      (sum, p) => sum + p.eliteRating,
      0
    );

    result[teamId] = {
      top5,
      totalRating
    };
  });

  return result;
}
async function fetchPlayerStats() {
  try {
    const res = await fetch("/.netlify/functions/player-stats");

    if (!res.ok) {
      console.log("PLAYER STATS EI OK:", res.status);
      return [];
    }

    const json = await res.json();
const players = Array.isArray(json.data) ? json.data : [];

const ratedPlayers = buildPlayerRatings(players);
const teamPlayerRatings = buildTeamPlayerRatings(ratedPlayers);

console.log("PLAYER STATS:", ratedPlayers.length);
console.log("TOP 5:", ratedPlayers.slice(0, 5));
console.log("TEAM PLAYER RATINGS:", teamPlayerRatings);

return {
  players: ratedPlayers,
  teams: teamPlayerRatings
};
  } catch (e) {
    console.log("PLAYER STATS VIRHE:", e);
    return [];
  }
}
async function fetchLineup(match) {
  try {
    const url = `/.netlify/functions/lineup?id=${match.id}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    console.log("LINEUP JSON:", json);
    return json;
  } catch (e) {
    console.log("LINEUP VIRHE:", e);
    return null;
  }
}
function lineupHtml(lineup) {
  const data = lineup?.data || lineup?.match || lineup;

  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) {
    console.log("LINEUP EI LÖYTYNYT:", lineup);
    return `<div class="lineup">📋 Kokoonpanot eivät vielä saatavilla</div>`;
  }

  const playerRows = (players) =>
    players
      .map(p => `<div>${p.number}. ${p.name}</div>`)
      .join("");

  return `
    <div class="lineup">
      <strong>📋 Kokoonpanot</strong>
      <div class="lineup-grid">
        <div>
          <b>${data.home.shorthand}</b>
          ${playerRows(homePlayers)}
        </div>
        <div>
          <b>${data.away.shorthand}</b>
          ${playerRows(awayPlayers)}
        </div>
      </div>
    </div>
  `;
}


const TOP20_LYOJAT = [
  { name: "Juho Toivola", team: "JoMa" },
  { name: "Jukka-Pekka Vainionpää", team: "Manse" },
  { name: "Perttu Ruuska", team: "Manse" },
  { name: "Henri Puputti", team: "ViVe" },
  { name: "Patrik Wahlsten", team: "KPL" },
  { name: "Roope Korhonen", team: "SoJy" },
  { name: "Martti Viitasalo", team: "PattU" },
  { name: "Matias Rinta-aho", team: "ViVe" },
  { name: "Rasmus Teppo", team: "KoU" },
  { name: "Ville-Veikko Olli", team: "IPV" },
  { name: "Juha Niemi", team: "Tahko" },
  { name: "Antti Korhonen", team: "Manse" },
  { name: "Janne Mäkelä", team: "KiPa" },
  { name: "Santtu Patova", team: "Tahko" },
  { name: "Ossi Meriläinen", team: "KeKi" },
  { name: "Tuukka Sarkkinen", team: "KeKi" },
  { name: "Aappo Savikoski", team: "IPV" },
  { name: "Petteri Kortelainen", team: "AA" },
  { name: "Samuel Huotari", team: "SoJy" },
  { name: "Aaro Ojanperä", team: "KeKi" },
  { name: "Aino-Kaisa Mantere", team: "Jussittaret" },
  { name: "Janette Lepistö", team: "Virkiä" },
  { name: "Siri Eskola", team: "Manse" },
  { name: "Nelli Huotari", team: "JoMa" },
  { name: "Maija Vastamäki", team: "Manse" },
  { name: "Taru Toikka", team: "Pesäkarhut" },
  { name: "Maria Kaakinen", team: "JoMa" },
  { name: "Lotta Nummikari", team: "Pesäkarhut" },
  { name: "Hanna Toivanen", team: "JoMa" },
  { name: "Anna Ala-Kauhaluoma", team: "Manse" },
  { name: "Sara Kujanen", team: "Kirittäret" },
  { name: "Sohvi Korhonen", team: "Roihuttaret" },
  { name: "Emilia Linna", team: "JoMa" },
  { name: "Tiia Valtanen", team: "Virkiä" },
  { name: "Tiia Peltonen", team: "Jussittaret" },
  { name: "Nea Tuikka", team: "Lippo Naiset" },
  { name: "Tinja Töyrylä", team: "Kirittäret" },
  { name: "Iina Valkeejärvi", team: "Fera" },
  { name: "Anni Laakso", team: "Jussittaret" },
  { name: "Essi Ilmanen", team: "PöU Pesis" },
];
function getLineupAdjustment(match, lineup) {
  if (!lineup) {
    return { homeRuns: 0, awayRuns: 0, applied: false };
  }

  const data = lineup?.data || lineup?.match || lineup;

  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) {
    return { homeRuns: 0, awayRuns: 0, applied: false };
  }

  return {
    homeRuns: 0,
    awayRuns: 0,
    applied: false
  };
}
function keyPlayerAbsenceHtml(match, lineup, selectedSeries) {
  const data = lineup?.data || lineup?.match || lineup;

  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) return "";

  const homeName = match.home.shorthand || match.home.name;
  const awayName = match.away.shorthand || match.away.name;

  const homeLineupNames = homePlayers.map(p => p.name);
  const awayLineupNames = awayPlayers.map(p => p.name);

  const missing = [];

TOP20_LYOJAT.forEach(player => {

if (player.series !== selectedSeries) return;

  if (player.team === homeName) {
    const found = homeLineupNames.includes(player.name);
    if (!found) missing.push(`${player.name} (${player.team}) pois kokoonpanosta`);
  }

  if (player.team === awayName) {
    const found = awayLineupNames.includes(player.name);
    if (!found) missing.push(`${player.name} (${player.team}) pois kokoonpanosta`);
  }
});

  if (!missing.length) return "";

  return `
    <div class="keyAbsence">
      <strong>⚠️ Avainpelaaja huomio</strong>
      ${missing.map(m => `<div>${m}</div>`).join("")}
    </div>
  `;
}
function sumRuns(arr) {
  return (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);
}

function sumRuns(arr) {
  return (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);
}

function sumRuns(arr) {
  return (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);
}
function teamShortName(team) {
  return team?.shorthand || team?.name || "";
}
function liveScoreboardHtml(match, lr) {
  const p1 = lr.runs?.[0] || { home: [], away: [] };
  const p2 = lr.runs?.[1] || { home: [], away: [] };

  const fill = (arr) => Array.from({ length: 4 }, (_, i) => arr?.[i] ?? "–");

  const p1Home = fill(p1.home);
  const p1Away = fill(p1.away);
  const p2Home = fill(p2.home);
  const p2Away = fill(p2.away);

  const homeP1 = sumRuns(p1.home);
  const awayP1 = sumRuns(p1.away);
  const homeP2 = sumRuns(p2.home);
  const awayP2 = sumRuns(p2.away);

  const home = teamShortName(match.home);
  const away = teamShortName(match.away);

  return `
    <div class="inningsCompact">
      <div class="periodTitle period1">1. jakso</div>
      <div class="periodTitle period2">2. jakso</div>

      <div class="teamCell"></div>
      <div class="headCell">1</div>
      <div class="headCell">2</div>
      <div class="headCell">3</div>
      <div class="headCell">4</div>
      <div class="headCell total">Y</div>

      <div class="headCell">1</div>
      <div class="headCell">2</div>
      <div class="headCell">3</div>
      <div class="headCell">4</div>
      <div class="headCell total">Y</div>

      <div class="teamCell">${home}</div>
      ${p1Home.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${homeP1}</div>
      ${p2Home.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${homeP2}</div>

      <div class="teamCell">${away}</div>
      ${p1Away.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${awayP1}</div>
      ${p2Away.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${awayP2}</div>
    </div>
  `;
}
function resultHtml(match, prediction) {
if (!match.result && match.liveResult && !match.liveResult.finished) {
  const lr = match.liveResult;
  const live = liveScoreboardHtml(match, lr);

  return `
  <div class="resultBox live">
    ${live}
  </div>
`;
}
  if (!match.result) return "";

  const r = match.result;
  const d = r.details;

  const homeWon = d.periods_home > d.periods_away;
  const awayWon = d.periods_away > d.periods_home;

  const elitePickedHome = prediction.homePct > prediction.awayPct;
  const eliteHit =
    (elitePickedHome && homeWon) ||
    (!elitePickedHome && awayWon);

  return `
<div class="resultBox ${eliteHit ? "hit" : "miss"}">
      <div><strong>🏁 Lopputulos</strong></div>
      <div><strong>${match.home.shorthand} – ${match.away.shorthand} ${r.result_string}</strong></div>

      <div style="margin-top:6px;">
        ${eliteHit ? "✅ Elite osui" : "❌ Elite yllättyi"}
      </div>

      <div style="margin-top:6px;">
        1. jakso: ${d.runs_home_first_period}–${d.runs_away_first_period}
      </div>

      <div>
        2. jakso: ${d.runs_home_second_period}–${d.runs_away_second_period}
      </div>

      ${
        !d.super_inning_is_not_played
          ? `<div>Kotiutuskisa: ${d.runs_home_super_inning}–${d.runs_away_super_inning}</div>`
          : ""
      }
    </div>
  `;
}
function renderPowerTable(stats, targetId) {
  const rows = Object.values(stats)
    .filter(t => t.played > 0)
    .sort((a, b) => {
      const an = a.for / a.played - a.against / a.played;
      const bn = b.for / b.played - b.against / b.played;
      return bn - an;
    })
    .map(t => {
      const f = t.for / t.played;
      const a = t.against / t.played;

      return `
        <tr>
         <td>${t.name}</td>
          <td>${t.played}</td>
          <td>${f.toFixed(2)}</td>
          <td>${a.toFixed(2)}</td>
          <td>${(f - a).toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  $(targetId).innerHTML = rows;
}
async function renderMatches(matches, stats, selectedSeries, targetId, cardClass, playerStats) {
  if (!matches.length) {
    $(targetId).innerHTML = "<p>Otteluita ei löytynyt valitulle päivälle.</p>";
    return;
  }

 $(targetId).innerHTML = "<p>Haetaan säätietoja...</p>";

  const cards = [];

 for (const match of matches) {

  console.log("MATCH:", match);

  const weather = await fetchWeather(match);
  const lineup = await fetchLineup(match);
  console.log("PLAYERSTATS TEAMS:", playerStats?.teams);
  console.log("HOME TEAM:", match.home);
  console.log("AWAY TEAM:", match.away);
  const lineupAdjustment = getLineupAdjustment(match, lineup);
  const prediction = predict(match.home, match.away, stats, weather);
   
  const getTeamPower = (team) => {
  return (
    playerStats?.teams?.[team.id]?.totalRating ??
    playerStats?.teams?.[team.shorthand]?.totalRating ??
    playerStats?.teams?.[team.name]?.totalRating ??
    0
  );
};
console.log("PLAYERSTATS =", playerStats);
console.log("PLAYERSTATS.TEAMS =", playerStats?.teams);
console.log("HOME =", match.home);
console.log("AWAY =", match.away);
const lineupData = lineup?.data || lineup?.match || lineup;

const homePowerId = lineupData?.home?.id || match.home.id;
const awayPowerId = lineupData?.away?.id || match.away.id;

   console.log("HOME ID =", match.home.id, match.home);
console.log("AWAY ID =", match.away.id, match.away);
const homePlayerPower =
  playerStats?.teams?.[homePowerId]?.totalRating || 0;

const awayPlayerPower =
  playerStats?.teams?.[awayPowerId]?.totalRating || 0;

const playerPowerDiff = homePlayerPower - awayPlayerPower;
   console.log("TEAM IDS =", Object.keys(playerStats.teams));
   
  prediction.homeRuns += lineupAdjustment.homeRuns;
prediction.awayRuns += lineupAdjustment.awayRuns;
prediction.lineupAdjusted = lineupAdjustment.applied; 
  const weatherAdjustment = getWeatherAdjustment(weather.start || weather);

prediction.homeRuns += weatherAdjustment / 2;
prediction.awayRuns += weatherAdjustment / 2;

prediction.homeRuns = Math.max(0, prediction.homeRuns);
prediction.awayRuns = Math.max(0, prediction.awayRuns);
   
  const total = prediction.homeRuns + prediction.awayRuns;
  const shootoutPct = shootoutProbability(prediction);
   
    const homeFav = prediction.homePct >= prediction.awayPct;
    const confidence = Math.abs(prediction.homePct - 50);

    let tag = "Tasainen";
    let tagClass = "orange";

    if (confidence >= 15) {
      tag = "Vahva suosikki";
      tagClass = "green";
    } else if (confidence >= 8) {
      tag = "Pieni suosikki";
      tagClass = "blue";
    }

const homeName = match.home.shorthand || match.home.name;
const awayName = match.away.shorthand || match.away.name;

const homeLogo = TEAM_LOGOS[homeName] || "images/logos/default.png";
const awayLogo = TEAM_LOGOS[awayName] || "images/logos/default.png";
    
    cards.push(`
      <div class="match ${cardClass}">
        <div class="top">
          <div>${fmtDate(match.date)}</div>
          <div>${match.stadium?.name || ""}</div>
        </div>

        <div class="teams">
          <div class="team">
            <div class="name">
  <img src="${homeLogo}" class="team-logo" alt="${homeName}">
  <span>${homeName}</span>
</div>
            <div class="pct ${homeFav ? "fav" : ""}">${prediction.homePct.toFixed(0)} %</div>
          </div>

          <div class="vs">vs</div>

          <div class="team">
<div class="name">
  <img src="${awayLogo}" class="team-logo" alt="${awayName}">
  <span>${awayName}</span>
</div>
            <div class="pct ${!homeFav ? "fav" : ""}">${prediction.awayPct.toFixed(0)} %</div>
          </div>
        </div>

        <div class="runs">
          Juoksuarvio: ${prediction.homeRuns.toFixed(1)} – ${prediction.awayRuns.toFixed(1)}
        </div>

<span class="pill ${tagClass}">${tag}</span>
<span class="pill blue">Total ${total.toFixed(1)}</span>
${prediction.lineupAdjusted ? `<span class="pill orange">Kokoonpanomuutos huomioitu</span>` : ""}
${weatherAdjustment !== 0
  ? `<span class="pill orange">Sääkorjaus ${weatherAdjustment.toFixed(1)}</span>`
  : ""}
<span class="pill orange">Kotiutuskisa ${shootoutPct} %</span>

<div class="weather">
  <b>⭐ Pelaajavoima</b><br>
  ${match.home.shorthand}: ${homePlayerPower.toFixed(1)}<br>
  ${match.away.shorthand}: ${awayPlayerPower.toFixed(1)}<br>
  Ero: ${playerPowerDiff > 0 ? "+" : ""}${playerPowerDiff.toFixed(1)}
</div>

${resultHtml(match, prediction)}
${(match.result || match.liveResult?.finished)
    ? ""
    : weatherHtml(weather)}
${keyPlayerAbsenceHtml(match, lineup, selectedSeries)}
${lineupHtml(lineup)}

       ${prediction.note ? `<div class="reason">${prediction.note}</div>` : ""}
      </div>
    `);
  }

 $(targetId).innerHTML = cards.join("");
}

async function load() {
  const selectedDate = $("date").value || today();
const playerStats = await fetchPlayerStats();
console.log("PELAAJAT LADATTU:", playerStats.players.length);
console.log("JOUKKUE TOP5:", playerStats.teams);

  $("status").textContent = "Ladataan Miesten ja Naisten Superpesis...";

  async function loadSeries(series, matchesTarget, powerTarget, cardClass, standingsTarget) {
    const level = "Superpesis";

    try {
      const res = await fetch(
        `/.netlify/functions/matches?level=${encodeURIComponent(level)}&series=${encodeURIComponent(series)}`
      );

      const json = await res.json();
      const matches = Array.isArray(json.data) ? json.data : [];
      console.log("OTTELUT:", series, matches.length);
      const stats = buildStats(matches);
      console.log("STATS OK:", series);
      const standings = buildStandings(matches);
      console.log("STANDINGS OK:", series, standings);
renderOfficialStandings(standings, standingsTarget);

      const dayMatches = matches.filter(
        m => (m.date || "").slice(0, 10) === selectedDate
      );

      renderPowerTable(stats, powerTarget);
      await renderMatches(dayMatches, stats, series, matchesTarget, cardClass, playerStats);

      return true;
    } catch (e) {
      console.error(`${series} haku epäonnistui`, e);
      $(matchesTarget).innerHTML = `<p>${series}: datan haku epäonnistui.</p>`;
      return false;
    }
  }

 const menOk = await loadSeries("Miehet", "matches-men", "power-men", "men", "standings-men");
 const womenOk = await loadSeries("Naiset", "matches-women", "power-women", "women", "standings-women");

  $("status").textContent =
    menOk || womenOk
      ? `Päivitetty ${new Date().toLocaleTimeString("fi-FI")}`
      : "Datan haku epäonnistui. Tarkista Netlify Functions.";
}


$("date").value = today();
$("btn").onclick = load;
$("date").onchange = load;

load();
