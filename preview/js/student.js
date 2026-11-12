/*
 * Schedule Sandbox – student screen.
 * Reads the published timetable (data/timetable-data.js), or an admin preview
 * saved in this browser, and lets the student build a weekly timetable.
 */
(function () {
  'use strict';

  const S = window.Schedule;
  const site = window.Site;
  const PREVIEW_KEY = site.key('adminPreview.v1');
  const BLOCKS = (S.DAY_END - S.DAY_START) / 90; // 8 blocks of 1h30
  const SPAN = S.DAY_END - S.DAY_START;

  // Course colours from the brand book's program palette: [stripe, light tint]
  const COLORS = [
    ['#0061FF', '#E5EFFF'], ['#946FF1', '#F0EAFE'], ['#6CC9CC', '#E2F5F5'], ['#5C8AF6', '#E6EEFE'],
    ['#64C5B8', '#E1F4F1'], ['#655FC4', '#E9E8F8'], ['#54B5D3', '#E1F2F8'], ['#B78BFC', '#F4EEFF'],
    ['#05217F', '#E2E6F2'], ['#5744DE', '#E9E6FB'],
  ];

  /* ---------- Storage (wrapped: private windows can block it) ---------- */

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function forget(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------- Data ---------- */

  let source = window.SCHEDULE_DATA || { rows: [] };
  const previewNotes = [];
  const preview = load(PREVIEW_KEY);
  if (preview && Array.isArray(preview.rows)) {
    source = preview;
    const when = preview.generatedAt ? new Date(preview.generatedAt).toLocaleString() : '';
    previewNotes.push(`the timetable uploaded on the admin page (“${preview.source || 'file'}”, ${when})`);
  }
  const data = S.buildDataset(source.rows || [], source.referenceWeeks);

  // Exam calendar: published file, or an admin preview saved in this browser.
  const EXAM_PREVIEW_KEY = site.key('examPreview.v1');
  const E = window.Exams;
  let examSource = window.EXAM_DATA || { periods: [], exams: [] };
  const examPreview = load(EXAM_PREVIEW_KEY);
  if (examPreview && Array.isArray(examPreview.exams)) {
    examSource = examPreview;
    const when = examPreview.generatedAt ? new Date(examPreview.generatedAt).toLocaleString() : '';
    previewNotes.push(`the exam calendar uploaded on the admin page (“${examPreview.source || 'file'}”, ${when})`);
  }
  const examLink = E.linkExams(examSource, data.courses);
  if (previewNotes.length) {
    document.getElementById('preview-text').textContent =
      `Preview: you are seeing ${previewNotes.join(' and ')}. Only this browser sees it.`;
    document.getElementById('preview-notice').hidden = false;
  }
  // Choices made while previewing are kept apart, so they never replace the real ones.
  const STORE_KEY = site.key(source === preview ? 'student.preview.v1' : 'student.v1');

  /* ---------- State ---------- */

  const saved = load(STORE_KEY) || {};

  // A course with one section gets it straight away; with several, the student must pick one.
  function firstOption(course) {
    return course.options.length === 1 ? course.options[0].id : '';
  }
  // A draft is called "Draft name" until the student renames it (owner's choice).
  const DEFAULT_DRAFT = 'Draft name';
  const todayIdx = (new Date().getDay() + 6) % 7;
  const state = {
    // Drafts: named scenarios the student can switch between. Each keeps its own courses.
    drafts: [],          // [{ id, name, selections }]
    draftId: '',
    selections: new Map(), // the active draft's: course code -> { option: id ('' until picked), color: index }, in the order added
    search: '',
    programme: '',
    unit: '',
    day: todayIdx < 5 ? todayIdx : 0,
    view: 'courses',
    // A course with several sections whose card shows "Choose your section" before it is
    // added: it moves to Your courses only once a section is picked. Not saved.
    picking: '',
    // The added course whose section dropdown is open in Your courses. Not saved.
    open: '',
    // The section being tried on the timetable while pointing at it: { code, option }. Not saved.
    preview: null,
  };

  function restoreSelections(list) {
    const map = new Map();
    (list || []).forEach(([code, sel]) => {
      const course = data.byCode.get(code);
      if (!course || !course.options.length || !sel) return;
      const option = course.options.some(o => o.id === sel.option) ? sel.option : firstOption(course);
      map.set(code, { option, color: Number(sel.color) || 0 });
    });
    return map;
  }
  // Saves from before drafts existed (a single "selections" list) become "Draft 1".
  const savedDrafts = Array.isArray(saved.drafts) && saved.drafts.length
    ? saved.drafts
    : [{ id: 'd1', name: DEFAULT_DRAFT, selections: saved.selections }];
  state.drafts = savedDrafts.map(d => ({ id: String(d.id), name: String(d.name || 'Draft'), selections: restoreSelections(d.selections) }));
  state.draftId = (state.drafts.find(d => d.id === saved.draftId) || state.drafts[0]).id;
  state.selections = currentDraft().selections;

  function currentDraft() {
    return state.drafts.find(d => d.id === state.draftId);
  }
  if (saved.programme && data.programmes.some(p => p.code === saved.programme)) state.programme = saved.programme;
  if (saved.unit && data.units.some(u => u.code === saved.unit)) state.unit = saved.unit;

  function persist() {
    save(STORE_KEY, {
      drafts: state.drafts.map(d => ({ id: d.id, name: d.name, selections: [...d.selections] })),
      draftId: state.draftId,
      programme: state.programme,
      unit: state.unit,
    });
  }

  /* ---------- Helpers ---------- */

  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fold(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function timeRange(s) {
    return S.formatTime(s.start) + '–' + S.formatTime(s.end);
  }

  function courseTitle(course) {
    return (course.acronym || course.name).replace(/_/g, ' ');
  }

  // "T1" rather than "T T1"; "TP PL1" style only when the name doesn't say it.
  function sectionLabel(s) {
    return s.sectionName.toUpperCase().startsWith(s.typ) ? s.sectionName : `${s.typ} ${s.sectionName}`;
  }

  // Every added course, in the order added; option is null until a section is picked.
  function allEntries() {
    return [...state.selections].map(([code, sel]) => {
      const course = data.byCode.get(code);
      const option = course.options.find(o => o.id === sel.option) || null;
      const color = COLORS[sel.color % COLORS.length];
      return { course, option, color };
    });
  }

  // Courses with a section picked: the ones on the timetable, in overlaps and exams.
  function entries() {
    return allEntries().filter(e => e.option);
  }

  // One grid per trimester (one grid with everything if the file has no dates).
  function shownTerms() {
    return data.terms.length ? data.terms : [null];
  }

  // Each trimester grid shows its reference week only (chosen on the admin page).
  const refWeeks = data.terms.map(t => t.ref).filter(Boolean);
  const inRefWeeks = refWeeks.length ? w => refWeeks.includes(w) : () => true;

  function inTermOf(term) {
    return session => !term || (term.ref ? session.weekSet.has(term.ref) : S.inTerm(session, term));
  }

  function clashesIn(term, clashes) {
    if (!term) return clashes;
    return clashes.filter(c => c.weeks.some(w => term.ref ? w === term.ref : w >= term.start && w <= term.end));
  }

  // Overlaps count only in the reference weeks (what students see on the grids).
  function refOverlap(a, b) {
    return S.sessionsOverlap(a, b) && S.sharedWeeks(a, b).some(inRefWeeks);
  }

  // A section's classes as listed on its card: those in a reference week, one line per slot.
  function shownSessions(option) {
    const inRef = option.sessions.filter(s => s.weeks.some(inRefWeeks));
    const seen = new Set();
    return (inRef.length ? inRef : option.sessions).filter(s => {
      const key = [s.day, s.start, s.end, s.sectionName, s.room].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // A section's weekly hours on one line, days with the same hours together:
  // "Mon, Wed 09:30–11:00; Thu 15:30–17:00".
  function slotText(option) {
    const groups = new Map();
    shownSessions(option).slice().sort((a, b) => a.day - b.day || a.start - b.start).forEach(s => {
      const hours = timeRange(s);
      if (!groups.has(hours)) groups.set(hours, []);
      const day = S.WEEKDAYS_SHORT[s.day];
      if (!groups.get(hours).includes(day)) groups.get(hours).push(day);
    });
    return [...groups].map(([hours, days]) => `${days.join(', ')} ${hours}`).join('; ');
  }

  // "Trimester 1" for T1, "Semester 1" for S1 (the period filter's names, without the code).
  const unitNames = new Map(data.units.map(u => [u.code, u.label.replace(/\s*\(.*\)$/, '')]));

  // All overlapping pairs between different selected courses.
  function findClashes(list) {
    const clashes = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        list[i].option.sessions.forEach(a => {
          list[j].option.sessions.forEach(b => {
            if (refOverlap(a, b)) {
              clashes.push({ x: list[i], y: list[j], a, b, weeks: S.sharedWeeks(a, b).filter(inRefWeeks) });
            }
          });
        });
      }
    }
    return clashes;
  }

  function optionFits(course, option, list) {
    return !list.some(e => e.course !== course && e.option.sessions.some(b => option.sessions.some(a => refOverlap(a, b))));
  }

  /* ---------- Actions ---------- */

  // Adds a course with the given section. A course with several sections and no section
  // given is not added yet: its card asks for the section first (see startPicking).
  function addCourse(code, optionId) {
    const course = data.byCode.get(code);
    if (!course || state.selections.has(code) || !course.options.length) return;
    const option = course.options.some(o => o.id === optionId) ? optionId : firstOption(course);
    if (!option) { startPicking(code); return; }
    state.selections.set(code, { option, color: freeColor() });
    state.picking = '';
    state.preview = null;
    update();
  }

  // The first course colour not used in this draft yet.
  function freeColor() {
    const used = new Set([...state.selections.values()].map(s => s.color % COLORS.length));
    let color = 0;
    while (used.has(color) && color < COLORS.length) color++;
    return color < COLORS.length ? color : state.selections.size % COLORS.length;
  }

  // Opens the list of sections on the course's card and puts the keyboard focus on it.
  function startPicking(code) {
    state.picking = code;
    state.open = '';
    state.preview = null;
    update();
    const first = document.querySelector('.course-card.picking .sec');
    if (first) {
      first.closest('.course-card').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      first.focus({ preventScroll: true });
    }
  }

  function removeCourse(code) {
    state.selections.delete(code);
    if (state.open === code) state.open = '';
    state.preview = null;
    update();
  }

  function setOption(code, id) {
    const sel = state.selections.get(code);
    if (!sel) return;
    sel.option = id;
    state.open = '';
    state.preview = null;
    update();
    const btn = document.querySelector(`.tile[data-code="${CSS.escape(code)}"] .dd-btn`);
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ---------- Drafts ---------- */

  const MAX_DRAFTS = 10;

  function switchDraft(id) {
    state.draftId = id;
    state.selections = currentDraft().selections;
    state.picking = state.open = '';
    state.preview = null;
    update();
  }

  // "Draft name", then "Draft name 2", "Draft name 3"… so two drafts never share a name.
  function nextDraftName() {
    let name = DEFAULT_DRAFT;
    for (let n = 2; state.drafts.some(d => d.name === name); n++) name = `${DEFAULT_DRAFT} ${n}`;
    return name;
  }

  // A new empty draft, or a copy of the current one.
  function newDraft(copy) {
    if (state.drafts.length >= MAX_DRAFTS) { alert(`You can keep up to ${MAX_DRAFTS} drafts. Delete one first.`); return; }
    const selections = copy ? new Map([...state.selections].map(([k, v]) => [k, Object.assign({}, v)])) : new Map();
    const name = copy ? `${currentDraft().name} (copy)`.slice(0, 30) : nextDraftName();
    const id = 'd' + Date.now().toString(36);
    state.drafts.push({ id, name, selections });
    switchDraft(id);
  }

  function renameDraft() {
    const draft = currentDraft();
    const name = prompt('Name this draft (for example “Plan A” or “Finance electives”):', draft.name);
    if (name === null || !name.trim()) return;
    draft.name = name.trim().slice(0, 30);
    update();
  }

  function deleteDraft() {
    const draft = currentDraft();
    if (!confirm(`Delete “${draft.name}” and its courses?`)) return;
    state.drafts = state.drafts.filter(d => d !== draft);
    if (!state.drafts.length) state.drafts.push({ id: 'd' + Date.now().toString(36), name: DEFAULT_DRAFT, selections: new Map() });
    switchDraft(state.drafts[0].id);
  }

  function renderDrafts() {
    $('draft-name').textContent = currentDraft().name;
    $('draft-menu').innerHTML =
      `<div class="dm-title">Your drafts</div>` +
      state.drafts.map(d => `<button role="menuitemradio" aria-checked="${d.id === state.draftId}" data-draft="${esc(d.id)}">` +
        `<span class="dm-check">${d.id === state.draftId ? '✓' : ''}</span>${esc(d.name)} <small>· ${d.selections.size} course${d.selections.size === 1 ? '' : 's'}</small></button>`).join('') +
      `<hr><button role="menuitem" data-act="new">+ New empty draft</button>` +
      `<button role="menuitem" data-act="copy">Duplicate this draft</button>` +
      `<button role="menuitem" data-act="rename">Rename this draft</button>` +
      `<button role="menuitem" data-act="delete">Delete this draft</button>`;
  }

  function toggleDraftMenu(open) {
    const menu = $('draft-menu');
    menu.hidden = !open;
    $('draft-stamp').setAttribute('aria-expanded', String(open));
    if (!open) return;
    // Open towards the side with room: on phones the stamp wraps to the left edge.
    menu.style.left = '';
    menu.style.right = '';
    const r = menu.getBoundingClientRect();
    if (r.left < 8) { menu.style.left = '0'; menu.style.right = 'auto'; }
    else if (r.right > document.documentElement.clientWidth - 8) { menu.style.right = '0'; menu.style.left = 'auto'; }
  }

  /* ---------- Rendering: course list ---------- */

  function renderFilters() {
    // The undergraduate page has no Program filter (search and period only).
    if ($('programme')) {
      $('programme').innerHTML = '<option value="">All programs</option>' +
        data.programmes.map(p => `<option value="${esc(p.code)}">${esc(p.label)}</option>`).join('');
      $('programme').value = state.programme;
    } else {
      state.programme = '';
    }
    $('unit').innerHTML = '<option value="">All periods</option>' +
      data.units.map(u => `<option value="${esc(u.code)}">${esc(u.label)}</option>`).join('');
    $('unit').value = state.unit;
  }

  // The course list holds the courses not added yet; added ones are tiles in Your courses.
  function renderList(list) {
    const q = fold(state.search.trim());
    const matches = c =>
      (!q || fold(`${c.name} ${c.acronym} ${c.code}`).includes(q)) &&
      (!state.programme || c.programmes.includes(state.programme)) &&
      (!state.unit || c.units.includes(state.unit));

    // The course whose section is being picked stays where it is in the list (owner's choice);
    // it moves to Your courses once a section is picked.
    if (state.selections.has(state.picking)) state.picking = '';
    const rest = data.courses.filter(c => !state.selections.has(c.code) && (matches(c) || c.code === state.picking));
    $('course-list').innerHTML = `<div class="list-divider">All courses · ${rest.length}</div>` +
      (rest.map(c => cardHtml(c, list)).join('') ||
        `<p class="cc-meta" style="padding:4px">No other courses match your search or filters.</p>`);
  }

  // The sections of a course as a list of one-line buttons. Pointing at one (or moving to it
  // with the keyboard) tries it on the timetable; clicking keeps it.
  function optionsHtml(course, current, list) {
    return `<div class="sec-list" role="group" aria-label="Sections of ${esc(course.name)}">` +
      course.options.map(o => {
        const on = o.id === current;
        const fits = optionFits(course, o, list);
        return `<button type="button" class="sec${on ? ' on' : ''}${fits ? '' : ' bad'}" data-opt="${esc(o.id)}" aria-pressed="${on}">` +
          `<span class="ol"><b>${esc(o.label)}</b> ${esc(slotText(o))}</span>` +
          `<small>${on ? 'chosen' : fits ? '✓ fits' : '⚠ overlaps'}</small></button>`;
      }).join('') + '</div>';
  }

  // A course not added yet: its name, "+ Add" and one short line (period, sections).
  function cardHtml(course, list) {
    // "+ Add" on a course with several sections: pick the section here; the course is added on pick.
    if (state.picking === course.code) {
      return `<article class="course-card picking" data-code="${esc(course.code)}">
        <div class="cc-head">
          <h3>${esc(course.name)}</h3>
          <button class="add-btn" data-act="cancel" aria-label="Cancel adding ${esc(course.name)}">Cancel</button>
        </div>
        <div class="cc-body"><span class="dd-label">Choose your section</span>${optionsHtml(course, '', list)}</div></article>`;
    }
    const periods = course.units.map(u => unitNames.get(u) || u).join(' / ');
    const n = course.options.length;
    const what = n === 1 ? slotText(course.options[0]) : `${n} sections`;
    return `<article class="course-card" draggable="true" data-code="${esc(course.code)}">
      <div class="cc-head">
        <h3>${esc(course.name)}</h3>
        <button class="add-btn" data-act="add" aria-label="Add ${esc(course.name)}">+ Add</button>
      </div>
      <div class="cc-meta">${esc([periods, what].filter(Boolean).join(' · '))}</div></article>`;
  }

  /* ---------- Rendering: Your courses (tiles above the timetable) ---------- */

  // One small tile per added course, in the course colour: short name, full name, section
  // (a dropdown when the course has several), exam dates, overlap warning, × to remove.
  function renderMine(list, clashes) {
    const added = allEntries().map(a => list.find(e => e.course === a.course) || a);
    $('mine-bar').textContent = `Your courses · ${added.length}`;
    if (state.open && !state.selections.has(state.open)) state.open = '';
    $('mine').innerHTML = added.length
      ? `<div class="tiles">${added.map(e => tileHtml(e, list, clashes)).join('')}</div>`
      : `<p class="mine-empty">None yet. Press “+ Add” on a course in the list.</p>`;
    // An open dropdown that would run off the right edge opens towards the left instead.
    const pop = document.querySelector('.tile.open .sec-list');
    if (pop && pop.getBoundingClientRect().right > document.documentElement.clientWidth - 8) pop.parentNode.classList.add('to-left');
  }

  function tileHtml(entry, list, clashes) {
    const course = entry.course;
    const open = state.open === course.code;
    const mine = clashes.filter(c => c.x === entry || c.y === entry);
    const others = [...new Set(mine.map(c => (c.x === entry ? c.y : c.x).course.name))];
    const hours = entry.option ? slotText(entry.option) : '';

    let section;
    if (!entry.option) {
      // Older saves, or a section that disappeared from the data: the section must be picked again.
      section = `<button type="button" class="dd-btn pending" data-act="toggle" aria-expanded="${open}"><span>Choose a section…</span><i aria-hidden="true"></i></button>`;
    } else if (course.options.length > 1) {
      section = `<button type="button" class="dd-btn" data-act="toggle" aria-expanded="${open}" title="${esc(hours)}" aria-label="Section of ${esc(course.name)}: ${esc(entry.option.label)}. Change section"><span>${esc(entry.option.label)}</span><i aria-hidden="true"></i></button>`;
    } else {
      section = `<span class="one" title="${esc(hours)}">${esc(entry.option.label)}</span>`;
    }

    // Exam dates (with ⚠ when another of your exams is the same day).
    const myExams = entry.option ? E.examsForOption(course, entry.option, examLink.byCode.get(course.code) || []) : [];
    const examText = myExams.map(x => {
      const clash = examInfo.clashDates.has(x.date);
      const day = `${E.weekdayShort(x.date)} ${S.shortDate(x.date)}`;
      return `<span${clash ? ' class="clash" title="Another of your exams is on this day"' : ''}>${clash ? '⚠ ' : ''}${site.seasonsByTerm ? '' : esc(seasonName(x, true)) + ' '}${day}</span>`;
    }).join(', ');
    const notes = entry.option
      ? [...new Set(entry.option.sections.flatMap(s => s.studentNotes))].map(n => `<span class="tile-note" title="${esc(n)}">ℹ ${esc(n)}</span>`).join('')
      : '';

    return `<article class="tile${mine.length ? ' conflict' : ''}${open ? ' open' : ''}" data-code="${esc(course.code)}"
        style="--course-color:${entry.color[0]};--course-bg:${entry.color[1]}">
      <button type="button" class="tile-x" data-act="remove" title="Remove ${esc(course.name)}" aria-label="Remove ${esc(course.name)}">×</button>
      <b>${esc(courseTitle(course))}</b>
      <span class="tile-name" title="${esc(course.name)}">${esc(course.name)}</span>
      ${section}
      <span class="tile-info">${examText ? `<span>${site.seasonsByTerm ? 'Exam ' : ''}${examText}</span>` : ''}${others.length ? `<em title="Overlaps with ${esc(others.join(', '))}">⚠ overlaps</em>` : ''}</span>
      ${notes}${open ? optionsHtml(course, entry.option ? entry.option.id : '', list) : ''}</article>`;
  }

  /* ---------- Rendering: timetable ---------- */

  // Places overlapping blocks side by side within a day column.
  function layoutDay(items) {
    items.sort((a, b) => a.s.start - b.s.start || b.s.end - a.s.end);
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = [];
      cluster.forEach(it => {
        let lane = lanes.findIndex(end => end <= it.s.start);
        if (lane === -1) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = it.s.end;
        it.lane = lane;
      });
      cluster.forEach(it => { it.lanes = lanes.length; });
      cluster = [];
    };
    items.forEach(it => {
      if (cluster.length && it.s.start >= clusterEnd) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.s.end);
    });
    if (cluster.length) flush();
    return items;
  }

  // The section being tried on the timetable (see state.preview), as an entry like those
  // of the list, or null. A course not added yet gets the colour it would take.
  function previewEntry(list) {
    const p = state.preview;
    const course = p && data.byCode.get(p.code);
    const option = course && course.options.find(o => o.id === p.option);
    if (!option) return null;
    const current = list.find(e => e.course === course);
    if (current && current.option === option) return null;
    const sel = state.selections.get(course.code);
    const color = COLORS[(sel ? sel.color : freeColor()) % COLORS.length];
    return { course, option, color, fits: optionFits(course, option, list) };
  }

  function renderTimetable(list, clashes) {
    const clashDays = new Set();
    const ghost = previewEntry(list);
    const terms = shownTerms();
    const periods = examSource.periods || [];
    const grids = terms.map(term => {
      const termClashes = clashesIn(term, clashes);
      const clashIds = new Set(termClashes.flatMap(c => [c.a.id, c.b.id]));
      termClashes.forEach(c => clashDays.add(c.a.day));
      const inTerm = inTermOf(term);

      let html = '<div class="tt-corner"></div>';
      S.WEEKDAYS.forEach((d, i) => {
        html += `<div class="tt-dayhead${i === state.day ? ' current' : ''}" title="${d}">${S.WEEKDAYS_SHORT[i]}</div>`;
      });
      html += '<div class="tt-times">';
      for (let b = 0; b < BLOCKS; b++) html += `<div class="tt-time">${S.formatTime(S.DAY_START + b * 90)}</div>`;
      html += '</div>';

      let shownCount = 0;
      S.WEEKDAYS.forEach((d, day) => {
        const items = [];
        const onDay = s => s.day === day && inTerm(s) && s.end > S.DAY_START && s.start < S.DAY_END;
        list.forEach(e => e.option.sessions.forEach(s => { if (onDay(s)) items.push({ e, s }); }));
        shownCount += items.length;
        if (ghost) ghost.option.sessions.forEach(s => { if (onDay(s)) items.push({ e: ghost, s, ghost: true }); });
        html += `<div class="tt-day${day === state.day ? ' current' : ''}" style="height:calc(var(--block-h) * ${BLOCKS})">`;
        layoutDay(items).forEach(it => {
          const { e, s, lane, lanes } = it;
          const start = Math.max(s.start, S.DAY_START);
          const end = Math.min(s.end, S.DAY_END);
          const top = (start - S.DAY_START) / SPAN * 100;
          const height = (end - start) / SPAN * 100;
          const left = lane / lanes * 100;
          const width = 100 / lanes;
          const place = `top:calc(${top}% + 1px);height:calc(${height}% - 2px);left:calc(${left}% + 2px);width:calc(${width}% - 4px);--ev-fg:${e.color[0]};--ev-bg:${e.color[1]}`;
          if (it.ghost) {
            // A section being tried: dashed, with its short name, section and whether it fits.
            html += `<div class="event ghost${e.fits ? '' : ' bad'}" style="${place}"><b>${esc(courseTitle(e.course))} · ${esc(sectionLabel(s))} ${e.fits ? '✓' : '⚠'}</b></div>`;
            return;
          }
          const clash = clashIds.has(s.id);
          // The section the student is about to replace is faded while another one is tried.
          const fading = ghost && ghost.course === e.course;
          // Only the short name fits; section, time and room are in the tooltip.
          const tip = `${e.course.name}\n${sectionLabel(s)} · ${timeRange(s)}${s.room ? ' · ' + s.room : ''}${clash ? '\n⚠ Overlaps with another class' : ''}`;
          html += `<div class="event${clash ? ' clash' : ''}${fading ? ' fading' : ''}" title="${esc(tip)}" draggable="true" data-code="${esc(e.course.code)}" style="${place}">
            <button class="ev-remove" data-code="${esc(e.course.code)}" title="Remove ${esc(e.course.name)} from my timetable" aria-label="Remove ${esc(e.course.name)}">×</button>
            <b>${clash && lanes === 1 ? '<span class="warn">⚠</span> ' : ''}${esc(courseTitle(e.course))}</b>
          </div>`;
        });
        html += '</div>';
      });

      if (!list.length && !ghost) {
        html += state.selections.size
          ? `<div class="tt-empty">Pick a section for your courses<br>to see them here.</div>`
          : `<div class="tt-empty">Your timetable is empty.<br>Add courses with “+ Add” or drag them here.</div>`;
      } else if (!shownCount && !ghost) {
        html += `<div class="tt-empty">None of your courses have classes in this ${term ? 'trimester' : 'period'}.</div>`;
      }
      // The exams of this trimester sit under its grid.
      const mine = term ? periods.filter(p => seasonTerm.get(p.id) === term) : periods;
      return `<div class="tt-term">${term ? `<h3>${esc(term.label)}</h3>` : ''}<div class="timetable">${html}</div>${mine.map(seasonHtml).join('')}</div>`;
    });
    // Exam seasons that fall in no trimester of the timetable get a column of their own.
    const loose = terms[0] ? periods.filter(p => !seasonTerm.get(p.id)) : [];
    if (loose.length) grids.push(`<div class="tt-term"><h3>Other exams</h3>${loose.map(seasonHtml).join('')}</div>`);
    $('timetable').innerHTML = grids.join('');

    $('day-tabs').innerHTML = S.WEEKDAYS_SHORT.map((d, i) =>
      `<button role="tab" data-day="${i}" aria-selected="${i === state.day}" class="${i === state.day ? 'active' : ''}${clashDays.has(i) ? ' has-clash' : ''}">${d}${clashDays.has(i) ? ' ⚠' : ''}</button>`).join('');
  }

  function renderBanner(list, clashes) {
    const banner = $('banner');
    const pending = allEntries().filter(e => !e.option).map(e => e.course.name);
    const pendingNote = pending.length ? ` Pick a section for: ${pending.join(', ')}.` : '';
    if (!list.length && pending.length) {
      banner.className = 'banner';
      banner.textContent = `Choose your section in Your courses to place ${pending.length === 1 ? 'this course' : 'these courses'} on the timetable.` + pendingNote;
      return;
    }
    if (!list.length) {
      banner.className = 'banner';
      banner.innerHTML = 'Start by adding courses from the list. ' + site.startHint;
      return;
    }
    // Overlaps are listed per trimester (a semester course can clash in both).
    const terms = shownTerms();
    // One line per pair of courses and time slot, naming the trimester(s) it happens in.
    const lines = new Map();
    terms.forEach(term => {
      clashesIn(term, clashes).forEach(c => {
        const key = [c.x.course.code, c.y.course.code, c.a.day, c.a.start, c.b.start].join('|');
        if (!lines.has(key)) lines.set(key, { c, terms: [] });
        if (term && !lines.get(key).terms.includes(term.label)) lines.get(key).terms.push(term.label);
      });
    });
    const items = [...lines.values()].map(({ c, terms: where }) =>
      `<li>${terms.length > 1 && where.length ? `<b>${esc(where.join(' and '))}:</b> ` : ''}<b>${esc(c.x.course.name)}</b> (${esc(sectionLabel(c.a))}) and <b>${esc(c.y.course.name)}</b> (${esc(sectionLabel(c.b))}) · ${S.WEEKDAYS_SHORT[c.a.day]} ${timeRange(c.a)} / ${timeRange(c.b)}</li>`);
    if (items.length) {
      banner.className = 'banner bad';
      banner.innerHTML = `<strong>⚠ ${items.length} overlap${items.length === 1 ? '' : 's'}.</strong> ` +
        `Try another section for one of these courses:<ul>${items.join('')}</ul>${esc(pendingNote)}`;
      return;
    }
    banner.className = pending.length ? 'banner' : 'banner ok';
    banner.textContent = `✓ No timetable overlaps · ${list.length} course${list.length === 1 ? '' : 's'}.` + pendingNote;
  }

  /* ---------- Rendering: exam calendar ---------- */

  // Each exam season belongs to the trimester it falls in (Midterms -> Trimester 1,
  // Endterms -> Trimester 2): the one whose weeks contain its first day, else the
  // latest trimester started by then. Students see the trimester, not the planner's name.
  const seasonTerm = new Map((examSource.periods || []).map(p => {
    const first = E.seasonDays(p)[0];
    const term = data.terms.find(t => first >= t.start && first <= S.addDays(t.end, 6)) ||
      data.terms.filter(t => t.start <= first).pop() || null;
    return [p.id, term];
  }));

  // "Trimester 1" (long) or "T1" (short); the planner's season name if no trimester fits,
  // or on sites where several seasons share a trimester (undergraduate: Endterms and Final Exams).
  function seasonName(exam, short) {
    const term = seasonTerm.get(exam.period);
    if (!term || !site.seasonsByTerm) return short ? E.seasonSingular(exam.season) : exam.season;
    return short ? term.id : term.label;
  }

  function examItems(list) {
    return list.flatMap(e => E.examsForOption(e.course, e.option, examLink.byCode.get(e.course.code) || [])
      .map(exam => ({ course: e.course, color: e.color, exam })));
  }

  // An exam in the list: the course name on its colour, with the same × as a class block
  // (it removes the course) and, like a block, it can be dragged back to the course list.
  function examChip(it, clash) {
    return `<span class="ex-chip${clash ? ' clash' : ''}" draggable="true" data-code="${esc(it.course.code)}" style="--chip-fg:${it.color[0]};--chip-bg:${it.color[1]}"
      title="${esc(it.course.name)} – ${esc(seasonName(it.exam))} exam">${esc(it.course.name)}<button class="ev-remove" data-code="${esc(it.course.code)}" title="Remove ${esc(it.course.name)} from my timetable" aria-label="Remove ${esc(it.course.name)}">×</button></span>`;
  }

  function dayLabel(d) {
    return `${E.weekdayShort(d)} ${S.shortDate(d)}`;
  }

  // The exams of the student's courses: who clashes with whom, kept for the grids and tiles.
  let examInfo = { clashDates: new Set(), byDate: new Map(), clashes: [], count: 0 };

  function renderExams(list) {
    const items = examItems(list);
    const res = E.findExamClashes(items);
    examInfo = { clashDates: res.clashDates, byDate: res.byDate, clashes: res.clashes, count: items.length };

    // A banner only when two exams fall on the same day.
    const banner = $('exam-banner');
    const names = arr => [...new Set(arr.map(it => it.course.name))].map(esc).join(', ');
    banner.hidden = !res.clashes.length;
    if (res.clashes.length) {
      banner.className = 'banner bad';
      banner.innerHTML = `<strong>⚠ ${res.clashes.length} day${res.clashes.length === 1 ? '' : 's'} with more than one exam.</strong>` +
        `<ul>${res.clashes.map(c => `<li><b>${dayLabel(c.date)}</b>: ${names(c.items)}</li>`).join('')}</ul>`;
    }

    const without = list.filter(e => !E.examsForOption(e.course, e.option, examLink.byCode.get(e.course.code) || []).length)
      .map(e => e.course.name);
    $('exam-note').textContent = examSource.exams.length
      ? 'Exam times and rooms are not in the calendar yet.' +
        (without.length ? ` No exam date found for: ${without.join('; ')} – check with your program.` : '')
      : 'The exam calendar has not been published yet.';
  }

  // One list by date per season (owner's choice), under the timetable of its trimester.
  function seasonHtml(p) {
    const inSeason = d => (examInfo.byDate.get(d) || []).filter(it => it.exam.period === p.id);
    const rows = E.seasonDays(p).filter(d => inSeason(d).length).map(d => {
      const clash = examInfo.clashDates.has(d);
      return `<li class="${clash ? 'clash' : ''}"><span class="when">${clash ? '<span class="warn">⚠</span> ' : ''}${dayLabel(d)}</span>
        <span class="what">${inSeason(d).map(it => examChip(it, clash)).join('')}</span></li>`;
    }).join('');
    // Where several seasons share a trimester (undergraduate), each list says which one it is.
    return `<div class="ex-season">
      <h4>Exams${site.seasonsByTerm ? '' : ` <small>· ${esc(p.season)}</small>`}</h4>
      <ul class="ex-list">${rows || `<li class="empty">No exams for your courses in this ${site.seasonsByTerm ? 'trimester' : 'season'}.</li>`}</ul>
    </div>`;
  }

  // What was last drawn, so trying a section redraws the timetable only.
  let drawn = { list: [], clashes: [] };

  function update() {
    const list = entries();
    const clashes = findClashes(list);
    drawn = { list, clashes };
    renderExams(list);
    renderList(list);
    renderMine(list, clashes);
    renderTimetable(list, clashes);
    renderBanner(list, clashes);
    renderDrafts();
    $('switch-count').textContent = state.selections.size ? `(${state.selections.size})` : '';
    $('show-timetable').classList.toggle('has-clash', clashes.length > 0 || examInfo.clashes.length > 0);
    persist();
  }

  // Tries a section on the timetable (null stops): only the grids are redrawn, so the
  // list the student is pointing at stays in place.
  function setPreview(code, option) {
    const next = code ? { code, option } : null;
    const same = (!next && !state.preview) || (next && state.preview && next.code === state.preview.code && next.option === state.preview.option);
    if (same) return;
    state.preview = next;
    renderTimetable(drawn.list, drawn.clashes);
  }

  /* ---------- Calendar export (.ics) ---------- */

  const VTIMEZONE = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Lisbon',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:WEST',
    'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:WET',
    'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
  ];

  function icsText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // Long lines must be split ("folded") for calendar apps.
  function icsFold(line) {
    const out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
    out.push(line);
    return out.join('\r\n');
  }

  function icsLocal(iso, minutes) {
    return iso.replace(/-/g, '') + 'T' + S.formatTime(minutes).replace(':', '') + '00';
  }

  function buildIcs(list) {
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Catolica Lisbon//Schedule Sandbox//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:My timetable (Schedule Sandbox)',
      'X-WR-TIMEZONE:Europe/Lisbon', ...VTIMEZONE,
    ];
    let count = 0;
    list.forEach(e => {
      const notes = [...new Set(e.option.sections.flatMap(s => s.studentNotes))];
      e.option.sessions.forEach(s => {
        s.weeks.forEach(w => {
          const date = S.classDate(w, s.day);
          const uid = [e.course.code, s.sectionName, date, s.start].join('-').replace(/[^A-Za-z0-9-]/g, '') + '@schedule-sandbox';
          lines.push(
            'BEGIN:VEVENT',
            'UID:' + uid,
            'DTSTAMP:' + now,
            'DTSTART;TZID=Europe/Lisbon:' + icsLocal(date, s.start),
            'DTEND;TZID=Europe/Lisbon:' + icsLocal(date, s.end),
            'SUMMARY:' + icsText(`${e.course.name} (${sectionLabel(s)})`),
          );
          if (s.room) lines.push('LOCATION:' + icsText(s.room));
          lines.push('DESCRIPTION:' + icsText(`${e.course.code}${e.course.acronym ? ' · ' + e.course.acronym : ''}${notes.length ? '\n' + notes.join('\n') : ''}`));
          lines.push('END:VEVENT');
          count++;
        });
      });
    });
    // Exams as all-day events (times are not known yet).
    examItems(list).forEach(({ course, exam }) => {
      const day = exam.date.replace(/-/g, '');
      const next = S.addDays(exam.date, 1).replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + ['exam', course.code, exam.period, day].join('-').replace(/[^A-Za-z0-9-]/g, '') + '@schedule-sandbox',
        'DTSTAMP:' + now,
        'DTSTART;VALUE=DATE:' + day,
        'DTEND;VALUE=DATE:' + next,
        'SUMMARY:' + icsText(`Exam: ${course.name} (${seasonName(exam)})`),
        'DESCRIPTION:' + icsText('Time and room to be confirmed. Always check the official exam calendar.'),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
      count++;
    });
    lines.push('END:VCALENDAR');
    return { text: lines.map(icsFold).join('\r\n') + '\r\n', count };
  }

  /* ---------- Print ---------- */

  function preparePrint() {
    const list = entries();
    $('print-draft').textContent = currentDraft().name;
    $('print-week').textContent = [currentDraft().name, data.terms.map(t => t.label).join(' and ')].filter(Boolean).join(' · ');
    $('print-list').innerHTML = list.map(e =>
      `<p><b>${esc(e.course.name)}</b> (${esc(e.course.code)}) – ${esc(e.option.label)}: ` +
      shownSessions(e.option).map(s => `${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)}${s.room ? ' ' + esc(s.room) : ''}`).join('; ') + '</p>').join('');
  }

  /* ---------- Events ---------- */

  $('search').addEventListener('input', e => { state.search = e.target.value; update(); });
  if ($('programme')) $('programme').addEventListener('change', e => { state.programme = e.target.value; update(); });
  $('unit').addEventListener('change', e => { state.unit = e.target.value; update(); });

  // Course list: "+ Add", Cancel, and picking a section for a course being added.
  $('course-list').addEventListener('click', e => {
    const card = e.target.closest('.course-card');
    if (!card) return;
    const sec = e.target.closest('.sec');
    const btn = e.target.closest('button[data-act]');
    if (sec) addCourse(card.dataset.code, sec.dataset.opt);
    else if (btn && btn.dataset.act === 'add') addCourse(card.dataset.code);
    else if (btn && btn.dataset.act === 'cancel') { state.picking = ''; state.preview = null; update(); }
  });

  // Your courses: remove, open the section dropdown, choose a section.
  $('mine').addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const code = tile.dataset.code;
    const sec = e.target.closest('.sec');
    const btn = e.target.closest('button[data-act]');
    if (sec) setOption(code, sec.dataset.opt);
    else if (btn && btn.dataset.act === 'remove') removeCourse(code);
    else if (btn && btn.dataset.act === 'toggle') {
      state.open = state.open === code ? '' : code;
      state.picking = '';
      state.preview = null;
      update();
      const focus = document.querySelector(state.open
        ? '.tile.open .sec.on, .tile.open .sec'
        : `.tile[data-code="${CSS.escape(code)}"] .dd-btn`);
      if (focus) focus.focus({ preventScroll: true });
    }
  });

  // Pointing at a section, or moving to it with the keyboard, tries it on the timetable.
  function tryFrom(e) {
    const sec = e.target.closest && e.target.closest('.sec');
    const holder = sec && sec.closest('[data-code]');
    if (holder) setPreview(holder.dataset.code, sec.dataset.opt);
  }
  function stopTrying(e) {
    const list = e.target.closest && e.target.closest('.sec-list');
    if (list && !(e.relatedTarget && list.contains(e.relatedTarget))) setPreview(null);
  }
  [$('course-list'), $('mine')].forEach(el => {
    el.addEventListener('mouseover', tryFrom);
    el.addEventListener('focusin', tryFrom);
    el.addEventListener('mouseout', stopTrying);
    el.addEventListener('focusout', stopTrying);
  });

  // Keyboard in a list of sections: arrows move (the preview follows), Escape closes.
  document.addEventListener('keydown', e => {
    const sec = e.target.closest && e.target.closest('.sec-list .sec');
    if (sec && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? sec.nextElementSibling : sec.previousElementSibling;
      if (next) next.focus();
    } else if (e.key === 'Escape' && (state.open || state.picking)) {
      const code = state.open;
      state.open = state.picking = '';
      state.preview = null;
      update();
      const btn = code && document.querySelector(`.tile[data-code="${CSS.escape(code)}"] .dd-btn`);
      if (btn) btn.focus({ preventScroll: true });
    }
  });
  // A click anywhere else closes an open section dropdown.
  document.addEventListener('click', e => {
    if (state.open && !e.target.closest('.tile')) { state.open = ''; state.preview = null; update(); }
  });

  // Drag and drop, both ways:
  // - a course card onto the timetable adds it;
  // - a class block from the timetable back onto the course list removes its course.
  // `drag` remembers where the drag started (browsers hide the data until the drop).
  let drag = null; // { from: 'list' | 'timetable', code }
  const tt = $('timetable');
  const sidebar = $('sidebar');

  function endDrag() {
    drag = null;
    tt.classList.remove('drop-hover');
    sidebar.classList.remove('drop-remove');
    $('sidebar-bar').textContent = 'Course List';
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }

  $('course-list').addEventListener('dragstart', e => {
    const card = e.target.closest('.course-card');
    if (!card) return;
    drag = { from: 'list', code: card.dataset.code };
    e.dataTransfer.setData('text/plain', card.dataset.code);
    e.dataTransfer.effectAllowed = 'copy';
    card.classList.add('dragging');
  });
  tt.addEventListener('dragstart', e => {
    const block = e.target.closest('.event, .ex-chip');
    if (!block || !block.dataset.code) return;
    drag = { from: 'timetable', code: block.dataset.code };
    e.dataTransfer.setData('text/plain', block.dataset.code);
    e.dataTransfer.effectAllowed = 'move';
    block.classList.add('dragging');
    const course = data.byCode.get(block.dataset.code);
    $('sidebar-bar').textContent = `Drop here to remove ${course ? course.name : 'this course'}`;
  });
  document.addEventListener('dragend', endDrag);

  tt.addEventListener('dragover', e => {
    if (!drag || drag.from !== 'list') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    tt.classList.add('drop-hover');
  });
  tt.addEventListener('dragleave', e => { if (!tt.contains(e.relatedTarget)) tt.classList.remove('drop-hover'); });
  tt.addEventListener('drop', e => {
    if (!drag || drag.from !== 'list') return;
    e.preventDefault();
    const code = drag.code;
    endDrag();
    addCourse(code);
  });

  sidebar.addEventListener('dragover', e => {
    if (!drag || drag.from !== 'timetable') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    sidebar.classList.add('drop-remove');
  });
  sidebar.addEventListener('dragleave', e => { if (!sidebar.contains(e.relatedTarget)) sidebar.classList.remove('drop-remove'); });
  sidebar.addEventListener('drop', e => {
    if (!drag || drag.from !== 'timetable') return;
    e.preventDefault();
    const code = drag.code;
    endDrag();
    removeCourse(code);
  });

  // The small × on a class block, or on an exam in the list, removes that course.
  tt.addEventListener('click', e => {
    const btn = e.target.closest('.ev-remove');
    if (btn) removeCourse(btn.dataset.code);
  });

  $('day-tabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-day]');
    if (!btn) return;
    state.day = Number(btn.dataset.day);
    update();
  });

  function setView(view) {
    state.view = view;
    $('app').dataset.view = view;
    $('show-courses').classList.toggle('active', view === 'courses');
    $('show-timetable').classList.toggle('active', view === 'timetable');
    window.scrollTo({ top: 0 });
  }
  $('show-courses').addEventListener('click', () => setView('courses'));
  $('show-timetable').addEventListener('click', () => setView('timetable'));

  $('print').addEventListener('click', () => { preparePrint(); window.print(); });
  window.addEventListener('beforeprint', preparePrint);
  // "Clear all" empties the current draft straight away and can be undone for a few
  // seconds: a small "Draft cleared · Undo" message at the bottom right.
  let undo = null; // { draft, selections, timer }
  function hideUndo() {
    if (undo) clearTimeout(undo.timer);
    undo = null;
    const toast = $('undo-toast');
    if (toast) toast.remove();
  }
  $('clear-all').addEventListener('click', () => {
    if (!state.selections.size) return;
    hideUndo();
    const draft = currentDraft();
    undo = { draft, selections: new Map(draft.selections), timer: setTimeout(hideUndo, 7000) };
    draft.selections.clear();
    state.picking = state.open = '';
    state.preview = null;
    update();
    const toast = document.createElement('div');
    toast.id = 'undo-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<span>Draft cleared</span><button type="button">Undo</button>';
    toast.querySelector('button').addEventListener('click', () => {
      const u = undo;
      hideUndo();
      // Courses added since the clear stay; the cleared ones come back with their sections and colours.
      if (u && state.drafts.includes(u.draft)) {
        u.selections.forEach((sel, code) => { if (!u.draft.selections.has(code)) u.draft.selections.set(code, sel); });
        update();
      }
    });
    document.body.appendChild(toast);
  });

  // The draft stamp opens a small menu: switch, new, duplicate, rename, delete.
  $('draft-stamp').addEventListener('click', e => {
    e.stopPropagation();
    toggleDraftMenu($('draft-menu').hidden);
  });
  $('draft-menu').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    toggleDraftMenu(false);
    if (btn.dataset.draft) switchDraft(btn.dataset.draft);
    else if (btn.dataset.act === 'new') newDraft(false);
    else if (btn.dataset.act === 'copy') newDraft(true);
    else if (btn.dataset.act === 'rename') renameDraft();
    else if (btn.dataset.act === 'delete') deleteDraft();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.draft')) toggleDraftMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleDraftMenu(false); });
  $('preview-clear').addEventListener('click', () => {
    forget(PREVIEW_KEY);
    forget(EXAM_PREVIEW_KEY);
    forget(site.key('student.preview.v1'));
    location.reload();
  });

  renderFilters();
  update();

  // admin.html opens index.html#exams after an exam preview.
  if (location.hash === '#exams') {
    if (window.matchMedia('(max-width: 860px)').matches) setView('timetable');
    $('exams').scrollIntoView();
  }

  // Exposed for testing in the browser console.
  window.ScheduleSandbox = { data, state, entries, newDraft, switchDraft, findClashes, buildIcs, addCourse, removeCourse, setOption, update, examLink, examItems };
})();
