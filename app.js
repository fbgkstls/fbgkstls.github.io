(function () {
  "use strict";
  var CONTENT = window.CONTENT || {};
  var view = document.getElementById("view");
  var titleEl = document.getElementById("title");
  var btnBack = document.getElementById("btnBack");
  var btnStar = document.getElementById("btnStar");
  var APP_TITLE = "성공회 사목예식서";

  // ---------- storage (safe) ----------
  function load(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var prefs = load("prefs", { fs: 0.9, dark: null, wake: true });
  // 기본 글자 크기를 100% → 90% 로 낮춤 (직접 바꾸지 않은 사용자에게만 적용)
  if (!prefs.fs2) { if (prefs.fs === 1) prefs.fs = 0.9; prefs.fs2 = 1; save("prefs", prefs); }
  var stars = load("stars", []);
  var recent = load("recent", []);

  // ---------- titles from menu ----------
  var TITLES = {};
  (function walk(items, parent) {
    items.forEach(function (m) {
      if (!TITLES[m[1]]) TITLES[m[1]] = m[0];
      if (m[2]) walk(m[2], m[0]);
    });
  })(window.MENU);
  window.HOME_TILES.forEach(function (t) { if (!TITLES[t[1]]) TITLES[t[1]] = t[0]; });
  function titleOf(id) { return TITLES[id] || (CONTENT[id] && CONTENT[id].t) || "기도문"; }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- theme / font ----------
  function applyPrefs() {
    var dark = prefs.dark == null ? (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) : prefs.dark;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.setProperty("--fs", prefs.fs);
    document.getElementById("fontVal").textContent = Math.round(prefs.fs * 100) + "%";
    document.getElementById("optDark").checked = !!dark;
    document.getElementById("optWake").checked = !!prefs.wake;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#2b1d3b" : "#4b2a6b";
  }
  document.getElementById("btnFont").onclick = function () {
    var p = document.getElementById("fontPanel"); p.hidden = !p.hidden;
  };
  document.querySelectorAll("[data-font]").forEach(function (b) {
    b.onclick = function () {
      prefs.fs = Math.min(2, Math.max(0.8, Math.round((prefs.fs + 0.1 * +b.dataset.font) * 10) / 10));
      save("prefs", prefs); applyPrefs();
    };
  });
  document.getElementById("optDark").onchange = function (e) { prefs.dark = e.target.checked; save("prefs", prefs); applyPrefs(); };
  document.getElementById("optWake").onchange = function (e) { prefs.wake = e.target.checked; save("prefs", prefs); wake(); };

  // ---------- screen wake lock (reading prayers during services) ----------
  var lock = null, reading = false;
  function wake() {
    var want = prefs.wake && reading && document.visibilityState === "visible";
    if (want && !lock && navigator.wakeLock) {
      navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }).catch(function () {});
    } else if (!want && lock) { lock.release(); lock = null; }
  }
  document.addEventListener("visibilitychange", wake);

  // ---------- sanitizer for imported page HTML ----------
  var ALLOWED = { P:1, BR:1, STRONG:1, B:1, EM:1, I:1, U:1, SPAN:1, DIV:1, HR:1, UL:1, OL:1, LI:1, TABLE:1, TBODY:1, THEAD:1, TR:1, TD:1, TH:1, SUB:1, SUP:1, A:1, FONT:1 };
  function colorClass(style) {
    var m = /color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(style || "");
    if (!m) return "";
    var r = +m[1], g = +m[2], b = +m[3], max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40) return ""; // greys / black → default text colour
    return r > b && r > g ? "c-red" : "c-blue";
  }
  function clean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1 || !ALLOWED[n.tagName]) { if (n.nodeType === 1 && !/^(SCRIPT|STYLE|IFRAME|OBJECT|IMG|SVG)$/.test(n.tagName)) { clean(n); while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); } n.parentNode.removeChild(n); return; }
      var style = n.getAttribute("style") || "";
      var keep = {};
      if (n.tagName === "A" && n.classList.contains("go")) { keep["class"] = "go"; keep["data-id"] = n.getAttribute("data-id"); keep.href = "#/p/" + n.getAttribute("data-id"); }
      if (n.tagName === "DIV" && n.classList.contains("tx")) keep["class"] = "tx";
      var cc = colorClass(style); if (cc) keep["class"] = (keep["class"] ? keep["class"] + " " : "") + cc;
      Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
      Object.keys(keep).forEach(function (k) { n.setAttribute(k, keep[k]); });
      if (n.tagName === "A" && !keep.href) { var s = document.createElement("span"); while (n.firstChild) s.appendChild(n.firstChild); n.parentNode.replaceChild(s, n); clean(s); return; }
      clean(n);
    });
  }
  function renderPageHtml(raw) {
    var tpl = document.createElement("template");
    tpl.innerHTML = raw;
    // headings: text blocks set in large type on the website
    Array.prototype.forEach.call(tpl.content.querySelectorAll(".tx"), function (tx) {
      var big = /font-size:\s*(\d+)px/i.exec(tx.innerHTML);
      var txt = tx.textContent.trim();
      if (big && +big[1] >= 20 && txt.length < 80) { tx.setAttribute("data-hd", "1"); }
    });
    var hds = Array.prototype.map.call(tpl.content.querySelectorAll(".tx"), function (tx) { return tx.getAttribute("data-hd") === "1"; });
    clean(tpl.content);
    Array.prototype.forEach.call(tpl.content.querySelectorAll(".tx"), function (tx, i) { if (hds[i]) tx.classList.add("hd"); });
    var wrap = document.createElement("div"); wrap.appendChild(tpl.content); return wrap.innerHTML;
  }

  // ---------- helpers ----------
  function setTop(title, back, starId) {
    titleEl.textContent = title;
    document.title = title === APP_TITLE ? APP_TITLE : title + " · " + APP_TITLE;
    btnBack.hidden = !back;
    document.getElementById("emblem").hidden = !!back;
    btnStar.hidden = !starId;
    btnStar.dataset.id = starId || "";
    btnStar.classList.toggle("on", !!starId && stars.indexOf(starId) >= 0);
  }
  function setTab(t) { document.querySelectorAll(".tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === t); }); }
  btnBack.onclick = function () { if (history.length > 1) history.back(); else location.hash = "#/home"; };
  btnStar.onclick = function () {
    var id = btnStar.dataset.id; if (!id) return;
    var i = stars.indexOf(id); if (i >= 0) stars.splice(i, 1); else stars.unshift(id);
    save("stars", stars); btnStar.classList.toggle("on", i < 0);
  };
  function link(id, label, sub) { return '<li><a href="#/p/' + id + '">' + esc(label || titleOf(id)) + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</a></li>"; }
  function ext(url, label, sub) { return '<a class="ext" href="' + esc(url) + '" target="_blank" rel="noopener"><b>' + esc(label) + '</b><span>' + esc(sub || "열기 ↗") + "</span></a>"; }

  // ---------- views ----------
  function todayCard() {
    var d = new Date(), day = d.getDate();
    var idx = Math.min(day, 30) - 1, p = window.DAILY_PSALMS[idx];
    var wd = "일월화수목금토"[d.getDay()];
    return '<section class="card today"><h2>오늘의 시편 (30일 주기)</h2>' +
      '<div class="date">' + (d.getMonth() + 1) + "월 " + day + "일 (" + wd + ")</div>" +
      '<div class="row"><a href="#/p/' + p[0] + '">' + (idx + 1) + '일 아침시편</a><a href="#/p/' + p[1] + '">' + (idx + 1) + "일 저녁시편</a></div>" +
      (day === 31 ? "<small>31일은 30일 시편을 사용합니다.</small>" : "") + "</section>";
  }
  // ---------- 시간에 맞춘 오늘의 시편 ----------
  // 아침 05:00~10:00 · 저녁 17:00~20:00 · 밤 20:00~24:00
  var OFFICES = [
    { k: "am", name: "아침기도", time: "05:00~10:00", from: 5, to: 10, id: "e0zknxc7" },
    { k: "pm", name: "저녁기도", time: "17:00~20:00", from: 17, to: 20, id: "8sj64e4b" },
    { k: "night", name: "밤기도", time: "20:00~24:00", from: 20, to: 24, id: "1xbbkkrc" }
  ];
  // '지금' 표시: 실제 기도 시간 안일 때
  function officeIn() {
    var hr = new Date().getHours();
    for (var i = 0; i < OFFICES.length; i++) if (hr >= OFFICES[i].from && hr < OFFICES[i].to) return i;
    return -1;
  }
  // 펼쳐 보여 줄 기도: 다음 기도는 시작 1시간 전부터
  // 04:00~15:59 아침기도 · 16:00~19:59 저녁기도 · 20:00~03:59 밤기도
  function officeNow() {
    var hr = new Date().getHours();
    return hr >= 4 && hr < 16 ? 0 : hr >= 16 && hr < 20 ? 1 : 2;
  }
  // 낮기도·밤기도 페이지에서 '아래 시편 중 …' 부분만 잘라 냄
  function officePsalms(id) {
    var c = CONTENT[id]; if (!c || !c.h) return "";
    var d = document.createElement("template"); d.innerHTML = c.h; d = d.content;
    var on = false, keep = [];
    Array.prototype.forEach.call(d.querySelectorAll(".tx"), function (tx) {
      var t = tx.textContent.replace(/\s+/g, " ").trim();
      if (!on && /시편 중/.test(t)) { on = true; return; }
      if (on && /^\d+\.\s/.test(t)) on = false;
      if (on && !/^아래 버튼으로/.test(t)) keep.push(tx.outerHTML);
    });
    return keep.length ? renderPageHtml(keep.join("")) : "";
  }
  function officeCard(i) {
    var o = OFFICES[i], now = officeIn(), d = new Date(), day = d.getDate();
    var idx = Math.min(day, 30) - 1, p = window.DAILY_PSALMS[idx], wd = "일월화수목금토"[d.getDay()];
    var pid = o.k === "am" ? p[0] : o.k === "pm" ? p[1] : null;
    var body = pid ? (CONTENT[pid] && CONTENT[pid].h ? renderPageHtml(CONTENT[pid].h) : "") : officePsalms(o.id);
    var sub = pid ? (idx + 1) + "일 " + (o.k === "am" ? "아침" : "저녁") + "시편 (30일 주기)" : o.name + " 시편 (한두 편을 낭송)";
    return '<section class="card office" id="officeCard">' +
      '<div class="office-tabs">' + OFFICES.map(function (x, j) {
        return '<button type="button" data-of="' + j + '" class="' + (j === i ? "on" : "") + '">' + x.name + (j === now ? "<i>지금</i>" : now < 0 && j === officeNow() && (new Date().getHours() + 1) % 24 === x.from ? "<i>곧</i>" : "") + "</button>";
      }).join("") + "</div>" +
      '<div class="office-head"><div><div class="lect-date">' + (d.getMonth() + 1) + "월 " + day + "일 (" + wd + ")</div>" +
      '<h2 class="office-title">오늘의 시편 · ' + esc(o.name) + "</h2><small>" + esc(sub) + "</small></div>" +
      '<a class="btn pri" href="#/p/' + o.id + '">' + esc(o.name) + " 순서 ›</a></div>" +
      '<article class="reader office-body">' + (body || '<p class="note">시편 내용을 찾지 못했습니다.</p>') + "</article>" +
      (day === 31 && pid ? "<small>31일은 30일 시편을 사용합니다.</small>" : "") +
      (pid ? '<a class="hero-link" style="margin:8px 0 0;text-align:center" href="#/p/' + pid + '">이 시편 크게 보기 ›</a>' : "") + "</section>";
  }
  function bindOffice() {
    var c = document.getElementById("officeCard"); if (!c) return;
    c.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-of]"); if (!b) return;
      var n = document.createElement("div"); n.innerHTML = officeCard(+b.dataset.of); c.replaceWith(n.firstChild); bindOffice();
    });
  }
  // ---------- 바로가기(홈 화면 설치) 안내 ----------
  var installEvt = null;
  var UA = navigator.userAgent || "";
  var IS_STANDALONE = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true || document.referrer.indexOf("android-app://") === 0;
  var IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var IS_KAKAO = /KAKAOTALK/i.test(UA), IS_INAPP = IS_KAKAO || /NAVER|Instagram|FBAN|FBAV|Line\//i.test(UA);
  var IS_SAMSUNG = /SamsungBrowser/i.test(UA), IS_ANDROID = /Android/i.test(UA);
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); installEvt = e;
    var b = document.getElementById("btnInstall"); if (b) b.hidden = false;
  });
  window.addEventListener("appinstalled", function () {
    installEvt = null; prefs.installed = true; save("prefs", prefs);
    var c = document.getElementById("installCard"); if (c) c.remove();
  });
  function installGuide() {
    if (IS_INAPP) return (IS_IOS ? "지금은 앱 안의 브라우저로 열려 있습니다. 아래 버튼을 누르거나 오른쪽 아래 메뉴에서 <b>'Safari로 열기'</b>를 고른 뒤, Safari에서 다시 안내를 따라 주세요."
      : "지금은 앱 안의 브라우저로 열려 있습니다. 아래 버튼을 눌러 <b>Chrome</b>(또는 삼성 인터넷)으로 연 뒤, 다시 안내를 따라 주세요.");
    if (IS_IOS) return "① 화면 아래(또는 위)의 <b>공유 버튼 <span aria-hidden=\"true\">⎋</span>(네모에 위쪽 화살표)</b>을 누릅니다.<br>② 목록에서 <b>'홈 화면에 추가'</b>를 누릅니다.<br>③ 오른쪽 위 <b>'추가'</b>를 누르면 홈 화면에 아이콘이 생깁니다.";
    if (IS_SAMSUNG) return "아래 버튼을 누르거나, 화면 아래 <b>메뉴(≡) → '현재 페이지 추가' → '홈 화면'</b>을 누르면 휴대폰 바탕화면에 아이콘이 생깁니다.";
    if (IS_ANDROID) return "아래 <b>'바로가기 만들기'</b> 버튼을 누르고 <b>'설치'</b>를 고르면 휴대폰 바탕화면에 아이콘이 생깁니다.<br>버튼이 없으면 오른쪽 위 <b>메뉴(⋮) → '홈 화면에 추가'</b>(또는 '앱 설치')를 누르세요.";
    return "아래 <b>'바로가기 만들기'</b> 버튼을 누르고 <b>'설치'</b>를 고르면 바탕화면과 시작 메뉴에 아이콘이 생깁니다.<br>버튼이 없으면 Chrome·Edge 주소창 오른쪽의 <b>설치 아이콘(⊕)</b>을 누르세요.";
  }
  function installCard() {
    if (IS_STANDALONE || prefs.installed || prefs.hideInstall) return "";
    var out = IS_INAPP ? (IS_KAKAO ? "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href)
      : IS_ANDROID ? "intent://" + location.href.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end" : "") : "";
    return '<section class="card install" id="installCard"><h2>📲 바탕화면에 바로가기 만들기</h2>' +
      '<p style="margin:0 0 8px">한 번만 해 두면 다음부터는 링크를 찾을 필요 없이 <b>아이콘을 눌러 바로</b> 열 수 있습니다. 인터넷이 없어도 기도서를 볼 수 있습니다.</p>' +
      '<p class="guide">' + installGuide() + "</p>" +
      '<div class="btns">' +
      (out ? '<a class="btn pri" href="' + esc(out) + '">' + (IS_IOS ? "Safari로 열기" : "Chrome으로 열기") + "</a>" : "") +
      (!IS_INAPP && !IS_IOS ? '<button class="btn pri" id="btnInstall" type="button"' + (installEvt ? "" : " hidden") + ">바로가기 만들기</button>" : "") +
      '<button class="btn" id="btnInstallHide" type="button">다시 보지 않기</button></div></section>';
  }
  function bindInstall() {
    var b = document.getElementById("btnInstall");
    if (b) b.addEventListener("click", function () {
      if (!installEvt) return;
      installEvt.prompt();
      installEvt.userChoice.then(function (r) { if (r.outcome === "accepted") { prefs.installed = true; save("prefs", prefs); var c = document.getElementById("installCard"); if (c) c.remove(); } });
      installEvt = null; b.hidden = true;
    });
    var x = document.getElementById("btnInstallHide");
    if (x) x.addEventListener("click", function () { prefs.hideInstall = true; save("prefs", prefs); document.getElementById("installCard").remove(); });
  }
  function secHead(n, title, sub) {
    return '<div class="sec-head"><img src="icons/emblem.png" alt=""><div><b><span class="sec-num">' + n + "</span>" + esc(title) + "</b><span>" + esc(sub) + "</span></div></div>";
  }
  function home() {
    setTop(APP_TITLE, false); setTab("home");
    var h = secHead(1, "기도서", "대한성공회 서울교구 · 성공회 사목예식서");
    h += '<div class="search-box" style="position:static"><input id="hq" type="search" placeholder="기도문 검색 (예: 주님의 기도, 시편 23)" autocomplete="off"></div>';
    h += installCard();
    h += officeCard(officeNow());
    h += '<section class="card"><h2>예식서</h2><div class="grid">' +
      window.HOME_TILES.map(function (t) { return '<a href="#/p/' + t[1] + '">' + esc(t[0]) + "</a>"; }).join("") + "</div>" +
      '<a class="hero-link" style="margin:8px 0 0;text-align:center" href="#/toc">전체 목차 보기 ›</a></section>';
    if (stars.length) h += '<section class="card"><h2>즐겨찾기</h2><ul class="list">' + stars.map(function (id) { return link(id); }).join("") + "</ul></section>";
    if (recent.length) h += '<section class="card"><h2>최근 본 기도문</h2><ul class="list">' + recent.slice(0, 5).map(function (id) { return link(id); }).join("") + "</ul></section>";
    h += '<p class="note">기도문 화면 오른쪽 위 ☆ 를 누르면 즐겨찾기에 모입니다. 기도서는 인터넷 연결 없이도 볼 수 있습니다' + (window.CONTENT_DATE ? " (" + esc(window.CONTENT_DATE) + " 기준)" : "") + ".<br>" +
      '앱 관리: ' + esc(INFO.manager || "") + ' · <a href="#/sites?about=1" style="color:inherit">수정·추가 요청하기</a></p>';
    view.innerHTML = h;
    bindInstall(); bindOffice();
    document.getElementById("hq").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && this.value.trim()) location.hash = "#/search?q=" + encodeURIComponent(this.value.trim());
    });
  }

  // ② 매일의 본기도와 독서
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // 매일의 본기도와 독서: lect.js 에 미리 담아 둔 날짜별 자료를 바로 보여 줌
  var lectOff = 0;
  var COLOR_CSS = { "녹색": "#2e8b57", "백색": "#f4f1ea", "흰색": "#f4f1ea", "홍색": "#c0392b", "적색": "#c0392b", "자색": "#6a3d9a", "보라색": "#6a3d9a", "장미색": "#e58fb0", "청색": "#2f6fa8", "흑색": "#222" };
  function refLink(ref, d) {
    var p = parseRef(ref.replace(/[,;(].*$/, "").replace(/[a-z]$/, ""));
    var url = p && p.ch ? bibleUrl(p.b, p.ch) : window.BIBLE_SITE + "/lectionary/" + d;
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(ref) + " ↗</a>";
  }
  // 앱을 열면 이번 달·다음 달 독서 본문을 미리 받아 둠(오프라인 대비)
  setTimeout(function () { var t = new Date(), n = new Date(t.getFullYear(), t.getMonth() + 1, 1); lectMonth(ymd(t)); lectMonth(ymd(n)); }, 3000);
  function lectCard() {
    var d = new Date(); d.setDate(d.getDate() + lectOff);
    var key = ymd(d), L = (window.LECT || {})[key], wd = "일월화수목금토";
    var h = '<section class="card lect" id="lectCard" data-key="' + key + '"><div class="lect-top"><h2>매일의 본기도와 독서</h2>' +
      '<span class="lect-nav"><button type="button" data-lo="-1" aria-label="전날">◀</button>' +
      (lectOff ? '<button type="button" data-lo="0">오늘</button>' : "") +
      '<button type="button" data-lo="1" aria-label="다음 날">▶</button></span></div>' +
      '<div class="lect-date">' + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + wd[d.getDay()] + ")" + (lectOff === 0 ? " · 오늘" : "") + "</div>";
    if (!L) {
      return h + '<p class="note" style="margin:8px 0">이 날짜의 자료가 앱에 없습니다.</p><a class="btn pri" href="' + window.BIBLE_SITE + "/lectionary/" + key + '" target="_blank" rel="noopener">공동번역성서에서 보기 ↗</a></section>';
    }
    h += '<div class="lect-day">' + esc(L.d) + "</div>" +
      '<div class="lect-meta">' + (L.c || []).map(function (c) { return '<span class="lect-chip"><i style="background:' + (COLOR_CSS[c] || "#999") + '"></i>' + esc(c) + "</span>"; }).join("") +
      (L.m || []).map(function (m) { return '<span class="lect-chip">' + esc(m) + "</span>"; }).join("") + "</div>";
    if (L.k && L.k.length) {
      h += '<h3>본기도</h3>' + L.k.map(function (k, i) { return (L.k.length > 1 ? '<p class="lect-alt">' + (i + 1) + "</p>" : "") + '<p class="lect-collect">' + esc(k) + "</p>"; }).join("") +
        (L.e ? '<p class="lect-ending">' + esc(L.e) + "</p>" : "");
    }
    if (L.r && L.r.length) {
      h += L.r.map(function (r, i) {
        return '<div class="lect-read"><h3>' + esc(r[0]) + (r[1] ? " · " + refLink(r[1], key) : "") + '</h3><div class="lect-text" data-i="' + i + '"><p class="note" style="margin:0">본문을 불러오는 중…</p></div></div>';
      }).join("");
    }
    h += '<a class="hero-link" style="margin:8px 0 0;text-align:center" href="#/note?d=' + key + '">✍ 이 말씀으로 묵상 기록하기</a>' +
      '<p class="note" style="margin:12px 0 0">본문: 대한성공회 공동번역성서 전례독서(bible.anglican.kr)</p></section>';
    return h;
  }
  // 날짜별 독서 본문은 달마다 나눈 파일(lect/YYYY-MM.json)에서 불러옴
  var lectMonths = {};
  function lectMonth(key) {
    var m = key.slice(0, 7);
    if (!lectMonths[m]) lectMonths[m] = fetch("lect/" + m + ".json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { delete lectMonths[m]; return null; });
    return lectMonths[m];
  }
  function safeText(s) {
    return String(s || "").replace(/<(\/?)(p|sup|br)(\s+class="gl")?\s*>|<[^>]*>/g, function (all, sl, tag, gl) { return tag ? "<" + sl + tag + (gl || "") + ">" : ""; });
  }
  function fillLect() {
    var c = document.getElementById("lectCard"); if (!c || !c.dataset.key) return;
    var key = c.dataset.key;
    lectMonth(key).then(function (M) {
      var cur = document.getElementById("lectCard"); if (!cur || cur.dataset.key !== key) return;
      var R = M && M[key];
      Array.prototype.forEach.call(cur.querySelectorAll(".lect-text"), function (el) {
        var r = R && R[+el.dataset.i];
        if (r && r[3]) { el.innerHTML = safeText(r[3]); el.classList.toggle("poetry", !!r[2]); }
        else el.innerHTML = '<p class="note" style="margin:0">' + (navigator.onLine ? "본문을 불러오지 못했습니다." : "인터넷에 연결되면 본문이 표시됩니다.") +
          ' <a href="' + window.BIBLE_SITE + "/lectionary/" + key + '" target="_blank" rel="noopener">공동번역성서에서 보기 ↗</a></p>';
      });
    });
  }
  function bindLect() {
    var c = document.getElementById("lectCard"); if (!c) return;
    c.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-lo]"); if (!b) return;
      var v = +b.dataset.lo; lectOff = v === 0 ? 0 : lectOff + v;
      var n = document.createElement("div"); n.innerHTML = lectCard(); c.replaceWith(n.firstChild); bindLect();
    });
    fillLect();
  }
  function lectHtml(part) {
    var d = new Date(), wd = "일월화수목금토";
    var days = [-1, 0, 1, 2, 3, 4, 5].map(function (k) { var x = new Date(d); x.setDate(d.getDate() + k); return x; });
    if (part === 1) return lectCard();
    var h;
    h = '<section class="card"><h2>날짜별 본기도와 독서</h2><div class="grid">' + days.map(function (x, i) {
      return '<a href="' + window.BIBLE_SITE + "/lectionary/" + ymd(x) + '" target="_blank" rel="noopener">' + (i === 1 ? "오늘" : (x.getMonth() + 1) + "/" + x.getDate()) + " (" + wd[x.getDay()] + ")</a>";
    }).join("") + '<a href="' + window.BIBLE_SITE + '/calendar" target="_blank" rel="noopener">교회력 달력</a></div></section>';
    h += '<section class="card"><h2>기도서의 본기도 (앱 안에서 보기)</h2><ul class="list">' +
      link("e3l3s39q", "본기도 선택") + link("1qxwr9lz", "대림절") + link("6rlkb3qz", "성탄절") + link("acxd52l7", "사순절 1-3") +
      link("mwfjr33w", "부활절 1-4") + link("81bxjzit", "연중시기 1-5") + link("adelb742", "주요축일 1-6월") + link("acnk27tn", "주요축일 7-12월") +
      link("3hfyqln6", "성인축일") + link("486uh1jn", "월별축일표") + link("8fob4b3f", "간구기도") + "</ul>" +
      '<a class="hero-link" style="margin:8px 0 0;text-align:center" href="#/toc">모든 본기도 목록은 전체 목차에서 ›</a></section>';
    h += '<section class="card links"><h2>함께 보기</h2>' +
      ext(siteUrl("전례독서 오디오 성서"), "전례독서 오디오 성서", "YouTube ↗") +
      ext(siteUrl("교회력 캘린더"), "교회력 캘린더", "구글 캘린더 ↗") + "</section>";
    return h;
  }

  // 관리자 문의 (메일 앱이 열리며 제목·내용 틀이 채워짐)
  var INFO = window.APP_INFO || {};
  function mailto(subject, body) {
    return "mailto:" + INFO.contact + "?subject=" + encodeURIComponent("[사목예식서 앱] " + subject) + "&body=" + encodeURIComponent(body);
  }
  function aboutCard() {
    var h = '<section class="card" id="about"><h2>앱 정보 · 문의</h2>' +
      '<div class="org" style="border:0;padding-top:0"><b>성공회 사목예식서 앱</b><span style="flex:1 1 100%">관리: ' + esc(INFO.manager || "") +
      (INFO.contact ? ' &nbsp;<a href="mailto:' + esc(INFO.contact) + '" style="color:var(--accent)">' + esc(INFO.contact) + "</a>" : "") + "</span><span>버전 " + esc(INFO.version || "") +
      (window.CONTENT_DATE ? " · 기도서 본문 " + esc(window.CONTENT_DATE) + " 기준" : "") + "</span></div>";
    if (INFO.contact) {
      h += '<div class="acts" style="display:flex;flex-wrap:wrap;gap:6px">' +
        '<a class="btn pri" href="' + mailto("수정 요청", "■ 고칠 곳 (화면/기도문 이름):\n\n■ 내용:\n\n■ 보내는 분 (교회/이름, 선택):\n") + '">수정 요청</a>' +
        '<a class="btn" href="' + mailto("기능 제안", "■ 있으면 좋겠는 기능:\n\n■ 이유:\n\n■ 보내는 분 (교회/이름, 선택):\n") + '">기능 제안</a>' +
        '<a class="btn" href="' + mailto("교회 정보 변경", "■ 교회 이름:\n■ 바뀐 내용 (주소/전화/사제/홈페이지):\n\n■ 보내는 분 (교회/이름, 선택):\n") + '">교회 정보 변경</a></div>';
    }
    h += '<p class="note" style="margin:12px 0 0">기도서 본문은 성공회사목예식서 웹사이트, 교회 정보는 서울교구·관구 주소록을 바탕으로 합니다.</p>' +
      '<p class="note" style="margin:6px 0 0"><a href="privacy.html" style="color:inherit">개인정보처리방침</a></p></section>';
    return h;
  }

  function siteUrl(name) { var s = window.SEOUL_SITES.filter(function (x) { return x[1] === name; })[0]; return s ? s[2] : "#"; }

  // ④ 서울교구 사이트 모음
  // ---------- 묵상기록 (이 기기 안에만 저장) ----------
  var notes = load("notes", []);
  var NOTE_MAX = 2000; // A4 한 장 분량(글자 크기 10pt 기준 약 2,000자)
  function saveNotes() { save("notes", notes); }
  function lectInfo(key) {
    var L = (window.LECT || {})[key];
    return L ? { day: L.d, refs: (L.r || []).map(function (r) { return r[0] + " " + r[1]; }) } : { day: "", refs: [] };
  }
  function dateLabel(key) {
    var p = key.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return p[0] + "년 " + (+p[1]) + "월 " + (+p[2]) + "일 (" + "일월화수목금토"[d.getDay()] + ")";
  }
  function noteView(id, qd, qq) {
    setTop("묵상기록", !!id); setTab("note");
    var n = id ? notes.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !n) { location.hash = "#/note"; return; }
    var key = n ? n.date : (qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : ymd(new Date()));
    var info = n ? { day: n.day, refs: n.refs || [] } : lectInfo(key);
    var draft = !n ? (load("noteDraft", null) || {}) : {};
    var text = n ? n.text : (draft.date === key ? draft.text : "");
    var h = id ? "" : secHead(4, "묵상기록", "독서와 기도로 얻은 느낌과 감상을 적어 둡니다");
    h += '<section class="card note-ed"><div class="note-date"><input type="date" id="nDate" value="' + key + '"' + (n ? " disabled" : "") + '>' +
      '<span id="nDay">' + esc(info.day || "") + "</span></div>" +
      '<div class="note-refs" id="nRefs">' + info.refs.map(function (r) { return '<span class="lect-chip">' + esc(r) + "</span>"; }).join("") + "</div>" +
      '<textarea id="nText" maxlength="' + NOTE_MAX + '" placeholder="오늘의 말씀과 기도 가운데 마음에 머문 구절, 느낌, 다짐을 적어 보세요.">' + esc(text) + "</textarea>" +
      '<div class="note-acts"><span class="note-left"><span class="note-count" id="nCount"></span><span id="nMsg" class="note-msg"></span></span>' +
      (n ? '<button type="button" class="btn" id="nDel">삭제</button>' : '<a class="btn" href="#/bible">오늘의 말씀 보기</a>') +
      '<button type="button" class="btn pri" id="nSave">' + (n ? "수정 저장" : "저장") + "</button></div></section>";
    if (!id) {
      h += '<section class="card"><h2>나의 묵상 (' + notes.length + ")</h2>" +
        (notes.length ? '<div class="search-box" style="position:static;padding:0 0 8px"><input id="nq" type="search" placeholder="기록 검색 (낱말, 성서 구절)" value="' + esc(qq || "") + '" autocomplete="off"></div><ul class="list" id="nList"></ul>'
          : '<p class="note" style="margin:0">아직 기록이 없습니다. 위에 첫 묵상을 적어 보세요.</p>') + "</section>";
      var used = JSON.stringify(notes).length * 2, usedTxt = used < 1024 * 1024 ? Math.max(1, Math.round(used / 1024)) + "KB" : (used / 1048576).toFixed(1) + "MB";
      h += '<section class="card"><h2>보관 · 옮기기</h2><p class="note-count" style="margin:0 0 6px">저장된 기록 ' + notes.length + "개 · 사용 공간 약 " + usedTxt + " / 5MB (A4 약 1,000장 분량까지 저장 가능)</p>" + '<p class="note" style="margin:0 0 10px">기록은 <b>이 휴대폰 안에만</b> 저장되며 어디에도 전송되지 않습니다. 앱을 지우거나 휴대폰을 바꾸면 사라지니, 가끔 <b>내보내기</b>로 파일을 보관해 두세요.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn" id="nExpTxt">글로 내보내기 (.txt)</button><button type="button" class="btn" id="nExp">백업 파일 (.json)</button><button type="button" class="btn" id="nImpBtn">백업 불러오기</button><input type="file" id="nImp" accept=".json,application/json" hidden></div>' +
        '<p class="note" style="margin:8px 0 0"><a href="note-guide.html" style="color:var(--accent);font-weight:700">묵상기록 저장 안내 (꼭 읽어 주세요) ›</a> · <a href="privacy.html" style="color:inherit">개인정보처리방침</a></p></section>';
    }
    view.innerHTML = h;
    var ta = document.getElementById("nText"), msg = document.getElementById("nMsg"), dateIn = document.getElementById("nDate");
    function grow() { ta.style.height = "auto"; ta.style.height = Math.max(180, ta.scrollHeight + 4) + "px"; }
    var cnt = document.getElementById("nCount");
    function count() {
      var len = ta.value.length;
      cnt.textContent = len.toLocaleString() + " / " + NOTE_MAX.toLocaleString() + "자 · A4 " + (len / NOTE_MAX).toFixed(1) + "장";
      cnt.classList.toggle("warn", len >= NOTE_MAX * 0.9);
    }
    grow(); count();
    ta.addEventListener("input", function () { grow(); count();if (!n) save("noteDraft", { date: dateIn.value, text: ta.value }); msg.textContent = ""; });
    if (!n) dateIn.addEventListener("change", function () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIn.value)) return;
      var i2 = lectInfo(dateIn.value);
      document.getElementById("nDay").textContent = i2.day;
      document.getElementById("nRefs").innerHTML = i2.refs.map(function (r) { return '<span class="lect-chip">' + esc(r) + "</span>"; }).join("");
      save("noteDraft", { date: dateIn.value, text: ta.value });
    });
    document.getElementById("nSave").onclick = function () {
      var t = ta.value.trim();
      if (!t) { msg.textContent = "내용을 적어 주세요."; ta.focus(); return; }
      var now = Date.now();
      if (n) { n.text = t; n.updated = now; }
      else {
        var k = dateIn.value || ymd(new Date()), i3 = lectInfo(k);
        notes.unshift({ id: now.toString(36), date: k, day: i3.day, refs: i3.refs, text: t, created: now, updated: now });
        save("noteDraft", null);
      }
      notes.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created; });
      saveNotes();
      if (n) { msg.textContent = "저장했습니다."; } else { noteView(null, null, ""); document.getElementById("nMsg").textContent = "저장했습니다."; }
    };
    var del = document.getElementById("nDel");
    if (del) del.onclick = function () {
      if (!confirm("이 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.")) return;
      notes = notes.filter(function (x) { return x.id !== n.id; }); saveNotes(); location.hash = "#/note";
    };
    if (id) return;
    var list = document.getElementById("nList"), nq = document.getElementById("nq");
    function renderList() {
      if (!list) return;
      var q = (nq.value || "").trim().replace(/\s+/g, "");
      var rows = notes.filter(function (x) { return !q || (x.text + x.day + (x.refs || []).join("")).replace(/\s+/g, "").indexOf(q) >= 0; });
      list.innerHTML = rows.length ? rows.map(function (x) {
        return '<li><a href="#/note/' + esc(x.id) + '">' + esc(dateLabel(x.date)) + (x.day ? " · " + esc(x.day) : "") +
          '<span class="sub note-prev">' + esc(x.text.slice(0, 120)) + "</span></a></li>";
      }).join("") : '<li class="empty" style="padding:12px">검색 결과가 없습니다.</li>';
    }
    if (nq) { nq.oninput = renderList; renderList(); }
    function download(name, body, type) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: type }));
      a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    var stamp = ymd(new Date());
    document.getElementById("nExpTxt").onclick = function () {
      if (!notes.length) { alert("내보낼 기록이 없습니다."); return; }
      download("묵상기록-" + stamp + ".txt", "﻿" + notes.map(function (x) {
        return "■ " + dateLabel(x.date) + (x.day ? " · " + x.day : "") + "\n" + ((x.refs || []).length ? "  (" + x.refs.join(", ") + ")\n" : "") + "\n" + x.text + "\n";
      }).join("\n────────────\n\n"), "text/plain;charset=utf-8");
    };
    document.getElementById("nExp").onclick = function () {
      if (!notes.length) { alert("내보낼 기록이 없습니다."); return; }
      download("묵상기록-백업-" + stamp + ".json", JSON.stringify({ app: "prayerbook-notes", v: 1, notes: notes }), "application/json");
    };
    var imp = document.getElementById("nImp");
    document.getElementById("nImpBtn").onclick = function () { imp.click(); };
    imp.onchange = function () {
      var f = imp.files && imp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var j = JSON.parse(rd.result), arr = (j && j.notes) || [];
          var have = {}; notes.forEach(function (x) { have[x.id] = 1; });
          var add = arr.filter(function (x) { return x && typeof x.text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.id && !have[x.id]; })
            .map(function (x) { return { id: String(x.id), date: x.date, day: String(x.day || ""), refs: Array.isArray(x.refs) ? x.refs.map(String) : [], text: x.text, created: +x.created || Date.now(), updated: +x.updated || Date.now() }; });
          notes = notes.concat(add).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created; });
          saveNotes(); alert(add.length + "개의 기록을 불러왔습니다."); noteView();
        } catch (e) { alert("백업 파일을 읽지 못했습니다."); }
      };
      rd.readAsText(f);
    };
  }
  var HYMN_SITE ="https://dulkuka12.github.io/khymn/";
  // ---------- 영성센터 (대한성공회 영성센터 페이스북: 매일 아침 오늘의 복음과 묵상) ----------
  var SOUL_FB = "https://www.facebook.com/soulfriend21";
  function soul() {
    setTop("영성센터", false); setTab("soul");
    var d = new Date(), wd = "일월화수목금토";
    var h = secHead(3, "영성센터", "대한성공회 영성센터 · 매일의 복음 묵상");
    h += '<section class="card soul-head"><div class="lect-date" id="soulDate">' + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + wd[d.getDay()] + ')</div>' +
      '<h2 class="office-title" id="soulTitle" style="margin:2px 0 4px">오늘의 복음 묵상</h2>' +
      '<div id="soulPost"></div>' +
      '<a class="hero-link" id="soulBtn" style="text-align:center;font-size:15px;margin-top:6px" href="' + SOUL_FB + '" target="_blank" rel="noopener">📖 페이스북에서 보기 ↗</a></section>';
    h += '<details class="card soul-guide"' + (load("soulSeen", false) ? "" : " open") + '><summary>처음 오신 분께 · 이용 안내</summary>' +
      '<p style="margin:4px 0 6px"><b>영성센터</b>는 대한성공회 영성센터(서울 정동)가 날마다 올리는 <b>복음 묵상</b>을 보여 드리는 곳입니다.</p>' +
      '<ol class="hy-steps"><li>매일 아침 7시쯤 <b>그날의 복음 말씀</b>과 <b>오늘의 말씀(묵상)</b>이 새로 올라옵니다.</li>' +
      '<li>위 글 상자를 <b>아래로 내려가며</b> 읽으세요. 글이 길면 끝에 <b>「… 더 보기」</b>가 나오는데, 누르면 페이스북에서 <b>전문</b>이 열립니다.</li>' +
      '<li>페이스북 <b>회원이 아니어도, 로그인하지 않아도</b> 볼 수 있습니다. 로그인 창이 뜨면 ✕나 「나중에」를 누르세요.</li>' +
      '<li>읽고 나서 마음에 머문 구절과 느낌은 아래 <b>묵상</b> 탭(묵상기록)에 적어 두면 좋습니다.</li>' +
      '<li>인터넷이 연결되어 있어야 보입니다.</li></ol></details>';
    h += '<div class="hy-src"><b>출처 · 제공 경로</b><br>• 출처: 대한성공회 영성센터 (facebook.com/soulfriend21) (인터넷 연결 필요)<br>' +
      '• 제공 경로: 페이스북이 제공하는 공식 게시물 보기 기능으로 <b>그대로 보여 주며</b>, 글을 이 앱에 저장하거나 고치지 않습니다.</div>';
    view.innerHTML = h;
    var sg = view.querySelector(".soul-guide"); if (sg) sg.addEventListener("toggle", function () { if (!sg.open) save("soulSeen", true); });
    // soul.json: {"date":"YYYY-MM-DD","url":"오늘 게시물 주소"} — 날짜가 오늘이면 그 게시물을 펼쳐 보여 줌
    fetch("soul.json?d=" + ymd(d), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
      var box = document.getElementById("soulPost"); if (!box) return;
      if (!j || !j.url || !/^https:\/\/www\.facebook\.com\//.test(j.url)) { box.innerHTML = '<p class="note" style="margin:4px 0">오늘 글은 아래 버튼을 눌러 보세요.</p>'; return; }
      var today = j.date === ymd(d);
      var w = Math.max(280, Math.min(500, box.clientWidth || 340));
      // 날짜 표시를 실제로 보여 주는 글의 날짜에 맞춤 (오늘 날짜와 다른 글이 섞여 보이지 않게)
      var pp = String(j.date).split("-"), pd = new Date(+pp[0], +pp[1] - 1, +pp[2]);
      if (!isNaN(pd)) document.getElementById("soulDate").textContent = (pd.getMonth() + 1) + "월 " + pd.getDate() + "일 (" + wd[pd.getDay()] + ")" + (today ? " · 오늘" : "");
      document.getElementById("soulTitle").textContent = today ? "오늘의 복음 묵상" : "최근 복음 묵상";
      box.innerHTML = '<iframe title="성공회 영성센터 오늘의 묵상" src="https://www.facebook.com/plugins/post.php?href=' + encodeURIComponent(j.url) + "&width=" + w + '&show_text=true&locale=ko_KR" ' +
        'width="' + w + '" height="680" style="border:none;overflow:hidden;width:100%;max-width:500px;display:block;margin:4px auto 0;background:#fff;border-radius:10px" scrolling="no" frameborder="0" allowfullscreen="true" allow="clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';
      var b = document.getElementById("soulBtn"); if (b) b.href = j.url;
    });
  }
  // ---------- 성가 2015 (각자 기기에 불러온 PDF로 보기) ----------
  var HYMN_BY = {}; (window.HYMNS || []).forEach(function (x) { HYMN_BY[x[0]] = x; });
  var hymnMarks = load("hymnMarks", []);
  var hymnDoc = null, hymnDocP = null;
  function idb() {
    return new Promise(function (ok, no) {
      try { var r = indexedDB.open("prayerbook", 1); r.onupgradeneeded = function () { r.result.createObjectStore("files"); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; } catch (e) { no(e); }
    });
  }
  function fileGet(k) { return idb().then(function (db) { return new Promise(function (ok, no) { var q = db.transaction("files").objectStore("files").get(k); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { no(q.error); }; }); }); }
  function filePut(k, v) { return idb().then(function (db) { return new Promise(function (ok, no) { var t = db.transaction("files", "readwrite"); t.objectStore("files").put(v, k); t.oncomplete = function () { ok(); }; t.onerror = function () { no(t.error); }; }); }); }
  function fileDel(k) { return idb().then(function (db) { return new Promise(function (ok) { var t = db.transaction("files", "readwrite"); t.objectStore("files").delete(k); t.oncomplete = function () { ok(); }; t.onerror = function () { ok(); }; }); }); }
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = "vendor/pdf.min.js";
      s.onload = function () { pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; ok(pdfjsLib); };
      s.onerror = function () { no(new Error("pdf.js")); }; document.head.appendChild(s);
    });
  }
  function openHymnDoc() {
    if (hymnDoc) return Promise.resolve(hymnDoc);
    if (hymnDocP) return hymnDocP;
    hymnDocP = fileGet("hymnpdf").then(function (blob) {
      if (!blob) return null;
      return Promise.all([loadPdfJs(), blob.arrayBuffer()]).then(function (r) { return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise; })
        .then(function (d) { hymnDoc = d; return d; });
    }).catch(function () { return null; }).then(function (d) { hymnDocP = null; return d; });
    return hymnDocP;
  }
  function hymnTitle(x) { return (x[3] && x[3][0]) || ""; }
  function hymnFind(q) {
    q = String(q || "").trim(); if (!q) return [];
    var m = /^(\d{1,3})(?:-\d)?$/.exec(q);
    if (m) return HYMN_BY[+m[1]] ? [HYMN_BY[+m[1]]] : [];
    var k = q.replace(/[\s,.!?·]/g, "");
    return (window.HYMNS || []).filter(function (x) { return x[3].some(function (t) { return t.replace(/[\s,.!?·]/g, "").indexOf(k) >= 0; }); });
  }
  function hymnRow(x) {
    var on = hymnMarks.indexOf(x[0]) >= 0;
    return '<li><a href="#/hymn/' + x[0] + '"><b class="hy-no">' + x[0] + "</b>" + esc(hymnTitle(x)) +
      (x[3].length > 1 ? '<span class="sub">' + esc(x[3].slice(1, 3).join(" · ")) + "</span>" : "") + (on ? '<span class="hy-mk">📌</span>' : "") + "</a></li>";
  }
  function hymnSearchBar(q) {
    return '<div class="hy-bar"><input id="hq2" type="search" inputmode="search" placeholder="장 번호 또는 제목·첫 줄 (예: 125, 평화)" value="' + esc(q || "") + '" autocomplete="off">' +
      '<button type="button" class="btn pri" id="hyGo">🔍 검색</button><a class="btn" href="#/hymn?bm=1">📌 책갈피' + (hymnMarks.length ? " " + hymnMarks.length : "") + "</a></div>" +
      '<p class="note hy-guide">• <b>장 번호</b>(예: 125)를 넣으면 바로 그 성가가 열립니다.<br>• <b>제목이나 가사 첫 줄 낱말</b>(예: 평화, 주님의 사랑)로 찾으면 목록이 나옵니다.<br>• 성가 화면의 <b>📌</b>을 누르면 책갈피에 모여, 오늘 부를 성가를 예배 중에 바로 펼 수 있습니다.</p>';
  }
  function bindHymnMode() {
    Array.prototype.forEach.call(document.querySelectorAll(".hy-mode button"), function (b) {
      b.onclick = function () { prefs.hymnMode = b.dataset.hm; save("prefs", prefs); hymn(null, {}); };
    });
  }
  function bindHymnBar() {
    var inp = document.getElementById("hq2"), go = document.getElementById("hyGo");
    function run() { var v = inp.value.trim(); if (!v) { inp.focus(); return; } var r = hymnFind(v); if (r.length === 1 && /^\d/.test(v)) location.hash = "#/hymn/" + r[0][0]; else location.hash = "#/hymn?q=" + encodeURIComponent(v); }
    go.onclick = run; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
  }
  function hymn(no, qs) {
    qs = qs || {};
    // 테스터용 링크(#/hymn?key=암호): 암호를 입력하지 않아도 자동으로 풀고, 주소에서 암호를 지움
    if (qs.key && window.HYMN_LOCKED) {
      var key = qs.key;
      try { history.replaceState(null, "", location.pathname + location.search + "#/hymn"); } catch (e) {}
      setTop("성가 2015", false); setTab("hymn");
      view.innerHTML = secHead(5, "성가 2015", "성공회 성가 · 장 번호와 제목으로 찾기") +
        '<section class="card hy-load"><h2>🎵 성가 악보 준비 중</h2><p id="hyAuto" style="margin:0">잠시만 기다려 주세요…</p></section>';
      fileGet("hymnpdf").then(function (have) {
        if (have) return have;
        return hymnUnlock(key, function (t) { var el = document.getElementById("hyAuto"); if (el) el.textContent = t; });
      }).then(function () { hymnDoc = null; hymn(null, {}); })
        .catch(function (e) { var el = document.getElementById("hyAuto"); if (el) el.textContent = e && e.message === "pw" ? "링크가 더 이상 쓸 수 없습니다. 관리자에게 문의해 주세요." : "불러오지 못했습니다. 인터넷 연결을 확인하고 링크를 다시 눌러 주세요."; });
      return;
    }
    setTop("성가 2015", !!no); setTab("hymn");
    if (no) return hymnView(+no);
    var mode = qs.m || prefs.hymnMode || "file";
    if (qs.m) { prefs.hymnMode = qs.m; save("prefs", prefs); }
    var h = secHead(5, "성가 2015", "성공회 성가 · 장 번호와 제목으로 찾기");
    h += '<div class="office-tabs hy-mode"><button type="button" data-hm="file" class="' + (mode === "file" ? "on" : "") + '">① 성가 파일로 보기</button>' +
      '<button type="button" data-hm="web" class="' + (mode === "web" ? "on" : "") + '">② 성가 2015 웹앱</button></div>';
    if (mode === "web") {
      h += '<section class="card"><h2>「성가 2015」 웹앱으로 찾기</h2>' +
        '<p style="margin:0 0 8px">성가 파일이 없어도, 별도로 운영되는 「성가 2015」 웹앱에서 번호나 제목으로 성가를 찾아볼 수 있습니다. (인터넷 연결 필요)</p>' +
        '<a class="hero-link" style="text-align:center;font-size:16px" href="' + HYMN_SITE + 'searchhymn.html" target="_blank" rel="noopener">🎵 성가 2015 웹앱 열기 ↗</a>' +
        '<p class="note hy-guide" style="margin:6px 2px 0">• 웹앱에서 <b>성가 번호</b>(예: 125)나 <b>제목 단어</b>를 넣고 <b>Enter</b>를 누르세요.<br>• ◀ ▶ 버튼으로 이전·다음 성가로 넘어갑니다.<br>• 다 보신 뒤 휴대폰 <b>뒤로 가기</b>를 누르면 이 앱으로 돌아옵니다.<br>• 이 앱의 성가집과 쪽 구성·내용이 조금 다를 수 있습니다.</p>' +
        '<div class="hy-src"><b>출처 · 제공 경로</b><br>' +
        '• 출처: 「성가 2015」 웹앱 — <a href="' + HYMN_SITE + '" target="_blank" rel="noopener">dulkuka12.github.io/khymn</a> · <b>장창경 신부님 제작</b> (인터넷 연결 필요)<br>' +
        '• 원본 성가집: 대한성공회 「성가 2015」 (대한성공회출판부 발행)<br>' +
        '• 제공 경로: 이 앱은 해당 웹앱으로 <b>링크만 연결</b>하며, 웹앱의 내용을 이 앱에 저장하거나 고치지 않습니다. 내용 문의는 해당 웹앱 운영자에게 해 주세요.</div></section>';
      view.innerHTML = h; bindHymnMode(); return;
    }
    h += hymnSearchBar(qs.q);
    var list = qs.bm ? hymnMarks.map(function (n) { return HYMN_BY[n]; }).filter(Boolean) : qs.q ? hymnFind(qs.q) : null;
    if (qs.bm) h += '<section class="card"><h2>📌 책갈피 (' + list.length + ")</h2>" + (list.length ? '<ul class="list">' + list.map(hymnRow).join("") + "</ul>" +
      '<button type="button" class="btn" id="hyClr" style="margin-top:6px">책갈피 모두 지우기</button>' : '<p class="note" style="margin:0">성가 화면에서 📌을 누르면 여기에 모입니다.</p>') + "</section>";
    else if (list) h += '<section class="card"><h2>찾은 성가 (' + list.length + ")</h2>" + (list.length ? '<ul class="list">' + list.slice(0, 100).map(hymnRow).join("") + "</ul>" : '<p class="note" style="margin:0">찾는 성가가 없습니다. 다른 낱말로 찾아보세요.</p>') + "</section>";
    h += '<div id="hyFile"></div>';
    view.innerHTML = h; bindHymnBar(); bindHymnMode();
    var clr = document.getElementById("hyClr");
    if (clr) clr.onclick = function () { if (confirm("책갈피를 모두 지울까요?")) { hymnMarks = []; save("hymnMarks", hymnMarks); hymn(null, { bm: 1 }); } };
    fileGet("hymnpdf").then(function (b) { renderHymnFile(b); }).catch(function () { renderHymnFile(null); });
  }
  function renderHymnFile(blob) {
    var box = document.getElementById("hyFile"); if (!box) return;
    if (blob) {
      box.innerHTML = '<section class="card"><h2>성가 파일</h2><p class="note" style="margin:0 0 6px">이 기기에 저장됨 · ' + (blob.size / 1048576).toFixed(1) + 'MB · 인터넷 없이 볼 수 있습니다.</p>' +
        '<button type="button" class="btn" id="hyDel">이 기기에서 성가 파일 지우기</button></section>';
      document.getElementById("hyDel").onclick = function () { if (!confirm("이 기기에 저장된 성가 파일을 지울까요? (책갈피는 남습니다)")) return; hymnDoc = null; fileDel("hymnpdf").then(function () { renderHymnFile(null); }); };
      return;
    }
    if (window.HYMN_LOCKED) {
      box.innerHTML = '<section class="card hy-load"><h2>🔒 성가 악보 열기 (테스터용)</h2>' +
        '<p style="margin:0 0 6px">관리자에게 받은 <b>암호</b>를 처음 한 번만 넣으면, 악보가 이 기기에 저장되어 장 번호로 바로 펼쳐 볼 수 있습니다. (약 19MB · 와이파이 권장)</p>' +
        '<div class="hy-bar"><input id="hyPw" type="password" autocomplete="off" placeholder="암호 입력"><button type="button" class="btn pri" id="hyUnlock">열기</button></div>' +
        '<span id="hyMsg" class="note-msg"></span>' +
        '<details style="margin-top:6px"><summary class="note" style="padding:4px 0">PDF 파일을 직접 갖고 계신가요?</summary>' +
        '<label class="btn" style="cursor:pointer">PDF 파일 고르기<input type="file" id="hyFileIn" accept="application/pdf,.pdf" hidden></label></details>' +
        '<p class="note" style="margin:6px 0 0">지금은 <b>테스트용</b>입니다. 암호는 앱 관리자에게 문의해 주세요.</p></section>';
      var pwIn = document.getElementById("hyPw"), pmsg = document.getElementById("hyMsg");
      var go = function () {
        var pw = pwIn.value.trim(); if (!pw) { pwIn.focus(); return; }
        document.getElementById("hyUnlock").disabled = true;
        hymnUnlock(pw, function (t) { pmsg.textContent = t; }).then(function (blob) {
          pmsg.textContent = "저장했습니다."; hymnDoc = null; setTimeout(function () { renderHymnFile(blob); }, 600);
        }).catch(function (e) {
          pmsg.textContent = e && e.message === "pw" ? "암호가 맞지 않습니다." : "불러오지 못했습니다. 인터넷 연결과 저장 공간을 확인해 주세요.";
          var b = document.getElementById("hyUnlock"); if (b) b.disabled = false;
        });
      };
      document.getElementById("hyUnlock").onclick = go;
      pwIn.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      bindHymnPick();
      return;
    }
    box.innerHTML = '<section class="card hy-load"><h2>📂 성가 파일 불러오기 (처음 한 번)</h2>' +
      '<p style="margin:0 0 6px">「성가 2015」 PDF 파일을 이 기기에 한 번 불러오면, 장 번호로 악보를 바로 펼쳐 볼 수 있습니다. 파일은 <b>이 기기 안에만</b> 저장되며 어디에도 전송되지 않습니다.</p>' +
      (window.HYMN_FILE_URL ?
        '<ol class="hy-steps"><li><b>[① 악보 파일 받기]</b>를 눌러 구글 드라이브에서 <b>다운로드</b>합니다. (초대받은 구글 계정으로 로그인)</li>' +
        '<li>앱으로 돌아와 <b>[② PDF 파일 고르기]</b> → <b>다운로드(Download)</b> 폴더의 「성가 2015 (경량).pdf」를 고릅니다.</li>' +
        '<li>"저장했습니다"가 나오면 끝. 다운로드한 파일은 지워도 됩니다.</li></ol>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><a class="btn" href="' + esc(window.HYMN_FILE_URL) + '" target="_blank" rel="noopener">① 악보 파일 받기 ↗</a>' +
        '<label class="btn pri" style="cursor:pointer">② PDF 파일 고르기<input type="file" id="hyFileIn" accept="application/pdf,.pdf" hidden></label> <span id="hyMsg" class="note-msg"></span></div>' +
        '<p class="note" style="margin:8px 0 0">지금은 <b>테스트용</b>으로 초대된 분만 받을 수 있습니다. 받을 수 없으면 앱 관리자에게 문의해 주세요.</p>'
        : '<label class="btn pri" style="cursor:pointer">PDF 파일 고르기<input type="file" id="hyFileIn" accept="application/pdf,.pdf" hidden></label> <span id="hyMsg" class="note-msg"></span>') +
      "</section>";
    bindHymnPick();
  }
  // 암호로 잠긴 hymns.bin 을 받아 풀고 이 기기에 저장 (형식은 tools/encrypt-hymns.ps1 참고)
  function hymnUnlock(pw, say) {
    var S = crypto.subtle, enc = new TextEncoder();
    say("받는 중… (약 19MB)");
    return fetch("hymns.bin").then(function (r) { if (!r.ok) throw new Error("net"); return r.arrayBuffer(); }).then(function (ab) {
      var u = new Uint8Array(ab);
      if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== "PBH1") throw new Error("fmt");
      var salt = u.slice(4, 20), iv = u.slice(20, 36), body = u.subarray(4, u.length - 32), ct = u.subarray(36, u.length - 32), tag = u.slice(u.length - 32);
      say("암호 확인 중…");
      return S.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"])
        .then(function (k) { return S.deriveBits({ name: "PBKDF2", salt: salt, iterations: 200000, hash: "SHA-256" }, k, 512); })
        .then(function (bits) {
          var kb = new Uint8Array(bits);
          return Promise.all([S.importKey("raw", kb.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]),
            S.importKey("raw", kb.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])]);
        }).then(function (keys) {
          return S.verify("HMAC", keys[1], tag, body).then(function (ok) {
            if (!ok) throw new Error("pw");
            say("푸는 중…");
            return S.decrypt({ name: "AES-CBC", iv: iv }, keys[0], ct);
          });
        });
    }).then(function (plain) {
      var blob = new Blob([plain], { type: "application/pdf" });
      say("저장하는 중…");
      return filePut("hymnpdf", blob).then(function () { return blob; });
    });
  }
  function bindHymnPick() {
    var fin = document.getElementById("hyFileIn"); if (!fin) return;
    fin.onchange = function () {
      var f = this.files && this.files[0], msg = document.getElementById("hyMsg"); if (!f) return;
      msg.textContent = "확인하는 중…";
      loadPdfJs().then(function (lib) { return f.arrayBuffer().then(function (ab) { return lib.getDocument({ data: new Uint8Array(ab) }).promise; }); })
        .then(function (d) {
          if (d.numPages !== window.HYMN_PAGES) { msg.textContent = "「성가 2015」(" + window.HYMN_PAGES + "쪽) 파일이 아닙니다. (" + d.numPages + "쪽)"; return; }
          msg.textContent = "저장하는 중…";
          return filePut("hymnpdf", f).then(function () { hymnDoc = d; msg.textContent = "저장했습니다."; setTimeout(function () { renderHymnFile(f); }, 600); });
        }).catch(function () { msg.textContent = "파일을 읽지 못했습니다. 저장 공간이 부족한지 확인해 주세요."; });
    };
  }
  function hymnView(no) {
    var x = HYMN_BY[no];
    if (!x) { view.innerHTML = '<div class="empty">' + no + '장은 「성가 2015」에 없습니다.<br><br><a class="btn pri" href="#/hymn">성가 찾기로</a></div>'; return; }
    var nums = (window.HYMNS || []).map(function (y) { return y[0]; }), i = nums.indexOf(no);
    var prev = nums[i - 1], next = nums[i + 1], on = hymnMarks.indexOf(no) >= 0;
    setTop(no + "장 · 성가 2015", true);
    view.innerHTML = '<section class="card hy-head"><div class="hy-top"><div><b class="hy-big">' + no + '</b><span class="hy-t">' + esc(hymnTitle(x)) + "</span></div>" +
      '<button type="button" class="btn' + (on ? " pri" : "") + '" id="hyMark">📌 ' + (on ? "책갈피됨" : "책갈피") + "</button></div>" +
      (x[3].length > 1 ? '<div class="note" style="margin:2px 0 0">' + esc(x[3].slice(1).join(" · ")) + "</div>" : "") +
      '<div class="hy-nav">' + (prev ? '<a class="btn" href="#/hymn/' + prev + '">◀ ' + prev + "장</a>" : "<span></span>") +
      '<a class="btn" href="#/hymn">🔍 찾기</a>' + (next ? '<a class="btn" href="#/hymn/' + next + '">' + next + "장 ▶</a>" : "<span></span>") + "</div></section>" +
      '<div id="hyPages" class="hy-pages"><p class="note" style="text-align:center">악보를 여는 중…</p></div>' +
      '<p class="note" style="text-align:center">' + x[1] + (x[2] > x[1] ? "~" + x[2] : "") + "쪽 · 같은 쪽에 앞뒤 성가가 함께 실려 있을 수 있습니다.</p>";
    document.getElementById("hyMark").onclick = function () {
      var k = hymnMarks.indexOf(no); if (k >= 0) hymnMarks.splice(k, 1); else hymnMarks.push(no);
      save("hymnMarks", hymnMarks); var b = this, o = k < 0; b.classList.toggle("pri", o); b.textContent = "📌 " + (o ? "책갈피됨" : "책갈피");
    };
    openHymnDoc().then(function (d) {
      var box = document.getElementById("hyPages"); if (!box) return;
      if (!d) { box.innerHTML = '<section class="card"><p style="margin:0 0 8px">이 기기에 성가 파일이 아직 없습니다.</p><a class="btn pri" href="#/hymn">성가 파일 불러오기</a> <a class="btn" href="' + HYMN_SITE + 'searchhymn.html" target="_blank" rel="noopener">웹앱에서 보기 ↗</a></section>'; return; }
      box.innerHTML = "";
      var W = Math.min(1600, Math.round(box.clientWidth * (window.devicePixelRatio || 1)));
      (function draw(p) {
        if (p > x[2] || !document.getElementById("hyPages")) return;
        d.getPage(p).then(function (pg) {
          var v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: W / v0.width });
          var cv = document.createElement("canvas"); cv.width = v.width; cv.height = v.height; cv.className = "hy-page";
          box.appendChild(cv);
          var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
          return pg.render({ canvasContext: ctx, viewport: v }).promise;
        }).then(function () { draw(p + 1); });
      })(x[1]);
    });
  }
  function sites() {
    setTop("교구링크", false); setTab("sites");
    var h = secHead(7, "교구링크", "서울교구 홈페이지와 관련 사이트 바로가기");
    h += '<a class="hero-link" href="https://seoul.anglican.kr/" target="_blank" rel="noopener">대한성공회 서울교구 홈페이지 ↗</a>';
    var groups = [];
    window.SEOUL_SITES.forEach(function (s) { if (groups.indexOf(s[0]) < 0) groups.push(s[0]); });
    groups.forEach(function (g) {
      h += '<section class="card links"><h2>' + esc(g) + "</h2>" + window.SEOUL_SITES.filter(function (s) { return s[0] === g; }).map(function (s) { return ext(s[2], s[1], s[3] + " ↗"); }).join("") + "</section>";
    });
    h += aboutCard();
    view.innerHTML = h;
  }

  // 공동번역성서
  var BOOK_BY = {};
  (window.BIBLE_BOOKS || []).forEach(function (b) { BOOK_BY[b[1]] = b; BOOK_BY[b[2]] = b; BOOK_BY[b[0]] = b; });
  var DIV = [["old_testament", "구약"], ["deuterocanon", "외경(제2경전)"], ["new_testament", "신약"], ["liturgical", "전례용"]];
  function bibleUrl(b, ch, v) { return window.BIBLE_SITE + "/" + b[0] + (ch ? "/" + ch + (v ? "/" + v : "") : ""); }
  function parseRef(s) {
    var m = /^\s*([가-힣0-9a-z ]+?)\s*(\d+)?(?:\s*[:장,.]\s*(\d+(?:-\d+)?))?\s*절?\s*$/i.exec(s);
    if (!m) return null;
    var name = m[1].replace(/\s+/g, ""), b = BOOK_BY[name];
    function find(nm, num) {
      var c = window.BIBLE_BOOKS.filter(function (x) {
        var full = x[1].replace(/\s/g, ""), sh = x[2];
        if (num) return sh.charAt(0) === num && (full.indexOf(nm) === 0 || sh.slice(1).indexOf(nm.slice(0, 2)) === 0);
        return full.indexOf(nm) === 0 || sh.indexOf(nm) === 0;
      });
      return c.length === 1 ? c[0] : (c.filter(function (x) { return x[2] === nm || x[2].slice(1) === nm; })[0] || null);
    }
    if (!b) b = find(name);
    if (!b) {
      // 고린토전서 · 요한1서 · 사무엘상 · 1요한 같은 표기
      var n = /^(.+?)(전서|후서|상권?|하권?|[1-3]서|일서|이서|삼서)$/.exec(name), lead = /^([1-3])(.+)$/.exec(name);
      var map = { "전서": "1", "후서": "2", "상": "1", "상권": "1", "하": "2", "하권": "2", "1서": "1", "2서": "2", "3서": "3", "일서": "1", "이서": "2", "삼서": "3" };
      if (n) b = find(n[1], map[n[2]]);
      else if (lead) b = find(lead[2], lead[1]);
    }
    if (!b) return null;
    var ch = m[2] ? Math.min(+m[2], b[4]) : 0;
    return { b: b, ch: ch, v: ch && m[3] ? m[3] : "" };
  }
  function bible(bookId) {
    var b = bookId && BOOK_BY[bookId];
    if (b) {
      setTop(b[1], true); setTab("bible");
      var g = "";
      for (var i = 1; i <= b[4]; i++) g += '<a href="' + bibleUrl(b, i) + '" target="_blank" rel="noopener">' + i + "</a>";
      view.innerHTML = '<section class="card"><h2>' + esc(b[1]) + " · 장을 고르세요 (" + b[4] + "장)</h2>" +
        '<div class="grid chapters">' + g + "</div></section>" +
        '<p class="note">장을 누르면 대한성공회 공동번역성서(bible.anglican.kr)에서 본문이 열립니다.</p>';
      return;
    }
    setTop("공동번역성서", false); setTab("bible");
    var h = secHead(2, "공동번역성서", "매일의 본기도와 독서 · 성서 찾기 · 말씀 검색");
    h += lectHtml(1);
    h += '<section class="card"><h2>장절 바로가기</h2><div class="search-box" style="position:static;padding:0"><input id="ref" type="search" placeholder="예: 요한 3:16, 루가 17, 시편 23" autocomplete="off"></div><p id="refMsg" class="note" style="margin:8px 2px 0"></p></section>';
    h += '<section class="card"><h2>말씀 검색</h2><div class="search-box" style="position:static;padding:0"><input id="kw" type="search" placeholder="검색어 (예: 목자, 사랑, 평화)" autocomplete="off"></div>' +
      '<div class="acts" style="margin-top:10px"><a class="btn pri" id="kwGo" href="#" target="_blank" rel="noopener">성서에서 검색 ↗</a></div></section>';
    DIV.forEach(function (dv) {
      var list = window.BIBLE_BOOKS.filter(function (x) { return x[3] === dv[0]; });
      if (!list.length) return;
      h += "<details" + (dv[0] === "new_testament" ? " open" : "") + '><summary>' + dv[1] + " (" + list.length + "권)</summary>" +
        '<div class="grid books">' + list.map(function (x) { return '<a href="#/bible/' + x[0] + '">' + esc(x[1].replace(/(인들)?에게 보낸 /, " ")) + "</a>"; }).join("") + "</div></details>";
    });
    h += '<div style="height:14px"></div>' + lectHtml(2);
    h += '<p class="note">성서 본문과 전례독서는 대한성공회가 제공하는 공동번역성서 사이트(bible.anglican.kr)에서 열립니다. 인터넷 연결이 필요합니다.</p>';
    view.innerHTML = h; bindLect();
    var ref = document.getElementById("ref"), msg = document.getElementById("refMsg"), kw = document.getElementById("kw"), go = document.getElementById("kwGo");
    ref.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var r = parseRef(ref.value);
      if (!r) { msg.textContent = "책 이름을 찾지 못했습니다. 예: 요한 3:16, 창세 1, 시편 23"; return; }
      if (!r.ch) { location.hash = "#/bible/" + r.b[0]; return; }
      msg.innerHTML = '<a class="btn pri" href="' + bibleUrl(r.b, r.ch, r.v) + '" target="_blank" rel="noopener">' + esc(r.b[1]) + " " + r.ch + "장" + (r.v ? " " + esc(r.v) + "절" : "") + " 열기 ↗</a>";
      window.open(bibleUrl(r.b, r.ch, r.v), "_blank", "noopener");
    });
    function setKw() { go.href = window.BIBLE_SITE + "/search?q=" + encodeURIComponent(kw.value.trim()); }
    kw.oninput = setKw; setKw();
    kw.addEventListener("keydown", function (e) { if (e.key === "Enter" && kw.value.trim()) window.open(go.href, "_blank", "noopener"); });
    go.addEventListener("click", function (e) { if (!kw.value.trim()) { e.preventDefault(); kw.focus(); } });
  }
  function tocList(items) {
    return items.map(function (m) {
      if (m[2]) return "<details><summary>" + esc(m[0]) + '</summary><ul class="list">' + link(m[1], m[0] + " (안내)") + "</ul>" + tocList(m[2]) + "</details>";
      return '<ul class="list">' + link(m[1], m[0]) + "</ul>";
    }).join("");
  }
  function toc() {
    setTop("전체 목차", false); setTab("toc");
    view.innerHTML = '<section class="card">' + tocList(window.MENU) + "</section>";
  }
  function page(id) {
    var c = CONTENT[id];
    setTop(titleOf(id), true, id); setTab("");
    if (!c || !c.h) {
      view.innerHTML = '<div class="empty">이 페이지 내용이 앱에 아직 없습니다.<br><br><a class="btn pri" href="' + window.SITE + "/" + esc(id) + '" target="_blank" rel="noopener">웹사이트에서 보기 ↗</a></div>';
    } else {
      view.innerHTML = '<article class="reader">' + renderPageHtml(c.h) + '</article><p class="source">출처: <a href="' + window.SITE + "/" + esc(id) + '" target="_blank" rel="noopener">성공회사목예식서 웹사이트</a>' + (window.CONTENT_DATE ? " · " + window.CONTENT_DATE + " 기준" : "") +
        (INFO.contact ? ' · <a href="' + mailto("오류 신고: " + titleOf(id), "■ 기도문: " + titleOf(id) + " (" + id + ")\n■ 고칠 곳과 내용:\n\n■ 보내는 분 (교회/이름, 선택):\n") + '">이 페이지 오류 신고</a>' : "") + "</p>";
    }
    recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 20); save("recent", recent);
    reading = true; wake();
  }

  // full-text search
  var INDEX = null;
  function buildIndex() {
    if (INDEX) return INDEX;
    var div = document.createElement("div");
    INDEX = Object.keys(CONTENT).map(function (id) {
      div.innerHTML = CONTENT[id].h.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div)>/gi, " ");
      return { id: id, title: titleOf(id), text: div.textContent.replace(/\s+/g, " ") };
    });
    return INDEX;
  }
  function search(q) {
    setTop("기도문 검색", true); setTab("home");
    view.innerHTML = '<div class="search-box"><input id="q" type="search" placeholder="기도문·시편·제목 검색 (예: 주님의 기도, 시편 23)" value="' + esc(q || "") + '" autocomplete="off"></div><div id="res"></div>';
    var input = document.getElementById("q"), res = document.getElementById("res"), t;
    function run() {
      var s = input.value.trim();
      history.replaceState(null, "", "#/search" + (s ? "?q=" + encodeURIComponent(s) : ""));
      if (s.length < 2) { res.innerHTML = '<div class="empty">두 글자 이상 입력하세요.</div>'; return; }
      // 띄어쓰기를 무시하고 찾기 (주의기도 = 주의 기도)
      var rx = new RegExp(s.replace(/\s+/g, "").split("").map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("\\s*"), "i");
      var out = [];
      buildIndex().forEach(function (e) {
        var inTitle = rx.test(e.title), m = rx.exec(e.text), i = m ? m.index : -1;
        if (inTitle || i >= 0) out.push({ e: e, i: i, w: inTitle ? 0 : 1 });
      });
      out.sort(function (a, b) { return a.w - b.w; });
      if (!out.length) { res.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>'; return; }
      res.innerHTML = '<p class="note" style="margin:0 4px 6px">' + out.length + "개 페이지</p>" + out.slice(0, 80).map(function (o) {
        var snip = "";
        if (o.i >= 0) {
          var a = Math.max(0, o.i - 30), part = o.e.text.substr(a, 110);
          snip = (a ? "…" : "") + esc(part).replace(new RegExp(rx.source, "gi"), function (m) { return "<mark>" + m + "</mark>"; }) + "…";
        }
        return '<a class="hit" href="#/p/' + o.e.id + '"><b>' + esc(o.e.title) + "</b><span>" + snip + "</span></a>";
      }).join("");
    }
    input.oninput = function () { clearTimeout(t); t = setTimeout(run, 200); };
    run(); if (!q) input.focus();
  }

  // church directory
  function telHref(t) { var m = /[0-9][0-9)\-\s]{6,}/.exec(t || ""); return m ? "tel:" + m[0].replace(/[)\s]/g, "-").replace(/-+/g, "-").replace(/-$/, "") : ""; }
  function church(dio, q) {
    setTop("교회찾기", false); setTab("church");
    dio = dio || load("dio", "seoul");
    var D = window.DIOCESES.filter(function (d) { return d.id !== "province"; });
    var h = secHead(6, "교회찾기", "서울교구 조직 연락처 · 교구별 교회 주소록");
    h += '<details class="card" style="padding:0 16px"><summary>서울교구 조직 (' + window.SEOUL_ORG.length + "개 부서)</summary>" +
      window.SEOUL_ORG.map(function (o) {
        return '<div class="org"><b>' + esc(o[0]) + "</b><span>" + esc(o[1]) + "</span>" + (o[4] ? "<span>" + esc(o[4]) + "</span>" : "") +
          '<div class="acts" style="flex:1 1 100%;display:flex;gap:6px;flex-wrap:wrap">' +
          (o[2] ? '<a class="btn" href="' + telHref(o[2]) + '">전화 ' + esc(o[2]) + "</a>" : "") +
          (o[3] ? '<a class="btn" href="mailto:' + esc(o[3]) + '">메일</a>' : "") + "</div></div>";
      }).join("") + "</details>";
    h += '<div class="grp" style="margin-top:6px">교회 주소록</div><div class="chips">' + '<button data-d="all"' + (dio === "all" ? ' class="on"' : "") + ">전체</button>" +
      D.map(function (d) { return '<button data-d="' + d.id + '"' + (dio === d.id ? ' class="on"' : "") + ">" + d.name + "</button>"; }).join("") + "</div>";
    h += '<div class="search-box"><input id="cq" type="search" placeholder="교회 이름, 지역, 사제 이름으로 검색" value="' + esc(q || "") + '" autocomplete="off"></div><div id="dioCard"></div><div id="clist"></div>';
    h += '<p class="note">교회 정보는 서울교구 주소록과 대한성공회 관구 전국 교회 주소록(' + window.CHURCH_DATE + ' 수집)을 바탕으로 합니다. 변동이 있을 수 있으니 방문 전 각 교회나 교구에 확인하세요.</p>';
    view.innerHTML = h;
    var input = document.getElementById("cq");
    function draw() {
      var s = input.value.trim().toLowerCase();
      var d = window.DIOCESES.filter(function (x) { return x.id === dio; })[0];
      var dc = "";
      if (d) {
        dc = '<section class="card"><div class="dio"><div><b>대한성공회 ' + esc(d.name) + "</b><p>" + esc(d.note) + "</p><p>" + esc(d.addr) + "</p></div></div>" +
          '<div class="ch acts" style="border:0;padding:12px 0 0;margin:0;background:none">' +
          (d.web ? '<a class="btn pri" href="' + esc(d.web) + '" target="_blank" rel="noopener">교구 홈페이지 ↗</a>' : "") +
          (d.dir ? '<a class="btn" href="' + esc(d.dir) + '" target="_blank" rel="noopener">웹 주소록 ↗</a>' : "") +
          (d.tel ? '<a class="btn" href="' + telHref(d.tel) + '">전화 ' + esc(d.tel) + "</a>" : "") + "</div></section>";
      } else {
        dc = '<section class="card links">' + ext("https://anglicankr.church/", "대한성공회 관구 홈페이지") + ext("https://seoul.anglican.kr/", "서울교구 홈페이지") + ext("https://daejeon.anglican.kr/", "대전교구 홈페이지") + "</section>";
      }
      document.getElementById("dioCard").innerHTML = dc;
      var rows = window.CHURCHES.filter(function (c) {
        if (dio !== "all" && c[0] !== dio) return false;
        return !s || (c[1] + " " + c[2] + " " + c[3] + " " + c[4] + " " + c[6]).toLowerCase().indexOf(s) >= 0;
      });
      var out = "", last = "";
      rows.forEach(function (c) {
        var dn = window.DIOCESES.filter(function (x) { return x.id === c[0]; })[0].name;
        var g = (dio === "all" ? dn + " · " : "") + c[1];
        if (g !== last) { out += '<div class="grp">' + esc(g) + "</div>"; last = g; }
        var map = c[3] ? "https://map.naver.com/p/search/" + encodeURIComponent(c[3]) : "";
        out += '<div class="ch"><h3>' + esc(c[2]) + "</h3>" + (c[6] ? '<div class="pr">' + esc(c[6]) + "</div>" : "") +
          (c[3] ? '<div class="ad">' + esc(c[3]) + "</div>" : '<div class="ad" style="color:var(--muted)">주소 정보 없음</div>') + '<div class="acts">' +
          (c[5] ? '<a class="btn pri" href="' + esc(c[5]) + '" target="_blank" rel="noopener">홈페이지 ↗</a>' : "") +
          (c[4] ? '<a class="btn" href="' + telHref(c[4]) + '">전화 ' + esc(c[4]) + "</a>" : "") +
          (map ? '<a class="btn" href="' + map + '" target="_blank" rel="noopener">지도</a>' : "") + "</div></div>";
      });
      document.getElementById("clist").innerHTML = '<p class="note" style="margin:6px 4px">' + rows.length + "개 교회</p>" + (out || '<div class="empty">검색 결과가 없습니다.</div>');
    }
    view.querySelectorAll(".chips button").forEach(function (b) {
      b.onclick = function () { dio = b.dataset.d; save("dio", dio); view.querySelectorAll(".chips button").forEach(function (x) { x.classList.toggle("on", x === b); }); history.replaceState(null, "", "#/church?d=" + dio); draw(); };
    });
    var t; input.oninput = function () { clearTimeout(t); t = setTimeout(draw, 150); };
    draw();
  }

  function more() {
    setTop("즐겨찾기", false); setTab("more");
    var h = '<section class="card"><h2>즐겨찾기</h2>' + (stars.length ? '<ul class="list">' + stars.map(function (id) { return link(id); }).join("") + "</ul>" : '<p class="note" style="margin:0">기도문 화면 오른쪽 위 ☆ 를 누르면 여기에 모입니다.</p>') + "</section>";
    h += '<section class="card"><h2>최근 본 기도문</h2>' + (recent.length ? '<ul class="list">' + recent.slice(0, 10).map(function (id) { return link(id); }).join("") + "</ul>" : '<p class="note" style="margin:0">아직 없습니다.</p>') + "</section>";
    h += '<section class="card links"><h2>바로가기</h2>' + ext("https://seoul.anglican.kr/", "서울교구 홈페이지") + ext("https://book-of-prayer.imweb.me/", "성공회사목예식서 웹사이트") +
      ext("https://bible.anglican.kr/lectionary", "전례독서") + ext("https://bible.anglican.kr/", "공동번역성서") + "</section>";
    h += '<p class="note">본문 기준일: ' + esc(window.CONTENT_DATE || "-") + " · 인터넷 연결 없이도 기도문을 볼 수 있습니다.</p>";
    view.innerHTML = h;
  }

  // ---------- router ----------
  function route() {
    var hash = location.hash.replace(/^#\/?/, ""), parts = hash.split("?"), path = parts[0].split("/"), qs = {};
    (parts[1] || "").split("&").forEach(function (kv) { if (kv) { var p = kv.split("="); qs[p[0]] = decodeURIComponent(p[1] || ""); } });
    reading = false; lectOff = 0;
    var goAbout = path[0] === "sites" && qs.about;
    if (path[0] === "p" && path[1]) page(path[1]);
    else if (path[0] === "toc") toc();
    else if (path[0] === "search") search(qs.q);
    else if (path[0] === "church") church(qs.d, qs.q);
    else if (path[0] === "lect") bible();
    else if (path[0] === "sites") sites();
    else if (path[0] === "hymn") hymn(path[1], qs);
    else if (path[0] === "soul") soul();
    else if (path[0] === "note") noteView(path[1], qs.d, qs.q);
    else if (path[0] === "bible") bible(path[1]);
    else home();
    wake();
    document.getElementById("fontPanel").hidden = true;
    var about = goAbout && document.getElementById("about");
    if (about) about.scrollIntoView(); else window.scrollTo(0, 0);
  }
  // 아래 탭 이름이 칸을 넘치면(큰 글씨 설정 등) 짧은 이름으로 바꿈
  function fitTabs() {
    var spans = document.querySelectorAll(".tabs a span[data-short]");
    Array.prototype.forEach.call(spans, function (s) { if (!s.dataset.full) s.dataset.full = s.textContent; s.textContent = s.dataset.full; });
    var over = Array.prototype.some.call(spans, function (s) { return s.scrollWidth > s.clientWidth + 1; });
    if (over) Array.prototype.forEach.call(spans, function (s) { s.textContent = s.dataset.short; });
  }
  fitTabs();
  window.addEventListener("resize", fitTabs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTabs);
  window.addEventListener("hashchange", route);
  applyPrefs();
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
