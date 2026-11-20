(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var DEMO = !CFG.SHEET_ID || /[?&]demo\b/.test(location.search);
  var PHASE_ORDER = ["b1", "b2", "finale"];

  // Colonnes des onglets Matchs_* (index 0 = colonne A)
  var M = { id: 0, group: 1, court: 2, time: 3, t1: 4, t2: 5, s1: 6, s2: 7, ref: 8, winner: 9, loser: 10, forfeit: 14 };
  // Colonnes des onglets Classement_*
  var S = { code: 0, group: 1, rank: 2, team: 3, pts: 4, j: 5, v: 6, d: 7, pw: 8, pl: 9, pd: 10, seed: 13 };

  var state = {
    data: null,
    lastOk: 0,
    loading: false,
    error: null,
    tab: "programme",
    fav: store("fav") || "",
  };
  // Lien direct vers une équipe : index.html?equipe=Nom%20de%20l%27équipe
  var teamParam = new URLSearchParams(location.search).get("equipe");
  if (teamParam) { state.fav = teamParam; store("fav", teamParam); }

  // ---------------------------------------------------------------- utils
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem("vls_" + key);
      if (val === null) localStorage.removeItem("vls_" + key);
      else localStorage.setItem("vls_" + key, val);
    } catch (e) { /* stockage indisponible : on ignore */ }
    return null;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function str(v) { return v == null ? "" : String(v).trim(); }
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    var n = Number(String(v).replace(",", ".").trim());
    return isNaN(n) ? null : n;
  }
  function minutes(t) {
    var m = /(\d{1,2})\D(\d{2})/.exec(str(t));
    return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
  }
  function plural(n, word) { return n + " " + word + (n > 1 ? "s" : ""); }

  // ---------------------------------------------------------------- data
  var seq = 0;
  function gviz(sheet, range) {
    return new Promise(function (resolve, reject) {
      var cb = "__vls" + (++seq);
      var s = document.createElement("script");
      var timer = setTimeout(function () { done(); reject(new Error("timeout")); }, 15000);
      function done() { clearTimeout(timer); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
      window[cb] = function (resp) {
        done();
        if (!resp || resp.status === "error") {
          var msg = resp && resp.errors && resp.errors[0] ? resp.errors[0].detailed_message || resp.errors[0].message : "réponse invalide";
          reject(new Error(sheet + " : " + msg));
          return;
        }
        resolve(tableToRows(resp.table));
      };
      s.onerror = function () { done(); reject(new Error("réseau")); };
      s.src = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(CFG.SHEET_ID) +
        "/gviz/tq?tqx=out:json;responseHandler:" + cb +
        "&headers=1&sheet=" + encodeURIComponent(sheet) +
        (range ? "&range=" + encodeURIComponent(range) : "") +
        "&_=" + Date.now();
      document.head.appendChild(s);
    });
  }
  function tableToRows(table) {
    var n = table.cols.length;
    return (table.rows || []).map(function (r) {
      var out = new Array(n);
      for (var i = 0; i < n; i++) {
        var c = r.c[i];
        out[i] = c == null ? null : (c.v != null ? c.v : (c.f != null ? c.f : null));
      }
      return out;
    });
  }
  function loadDemo() {
    return new Promise(function (resolve, reject) {
      if (window.DEMO_DATA) return resolve(window.DEMO_DATA);
      var s = document.createElement("script");
      s.src = "demo/data.js";
      s.onload = function () { resolve(window.DEMO_DATA); };
      s.onerror = function () { reject(new Error("demo/data.js introuvable")); };
      document.head.appendChild(s);
    });
  }
  function fetchAll() {
    if (DEMO) return loadDemo();
    var sh = CFG.SHEETS;
    return Promise.all([
      gviz(sh.config, "A1:B3"),
      gviz(sh.b1, "A:O"),
      gviz(sh.b2, "A:O"),
      gviz(sh.finale, "A:O"),
      gviz(sh.c1, "A:N"),
      gviz(sh.c2, "A:N"),
    ]).then(function (r) {
      return { config: r[0], b1: r[1], b2: r[2], finale: r[3], c1: r[4], c2: r[5] };
    });
  }

  // Un match = un seul set, sans score cible imposé. Pas de score en direct :
  // un match est joué dès que ses deux scores (finaux) sont saisis, ou qu'un forfait est déclaré.
  function parseMatches(rows, phase) {
    return rows.filter(function (r) { return r && str(r[M.id]) && (str(r[M.t1]) || str(r[M.t2])); })
      .map(function (r, i) {
        var a = num(r[M.s1]), b = num(r[M.s2]);
        var f = str(r[M.forfeit]);
        var forfeit = /1/.test(f) ? 1 : /2/.test(f) ? 2 : 0; // équipe déclarée forfait
        var scored = a !== null && b !== null;
        var played = scored || forfeit > 0;
        return {
          forfeit: forfeit,
          phase: phase,
          order: i,
          id: str(r[M.id]),
          group: str(r[M.group]),
          court: str(r[M.court]),
          time: str(r[M.time]),
          t1: str(r[M.t1]),
          t2: str(r[M.t2]),
          s1: scored && !forfeit ? a : null,
          s2: scored && !forfeit ? b : null,
          ref: str(r[M.ref]),
          status: played ? "done" : "todo",
          winner: played ? str(r[M.winner]) : "",
          sortKey: PHASE_ORDER.indexOf(phase) * 10000 + minutes(r[M.time]),
        };
      });
  }
  function parseStandings(rows) {
    return rows.filter(function (r) { return r && str(r[S.team]) && str(r[S.group]); })
      .map(function (r) {
        return {
          code: str(r[S.code]), group: str(r[S.group]), rank: num(r[S.rank]) || 0, team: str(r[S.team]),
          pts: num(r[S.pts]) || 0, j: num(r[S.j]) || 0, v: num(r[S.v]) || 0, d: num(r[S.d]) || 0,
          pw: num(r[S.pw]) || 0, pl: num(r[S.pl]) || 0, pd: num(r[S.pd]) || 0,
          seed: num(r[S.seed]),
        };
      })
      .sort(function (a, b) { return a.group < b.group ? -1 : a.group > b.group ? 1 : a.rank - b.rank; });
  }
  function model(raw) {
    var cfg = {};
    (raw.config || []).forEach(function (r) { if (r && str(r[0])) cfg[str(r[0])] = str(r[1]); });
    var matches = {
      b1: parseMatches(raw.b1 || [], "b1"),
      b2: parseMatches(raw.b2 || [], "b2"),
      finale: parseMatches(raw.finale || [], "finale"),
    };
    var standings = { b1: parseStandings(raw.c1 || []), b2: parseStandings(raw.c2 || []) };
    var teams = {};
    standings.b1.forEach(function (s) { teams[s.team] = true; });
    standings.b2.forEach(function (s) { if (!teams[s.team] && !standings.b1.length) teams[s.team] = true; });
    return {
      title: cfg["Nom du tournoi"] || "Volley Live Score",
      message: cfg["Message d'info"] || "",
      matches: matches,
      all: matches.b1.concat(matches.b2, matches.finale),
      standings: standings,
      teams: Object.keys(teams).sort(function (a, b) { return a.localeCompare(b, "fr"); }),
      teamSet: teams,
    };
  }

  // ---------------------------------------------------------------- render helpers
  function teamName(name, d) {
    var known = d.teamSet[name];
    return '<span class="name' + (known ? "" : " placeholder") + '" title="' + esc(name) + '">' + esc(name || "À définir") + "</span>";
  }
  function phaseLabel(m) {
    var p = CFG.PHASES[m.phase] || m.phase;
    if (m.phase === "finale") return m.group || p;
    return p + " · Poule " + m.group;
  }
  function matchCard(m, d, opts) {
    opts = opts || {};
    var isFav = state.fav && (m.t1 === state.fav || m.t2 === state.fav || m.ref === state.fav);
    var cls = "match" + (isFav && !opts.noFav ? " fav" : "");
    var badge = m.status === "done" ? '<span class="badge done">Terminé</span>'
      : '<span class="badge">' + esc(m.time || "À venir") + "</span>";
    var meta = [];
    if (!opts.noPhase) meta.push(esc(phaseLabel(m)));
    if (m.court) meta.push("Terrain " + esc(m.court));
    if (m.time && m.status !== "todo") meta.push(esc(m.time));
    var winner1 = m.status === "done" && m.winner && m.winner === m.t1;
    var winner2 = m.status === "done" && m.winner && m.winner === m.t2;
    function row(side, name, won, score) {
      var scoreHtml = m.forfeit === side ? '<span class="forfeit">Forfait</span>'
        : m.status === "todo" || score === null ? "" : String(score);
      return '<div class="team' + (won ? " winner" : "") + '">' + teamName(name, d) +
        '<div class="score">' + scoreHtml + "</div></div>";
    }
    var refHtml = m.ref ? '<div class="ref">Arbitre : ' + teamName(m.ref, d) + "</div>" : "";
    return '<div class="' + cls + '"><div class="match-head"><span class="meta">' + meta.join(" · ") + "</span>" + badge + "</div>" +
      row(1, m.t1, winner1, m.s1) + row(2, m.t2, winner2, m.s2) + refHtml + "</div>";
  }
  // qualified : true pour marquer en vert les équipes qualifiées (celles qui ont une tête de série)
  function standingsTable(rows, qualified) {
    var head = '<thead><tr><th class="rank">#</th><th class="team-cell">Équipe</th><th>Pts</th><th>J</th><th>V</th>' +
      '<th class="opt">D</th><th class="opt" title="Points marqués">Marq.</th><th title="Différence de points">±Pts</th></tr></thead>';
    var body = rows.map(function (r) {
      var cls = (r.team === state.fav ? "fav " : "") + (qualified && r.seed ? "q" : "");
      function sign(n) { return n > 0 ? "+" + n : String(n); }
      return '<tr class="' + cls + '"><td class="rank">' + r.rank + '</td><td class="team-cell" title="' + esc(r.team) + '">' + esc(r.team) +
        '</td><td class="pts">' + r.pts + "</td><td>" + r.j + "</td><td>" + r.v + '</td><td class="opt">' + r.d +
        '</td><td class="opt">' + r.pw + "</td><td>" + sign(r.pd) + "</td></tr>";
    }).join("");
    return '<table class="standings">' + head + "<tbody>" + body + "</tbody></table>";
  }
  function groupBy(list, key) {
    var out = {}, order = [];
    list.forEach(function (x) { var k = x[key]; if (!out[k]) { out[k] = []; order.push(k); } out[k].push(x); });
    return order.map(function (k) { return { key: k, items: out[k] }; });
  }

  // ---------------------------------------------------------------- views
  // Accueil : sur chaque terrain, le prochain match non joué puis le suivant (ordre des lignes du Sheet),
  // puis les derniers résultats. Les heures ne sont pas nécessaires.
  function viewProgramme(d) {
    var todo = d.all.filter(function (m) { return m.status === "todo"; })
      .sort(function (a, b) { return a.sortKey - b.sortKey || a.order - b.order; });
    var perCourt = {};
    todo.forEach(function (m) { (perCourt[m.court || "?"] = perCourt[m.court || "?"] || []).push(m); });
    var courts = Object.keys(perCourt).sort(function (a, b) { return (num(a) || 99) - (num(b) || 99); });
    var now = courts.map(function (c) { return perCourt[c][0]; });
    var next = courts.map(function (c) { return perCourt[c][1]; }).filter(Boolean);
    var done = d.all.filter(function (m) { return m.status === "done"; });
    var recent = done.slice(-6).reverse();

    function grid(list) { return '<div class="grid">' + list.map(function (m) { return matchCard(m, d); }).join("") + "</div>"; }
    var html = "<h2>Prochains matchs</h2>";
    html += now.length ? grid(now) : '<p class="empty">Plus aucun match prévu.</p>';
    if (next.length) html += "<h2>Ensuite</h2>" + grid(next);
    html += "<h2>Derniers résultats</h2>";
    html += recent.length ? grid(recent)
      : '<p class="empty">Pas encore de résultat.</p>';
    return html;
  }

  function viewPools(d, phase) {
    var st = d.standings[phase];
    var matches = d.matches[phase];
    if (!st.length && !matches.length) return '<p class="empty">Pas encore de données pour cette phase.</p>';
    var byGroup = {};
    matches.forEach(function (m) { (byGroup[m.group] = byGroup[m.group] || []).push(m); });
    var groups = groupBy(st, "group");
    var hint = phase === "b1"
      ? "Le classement de chaque poule détermine la composition des poules du brassage 2."
      : "Les 2 premiers de chaque poule et les 2 meilleurs 3es (en vert) se qualifient pour les quarts de finale.";
    var html = '<p class="hint" style="margin-top:16px">' + hint + "</p>";
    html += '<div class="pools">' + groups.map(function (g) {
      var ms = (byGroup[g.key] || []).slice().sort(function (a, b) { return a.sortKey - b.sortKey || a.order - b.order; });
      var played = ms.filter(function (m) { return m.status === "done"; }).length;
      var open = g.items.some(function (r) { return r.team === state.fav; });
      return '<section class="pool"><h3>Poule ' + esc(g.key) + "</h3>" +
        standingsTable(g.items, phase === "b2") +
        '<details class="pool-matches"' + (open ? " open" : "") + "><summary>Matchs · " + played + "/" + ms.length + " joués" +
        '</summary><div class="list">' +
        ms.map(function (m) { return matchCard(m, d, { noPhase: true }); }).join("") + "</div></details></section>";
    }).join("") + "</div>";
    return html;
  }

  function viewFinale(d) {
    var ms = d.matches.finale;
    if (!ms.length) return '<p class="empty">Le tableau final n\'est pas encore disponible.</p>';
    var byId = {};
    ms.forEach(function (m) { byId[m.id.toUpperCase()] = m; });
    var rounds = [
      { title: "Quarts de finale", ids: ["QF1", "QF2", "QF3", "QF4"] },
      { title: "Demi-finales", ids: ["SF1", "SF2"] },
      { title: "Finale", ids: ["F"] },
    ];
    var used = {};
    var html = '<div class="bracket" style="margin-top:16px">' + rounds.map(function (r) {
      var cards = r.ids.filter(function (id) { return byId[id]; }).map(function (id) {
        used[id] = true;
        return matchCard(byId[id], d, { noPhase: true });
      });
      if (!cards.length) return "";
      return '<div class="round"><h3>' + r.title + '</h3><div class="slots">' + cards.join("") + "</div></div>";
    }).join("") + "</div>";
    var extra = ms.filter(function (m) { return !used[m.id.toUpperCase()]; });
    if (extra.length) {
      html += '<div class="final-extra">' + groupBy(extra, "group").map(function (g) {
        return "<h2>" + esc(g.key || "Autres matchs") + '</h2><div class="grid">' +
          g.items.map(function (m) { return matchCard(m, d, { noPhase: true }); }).join("") + "</div>";
      }).join("") + "</div>";
    }
    return html;
  }

  function viewTeam(d) {
    var opts = '<option value="">Choisir une équipe…</option>' + d.teams.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === state.fav ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("");
    var html = '<div class="picker"><label for="team-select">Mon équipe :</label><select id="team-select">' + opts + "</select></div>";
    html += '<p class="hint" style="margin-top:6px">Votre équipe est mise en avant sur toutes les pages (mémorisé sur cet appareil).</p>';
    if (!state.fav) return html;
    var t = state.fav;
    var ranks = [];
    [["b1", "Brassage 1"], ["b2", "Brassage 2"]].forEach(function (p) {
      var r = d.standings[p[0]].filter(function (x) { return x.team === t; })[0];
      if (r && r.j > 0) ranks.push('<span class="chip">' + p[1] + " : <b>" + r.rank + (r.rank === 1 ? "er" : "e") + "</b> poule " + esc(r.group) + " · " + r.pts + " pts</span>");
    });
    var mine = d.all.filter(function (m) { return m.t1 === t || m.t2 === t; })
      .sort(function (a, b) { return a.sortKey - b.sortKey || a.order - b.order; });
    var wins = mine.filter(function (m) { return m.status === "done" && m.winner === t; }).length;
    var losses = mine.filter(function (m) { return m.status === "done" && m.winner && m.winner !== t; }).length;
    html += '<div class="summary"><span class="chip">Victoires <b>' + wins + '</b></span><span class="chip">Défaites <b>' + losses + "</b></span>" + ranks.join("") + "</div>";
    var next = mine.filter(function (m) { return m.status !== "done"; });
    var past = mine.filter(function (m) { return m.status === "done"; });
    html += "<h2>Prochains matchs</h2>" + (next.length ? '<div class="grid">' + next.map(function (m) { return matchCard(m, d, { noFav: true }); }).join("") + "</div>"
      : '<p class="empty">Aucun match prévu pour le moment.</p>');
    var refs = d.all.filter(function (m) { return m.ref === t && m.status !== "done"; })
      .sort(function (a, b) { return a.sortKey - b.sortKey || a.order - b.order; });
    html += "<h2>À arbitrer</h2>" + (refs.length ? '<div class="grid">' + refs.map(function (m) { return matchCard(m, d, { noFav: true }); }).join("") + "</div>"
      : '<p class="empty">Aucun arbitrage prévu pour le moment.</p>');
    html += "<h2>Matchs joués</h2>" + (past.length ? '<div class="grid">' + past.map(function (m) { return matchCard(m, d, { noFav: true }); }).join("") + "</div>"
      : '<p class="empty">Aucun match joué.</p>');
    return html;
  }

  // Règlement : texte fixe, repris du document « composition des poules et de l'arbre ».
  function viewRules() {
    function box(name, sub, main) {
      return '<div class="match rule-box' + (main ? " main" : "") + '"><b>' + name + '</b><span>' + sub + "</span></div>";
    }
    return '<div class="rules">' +
      "<h2>Le format en bref</h2>" +
      "<p>12 équipes, 3 terrains, une poule de 4 par terrain. Tous les matchs se jouent en un seul set en 21 (2 points d'écart).</p>" +
      "<ol>" +
      "<li><b>Brassage 1</b> : poules A, B et C. Chaque équipe rencontre les 3 autres de sa poule.</li>" +
      "<li><b>Brassage 2</b> : nouvelles poules D, E et F, composées à partir du classement du brassage 1. Chaque équipe rencontre à nouveau les 3 autres de sa poule.</li>" +
      "<li><b>Phase finale</b> : les 8 équipes qualifiées à l'issue du brassage 2 jouent des quarts, des demi-finales, une petite finale et une finale.</li>" +
      "</ol>" +
      "<p>Pendant chaque match de poule, une des deux équipes libres de la poule arbitre.</p>" +

      "<h2>Le classement d'une poule</h2>" +
      "<p>Une victoire rapporte 3 points, une défaite 0. En cas d'égalité, on départage dans cet ordre :</p>" +
      "<ol><li>les points de classement ;</li><li>le goal average (points marqués moins points encaissés) ;</li><li>le nombre total de points marqués.</li></ol>" +

      "<h2>Les poules du brassage 2</h2>" +
      '<div class="table-wrap"><table class="rules-table"><thead><tr><th>Poule D (terrain 1)</th><th>Poule E (terrain 2)</th><th>Poule F (terrain 3)</th></tr></thead><tbody>' +
      "<tr><td>1er poule A</td><td>1er poule B</td><td>1er poule C</td></tr>" +
      "<tr><td>2e poule C</td><td>2e poule A</td><td>2e poule B</td></tr>" +
      "<tr><td>3e poule B</td><td>3e poule C</td><td>3e poule A</td></tr>" +
      "<tr><td>4e poule A</td><td>4e poule B</td><td>4e poule C</td></tr>" +
      "</tbody></table></div>" +

      "<h2>Qui se qualifie pour la phase finale</h2>" +
      "<p>8 équipes sur 12 se qualifient :</p>" +
      "<ul><li>les 2 premiers de chaque poule du brassage 2 ;</li>" +
      "<li>les 2 meilleurs 3es, départagés sur le cumul des 2 brassages : points, puis goal average, puis points marqués.</li></ul>" +
      "<p>Les 8 qualifiés reçoivent un numéro de tête de série, de 1 (le meilleur) à 8 :</p>" +
      '<div class="table-wrap"><table class="rules-table"><thead><tr><th>Têtes de série</th><th>Qui</th><th>Comment on les classe entre eux</th></tr></thead><tbody>' +
      "<tr><td>1, 2, 3</td><td>Les trois 1ers de poule</td><td>Points cumulés des 2 brassages, puis goal average cumulé, puis points marqués cumulés</td></tr>" +
      "<tr><td>4, 5, 6</td><td>Les trois 2es de poule</td><td>Idem</td></tr>" +
      "<tr><td>7, 8</td><td>Les deux meilleurs 3es</td><td>Idem</td></tr>" +
      "</tbody></table></div>" +
      "<p>Le cumul ne sert qu'à classer entre elles des équipes de même rang : un 1er de poule passe toujours devant un 2e, et un 4e est éliminé quel que soit son total.</p>" +

      "<h2>L'arbre final</h2>" +
      '<p class="hint">Les têtes de série 1 et 2 ne peuvent se croiser qu\'en finale.</p>' +
      '<div class="bracket">' +
      '<div class="round"><h3>Quarts de finale</h3><div class="slots">' +
      box("Quart 1", "Tête de série 1 contre 8") + box("Quart 2", "Tête de série 4 contre 5") +
      box("Quart 3", "Tête de série 2 contre 7") + box("Quart 4", "Tête de série 3 contre 6") + "</div></div>" +
      '<div class="round"><h3>Demi-finales</h3><div class="slots">' +
      box("Demi-finale 1", "Vainqueurs des quarts 1 et 2") + box("Demi-finale 2", "Vainqueurs des quarts 3 et 4") + "</div></div>" +
      '<div class="round"><h3>Finales</h3><div class="slots">' +
      box("Finale", "Vainqueurs des deux demies", true) + box("Petite finale (3e place)", "Perdants des deux demies") + "</div></div>" +
      "</div></div>";
  }

  // ---------------------------------------------------------------- app
  var app = document.getElementById("app");

  function render() {
    document.querySelectorAll("#tabs a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-tab") === state.tab);
    });
    if (state.tab === "regles") {
      app.innerHTML = viewRules();
      app.setAttribute("data-tab", state.tab);
      return;
    }
    var d = state.data;
    if (!d) {
      if (state.error) app.innerHTML = '<p class="empty">Impossible de charger les résultats.</p>';
      return;
    }
    document.getElementById("title").textContent = d.title;
    document.title = d.title + " · Résultats";
    var banner = document.getElementById("banner");
    banner.hidden = !d.message;
    banner.textContent = d.message;

    var html;
    if (state.tab === "b1") html = viewPools(d, "b1");
    else if (state.tab === "b2") html = viewPools(d, "b2");
    else if (state.tab === "finale") html = viewFinale(d);
    else if (state.tab === "equipe") html = viewTeam(d);
    else html = viewProgramme(d);

    // conserve l'état ouvert/fermé des listes de matchs entre deux rafraîchissements
    var openState = {};
    app.querySelectorAll("details.pool-matches").forEach(function (el, i) { openState[i] = el.open; });
    var sameTab = app.getAttribute("data-tab") === state.tab;
    app.innerHTML = html;
    app.setAttribute("data-tab", state.tab);
    if (sameTab) app.querySelectorAll("details.pool-matches").forEach(function (el, i) { if (i in openState) el.open = openState[i]; });

    var sel = document.getElementById("team-select");
    if (sel) sel.addEventListener("change", function () {
      state.fav = sel.value;
      store("fav", sel.value || null);
      render();
    });
  }

  function renderSync() {
    var dot = document.getElementById("sync-dot");
    var txt = document.getElementById("sync-text");
    if (DEMO) { dot.className = "dot ok"; txt.textContent = "Mode démo"; return; }
    if (state.loading && !state.lastOk) { dot.className = "dot"; txt.textContent = "Chargement…"; return; }
    if (!state.lastOk) { dot.className = "dot err"; txt.textContent = "Hors ligne"; return; }
    var s = Math.round((Date.now() - state.lastOk) / 1000);
    dot.className = "dot " + (state.error ? "err" : "ok");
    txt.textContent = s < 10 ? "À jour" : s < 60 ? "Il y a " + s + " s" : "Il y a " + Math.floor(s / 60) + " min";
  }

  function showError() {
    var el = document.getElementById("error");
    if (!state.error) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = state.data
      ? "Connexion perdue : les derniers résultats connus sont affichés. Nouvel essai automatique."
      : "Impossible de lire le Google Sheet (" + state.error + "). Vérifiez qu'il est partagé en lecture avec « toute personne disposant du lien ».";
  }

  function refresh() {
    if (state.loading) return;
    state.loading = true;
    renderSync();
    fetchAll().then(function (raw) {
      state.data = model(raw);
      state.lastOk = Date.now();
      state.error = null;
    }).catch(function (e) {
      state.error = e && e.message ? e.message : String(e);
      if (window.console) console.warn("Volley Live Score :", e);
    }).then(function () {
      state.loading = false;
      showError();
      renderSync();
      render();
    });
  }

  function route() {
    var t = (location.hash || "#programme").slice(1);
    state.tab = ["programme", "b1", "b2", "finale", "equipe", "regles"].indexOf(t) >= 0 ? t : "programme";
    render();
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);
  document.getElementById("refresh").addEventListener("click", refresh);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && Date.now() - state.lastOk > 10000) refresh();
  });
  setInterval(function () { if (!document.hidden) refresh(); }, Math.max(10, CFG.REFRESH_SECONDS || 30) * 1000);
  setInterval(renderSync, 5000);

  route();
  refresh();
})();
