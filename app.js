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
  var prefs = load("prefs", { fs: 1, dark: null, wake: true });
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
    h += todayCard();
    h += '<section class="card"><h2>예식서</h2><div class="grid">' +
      window.HOME_TILES.map(function (t) { return '<a href="#/p/' + t[1] + '">' + esc(t[0]) + "</a>"; }).join("") + "</div>" +
      '<a class="hero-link" style="margin:12px 0 0;text-align:center" href="#/toc">전체 목차 보기 ›</a></section>';
    if (stars.length) h += '<section class="card"><h2>즐겨찾기</h2><ul class="list">' + stars.map(function (id) { return link(id); }).join("") + "</ul></section>";
    if (recent.length) h += '<section class="card"><h2>최근 본 기도문</h2><ul class="list">' + recent.slice(0, 5).map(function (id) { return link(id); }).join("") + "</ul></section>";
    h += '<p class="note">기도문 화면 오른쪽 위 ☆ 를 누르면 즐겨찾기에 모입니다. 기도서는 인터넷 연결 없이도 볼 수 있습니다' + (window.CONTENT_DATE ? " (" + esc(window.CONTENT_DATE) + " 기준)" : "") + ".<br>" +
      '앱 관리: ' + esc(INFO.manager || "") + ' · <a href="#/sites?about=1" style="color:inherit">수정·추가 요청하기</a></p>';
    view.innerHTML = h;
    bindInstall();
    document.getElementById("hq").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && this.value.trim()) location.hash = "#/search?q=" + encodeURIComponent(this.value.trim());
    });
  }

  // ② 매일의 본기도와 독서
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function lectHtml(part) {
    var d = new Date(), wd = "일월화수목금토";
    var days = [-1, 0, 1, 2, 3, 4, 5].map(function (k) { var x = new Date(d); x.setDate(d.getDate() + k); return x; });
    var h = '<section class="card today"><h2>매일의 본기도와 독서</h2><div class="date">' + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + wd[d.getDay()] + ")</div>" +
      '<div class="row"><a href="' + window.BIBLE_SITE + "/lectionary/" + ymd(d) + '" target="_blank" rel="noopener">오늘의 본기도와 독서 ↗</a></div>' +
      "<small>본기도 · 제1독서 · 성시 · 복음이 교회력에 맞추어 표시됩니다.</small></section>";
    if (part === 1) return h;
    h = '<section class="card"><h2>날짜별 본기도와 독서</h2><div class="grid">' + days.map(function (x, i) {
      return '<a href="' + window.BIBLE_SITE + "/lectionary/" + ymd(x) + '" target="_blank" rel="noopener">' + (i === 1 ? "오늘" : (x.getMonth() + 1) + "/" + x.getDate()) + " (" + wd[x.getDay()] + ")</a>";
    }).join("") + '<a href="' + window.BIBLE_SITE + '/calendar" target="_blank" rel="noopener">교회력 달력</a></div></section>';
    h += '<section class="card"><h2>기도서의 본기도 (앱 안에서 보기)</h2><ul class="list">' +
      link("e3l3s39q", "본기도 선택") + link("1qxwr9lz", "대림절") + link("6rlkb3qz", "성탄절") + link("acxd52l7", "사순절 1-3") +
      link("mwfjr33w", "부활절 1-4") + link("81bxjzit", "연중시기 1-5") + link("adelb742", "주요축일 1-6월") + link("acnk27tn", "주요축일 7-12월") +
      link("3hfyqln6", "성인축일") + link("486uh1jn", "월별축일표") + link("8fob4b3f", "간구기도") + "</ul>" +
      '<a class="hero-link" style="margin:10px 0 0;text-align:center" href="#/toc">모든 본기도 목록은 전체 목차에서 ›</a></section>';
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
  function sites() {
    setTop("교구링크", false); setTab("sites");
    var h = secHead(4, "교구링크", "서울교구 홈페이지와 관련 사이트 바로가기");
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
    view.innerHTML = h;
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
    var h = secHead(3, "교회찾기", "서울교구 조직 연락처 · 교구별 교회 주소록");
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
    reading = false;
    var goAbout = path[0] === "sites" && qs.about;
    if (path[0] === "p" && path[1]) page(path[1]);
    else if (path[0] === "toc") toc();
    else if (path[0] === "search") search(qs.q);
    else if (path[0] === "church") church(qs.d, qs.q);
    else if (path[0] === "lect") bible();
    else if (path[0] === "sites") sites();
    else if (path[0] === "bible") bible(path[1]);
    else home();
    wake();
    document.getElementById("fontPanel").hidden = true;
    var about = goAbout && document.getElementById("about");
    if (about) about.scrollIntoView(); else window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  applyPrefs();
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
