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
    : [{ id: 'd1', name: 'Draft 1', selections: saved.selections }];
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
    const used = new Set([...state.selections.values()].map(s => s.color % COLORS.length));
    let color = 0;
    while (used.has(color) && color < COLORS.length) color++;
    if (color >= COLORS.length) color = state.selections.size % COLORS.length;
    state.selections.set(code, { option, color });
    state.picking = '';
    update();
  }

  // Opens the section dropdown on the course's card and puts the keyboard focus on it.
  function startPicking(code) {
    state.picking = code;
    update();
    const select = document.querySelector(`.course-card.picking select`);
    if (select) {
      select.closest('.course-card').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      select.focus({ preventScroll: true });
    }
  }

  function removeCourse(code) {
    state.selections.delete(code);
    update();
  }

  function setOption(code, id) {
    const sel = state.selections.get(code);
    if (sel) { sel.option = id; update(); }
  }

  /* ---------- Drafts ---------- */

  const MAX_DRAFTS = 10;

  function switchDraft(id) {
    state.draftId = id;
    state.selections = currentDraft().selections;
    update();
  }

  function nextDraftName() {
    let n = state.drafts.length + 1;
    while (state.drafts.some(d => d.name === 'Draft ' + n)) n++;
    return 'Draft ' + n;
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
    if (!state.drafts.length) state.drafts.push({ id: 'd' + Date.now().toString(36), name: 'Draft 1', selections: new Map() });
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

  function renderList(list, clashes) {
    const added = allEntries().map(a => list.find(e => e.course === a.course) || a);
    const q = fold(state.search.trim());
    const matches = c =>
      (!q || fold(`${c.name} ${c.acronym} ${c.code}`).includes(q)) &&
      (!state.programme || c.programmes.includes(state.programme)) &&
      (!state.unit || c.units.includes(state.unit));

    // The course whose section is being picked stays where it is in the list (owner's choice);
    // it moves to Your courses once a section is picked.
    if (state.selections.has(state.picking)) state.picking = '';
    const rest = data.courses.filter(c => !state.selections.has(c.code) && (matches(c) || c.code === state.picking));
    let html = '';
    if (added.length) {
      html += `<div class="list-divider">Your courses (${added.length})</div>`;
      html += added.map(e => cardHtml(e.course, e, list, clashes)).join('');
      html += `<div class="list-divider">All courses</div>`;
    }
    html += rest.map(c => cardHtml(c, null, list, clashes)).join('');
    if (!rest.length) html += `<p class="cc-meta" style="padding:4px">No other courses match your search or filters.</p>`;
    $('course-list').innerHTML = html;
  }

  function cardHtml(course, entry, list, clashes) {
    const units = course.units.map(u => `<span class="tag">${esc(u)}</span>`).join('');
    const meta = `${units}${esc(course.acronym ? course.acronym + ' · ' : '')}${esc(course.code)} · ${esc(course.typologies.join('/'))}`;
    // "+ Add" on a course with several sections: pick the section here; the course is added on pick.
    if (!entry && state.picking === course.code) {
      const choices = '<option value="" selected disabled>Choose a section…</option>' +
        course.options.map(o => {
          const days = [...new Set(shownSessions(o).map(s => S.WEEKDAYS_SHORT[s.day]))].join(', ');
          return `<option value="${esc(o.id)}">${esc(o.label)} · ${days} — ${optionFits(course, o, list) ? '✓ fits' : '⚠ overlaps'}</option>`;
        }).join('');
      return `<article class="course-card pending picking" data-code="${esc(course.code)}">
        <div class="cc-head">
          <div><h3>${esc(course.name)}</h3><div class="cc-meta">${meta}</div></div>
          <button class="add-btn" data-act="cancel" aria-label="Cancel adding ${esc(course.name)}">Cancel</button>
        </div>
        <div class="cc-body">
          <label class="field">Choose your section
            <select data-act="pick">${choices}</select></label>
          <div class="cc-note">This course has ${course.options.length} sections: pick yours to add it to your courses.</div>
        </div></article>`;
    }
    if (!entry) {
      return `<article class="course-card" draggable="true" data-code="${esc(course.code)}">
        <div class="cc-head">
          <div><h3>${esc(course.name)}</h3><div class="cc-meta">${meta}</div></div>
          <button class="add-btn" data-act="add" aria-label="Add ${esc(course.name)}">+ Add</button>
        </div></article>`;
    }

    const mine = clashes.filter(c => c.x === entry || c.y === entry);
    const clashIds = new Set(mine.flatMap(c => [c.a.id, c.b.id]));
    const options = (entry.option ? '' : '<option value="" selected disabled>Choose a section…</option>') +
      course.options.map(o => {
        const fits = optionFits(course, o, list);
        const days = [...new Set(shownSessions(o).map(s => S.WEEKDAYS_SHORT[s.day]))].join(', ');
        return `<option value="${esc(o.id)}"${o === entry.option ? ' selected' : ''}>${esc(o.label)} · ${days} — ${fits ? '✓ fits' : '⚠ overlaps'}</option>`;
      }).join('');
    const head = `<div class="cc-head">
        <div><h3>${esc(course.name)}</h3><div class="cc-meta">${meta}</div></div>
        <button class="add-btn is-added" data-act="remove" aria-label="Remove ${esc(course.name)}">
          <span class="when-idle">Added ✓</span><span class="when-hover">Remove ✕</span></button>
      </div>`;

    // Several sections and none picked yet: only the dropdown, nothing on the timetable.
    if (!entry.option) {
      return `<article class="course-card added pending" draggable="true" data-code="${esc(course.code)}"
          style="--course-color:${entry.color[0]};--course-bg:${entry.color[1]}">
        ${head}
        <div class="cc-body">
          <label class="field">Choose your section
            <select data-act="option">${options}</select></label>
          <div class="cc-note">Pick a section to see this course on your timetable.</div>
        </div></article>`;
    }

    const sessions = shownSessions(entry.option).map(s => {
      return `<li class="${clashIds.has(s.id) ? 'clash' : ''}">
        <span class="when">${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)}</span>
        <span class="what">${esc(sectionLabel(s))}${s.room ? ' · ' + esc(s.room) : ''}</span></li>`;
    }).join('');

    const notes = [...new Set(entry.option.sections.flatMap(s => s.studentNotes))]
      .map(n => `<div class="cc-note">ℹ ${esc(n)}</div>`).join('');

    const others = [...new Map(mine.map(c => {
      const other = c.x === entry ? c.y : c.x;
      const s = c.x === entry ? c.b : c.a;
      return [other.course.code + s.day + s.start, `${other.course.name} (${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)})`];
    })).values()];
    const clashHtml = others.length ? `<div class="cc-clash">⚠ Overlaps with ${esc(others.join(', '))}</div>` : '';

    // Exam dates for this course (red when another of your exams is the same day).
    const myExams = E.examsForOption(course, entry.option, examLink.byCode.get(course.code) || []);
    const examHtml = myExams.length
      ? `<div class="cc-exams"><b>Exams</b>${myExams.map(x => {
          const clash = examInfo.clashDates.has(x.date);
          return `<span class="${clash ? 'clash' : ''}"${clash ? ' title="Another of your exams is on this day"' : ''}>${clash ? '⚠ ' : ''}${esc(seasonName(x, true))} · ${E.weekdayShort(x.date)} ${S.shortDate(x.date)}</span>`;
        }).join('')}</div>`
      : (examSource.exams.length ? '<div class="cc-exams none">No exam date in the exam calendar</div>' : '');

    return `<article class="course-card added${mine.length ? ' conflict' : ''}" draggable="true" data-code="${esc(course.code)}"
        style="--course-color:${entry.color[0]};--course-bg:${entry.color[1]}">
      ${head}
      <div class="cc-body">
        <label class="field">${course.options.length > 1 ? 'Choose your section' : 'Section'}
          <select data-act="option">${options}</select></label>
        <ul class="session-list">${sessions}</ul>
        ${notes}${examHtml}${clashHtml}
      </div></article>`;
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

  function renderTimetable(list, clashes) {
    const clashDays = new Set();
    const grids = shownTerms().map(term => {
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
        list.forEach(e => e.option.sessions.forEach(s => {
          if (s.day === day && inTerm(s) && s.end > S.DAY_START && s.start < S.DAY_END) items.push({ e, s });
        }));
        shownCount += items.length;
        html += `<div class="tt-day${day === state.day ? ' current' : ''}" style="height:calc(var(--block-h) * ${BLOCKS})">`;
        layoutDay(items).forEach(({ e, s, lane, lanes }) => {
          const start = Math.max(s.start, S.DAY_START);
          const end = Math.min(s.end, S.DAY_END);
          const top = (start - S.DAY_START) / SPAN * 100;
          const height = (end - start) / SPAN * 100;
          const left = lane / lanes * 100;
          const width = 100 / lanes;
          const clash = clashIds.has(s.id);
          // Only the short name fits; section, time and room are in the tooltip and on the card.
          const tip = `${e.course.name}\n${sectionLabel(s)} · ${timeRange(s)}${s.room ? ' · ' + s.room : ''}${clash ? '\n⚠ Overlaps with another class' : ''}`;
          html += `<div class="event${clash ? ' clash' : ''}" title="${esc(tip)}" draggable="true" data-code="${esc(e.course.code)}"
            style="top:calc(${top}% + 1px);height:calc(${height}% - 2px);left:calc(${left}% + 2px);width:calc(${width}% - 4px);--ev-fg:${e.color[0]};--ev-bg:${e.color[1]}">
            <button class="ev-remove" data-code="${esc(e.course.code)}" title="Remove ${esc(e.course.name)} from my timetable" aria-label="Remove ${esc(e.course.name)}">×</button>
            <b>${clash && lanes === 1 ? '⚠ ' : ''}${esc(courseTitle(e.course))}</b>
          </div>`;
        });
        html += '</div>';
      });

      if (!list.length) {
        html += state.selections.size
          ? `<div class="tt-empty">Pick a section for your courses<br>to see them here.</div>`
          : `<div class="tt-empty">Your timetable is empty.<br>Add courses with “+ Add” or drag them here.</div>`;
      } else if (!shownCount) {
        html += `<div class="tt-empty">None of your courses have classes in this ${term ? 'trimester' : 'period'}.</div>`;
      }
      return `<div class="tt-term">${term ? `<h3>${esc(term.label)}${term.ref ? ' <small>· reference week</small>' : ''}</h3>` : ''}<div class="timetable">${html}</div></div>`;
    });
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
      banner.textContent = `Choose your section in the course list to place ${pending.length === 1 ? 'this course' : 'these courses'} on the timetable.` + pendingNote;
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
    banner.textContent = `✓ No overlaps · ${list.length} course${list.length === 1 ? '' : 's'}.` + pendingNote;
  }

  /* ---------- Rendering: exam calendar ---------- */

  let examInfo = { clashDates: new Set() };

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

  function examChip(it, clash) {
    return `<span class="ex-chip${clash ? ' clash' : ''}" style="--chip-fg:${it.color[0]};--chip-bg:${it.color[1]}"
      title="${esc(it.course.name)} – ${esc(seasonName(it.exam))} exam">${esc(courseTitle(it.course))}</span>`;
  }

  function dayLabel(d) {
    return `${E.weekdayShort(d)} ${S.shortDate(d)}`;
  }

  function renderExams(list) {
    const items = examItems(list);
    const res = E.findExamClashes(items);
    examInfo = { clashDates: res.clashDates };

    // Summary banner
    const banner = $('exam-banner');
    const names = arr => [...new Set(arr.map(it => it.course.name))].map(esc).join(', ');
    if (!examSource.exams.length) {
      banner.className = 'banner';
      banner.textContent = 'The exam calendar has not been published yet.';
    } else if (!list.length) {
      banner.className = 'banner';
      banner.textContent = 'Add courses to see their exam dates here.';
    } else if (res.clashes.length) {
      banner.className = 'banner bad';
      banner.innerHTML = `<strong>⚠ ${res.clashes.length} day${res.clashes.length === 1 ? '' : 's'} with more than one exam.</strong>` +
        `<ul>${res.clashes.map(c => `<li><b>${dayLabel(c.date)}</b>: ${names(c.items)}</li>`).join('')}</ul>`;
    } else if (items.length) {
      banner.className = 'banner ok';
      banner.textContent = `✓ No exam overlaps · ${items.length} exam${items.length === 1 ? '' : 's'} for your courses`;
    } else {
      banner.className = 'banner';
      banner.textContent = 'None of your courses has an exam in the published calendar.';
    }

    // One list by date per season (owner's choice), in one column per trimester so
    // they sit under the matching timetable grid.
    const seasonHtml = p => {
      const days = E.seasonDays(p);
      const inSeason = d => (res.byDate.get(d) || []).filter(it => it.exam.period === p.id);
      const listed = days.filter(d => inSeason(d).length);
      const rows = listed.map(d => {
        const its = inSeason(d);
        const clash = res.clashDates.has(d);
        return `<li class="${clash ? 'clash' : ''}"><span class="when">${clash ? '⚠ ' : ''}${dayLabel(d)}</span>
          <span class="what">${its.map(it => examChip(it, clash)).join('')}</span></li>`;
      }).join('');
      return `<div class="ex-season">
        <h3>${esc(seasonName({ period: p.id, season: p.season }))} <small>${S.shortDate(days[0])} – ${S.shortDate(days[days.length - 1])}</small></h3>
        <ul class="ex-list">${rows || `<li class="empty">No exams for your courses in this ${site.seasonsByTerm ? 'trimester' : 'season'}.</li>`}</ul>
      </div>`;
    };
    const periods = examSource.periods || [];
    const columns = data.terms.length
      ? data.terms.map(t => periods.filter(p => seasonTerm.get(p.id) === t))
        .concat([periods.filter(p => !seasonTerm.get(p.id))])
        .filter(col => col.length)
      : periods.map(p => [p]);
    $('exam-seasons').innerHTML = columns.map(col => `<div class="ex-col">${col.map(seasonHtml).join('')}</div>`).join('');

    const without = list.filter(e => !E.examsForOption(e.course, e.option, examLink.byCode.get(e.course.code) || []).length)
      .map(e => e.course.name);
    $('exam-note').textContent = examSource.exams.length
      ? 'Exam times and rooms are not in the calendar yet.' +
        (without.length ? ` No exam date found for: ${without.join('; ')} – check with your program.` : '')
      : '';
    $('switch-exams').textContent = res.clashes.length ? '⚠' : items.length ? `(${items.length})` : '';
    $('show-exams').classList.toggle('has-clash', res.clashes.length > 0);
  }

  function update() {
    const list = entries();
    const clashes = findClashes(list);
    renderExams(list);
    renderList(list, clashes);
    renderTimetable(list, clashes);
    renderBanner(list, clashes);
    renderDrafts();
    $('switch-count').textContent = state.selections.size ? `(${state.selections.size})` : '';
    persist();
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

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- Print ---------- */

  function preparePrint() {
    const list = entries();
    $('print-week').textContent = [currentDraft().name, data.terms.map(t => t.label).join(' and ')].filter(Boolean).join(' · ');
    $('print-list').innerHTML = list.map(e =>
      `<p><b>${esc(e.course.name)}</b> (${esc(e.course.code)}) – ${esc(e.option.label)}: ` +
      shownSessions(e.option).map(s => `${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)}${s.room ? ' ' + esc(s.room) : ''}`).join('; ') + '</p>').join('');
  }

  /* ---------- Events ---------- */

  $('search').addEventListener('input', e => { state.search = e.target.value; update(); });
  if ($('programme')) $('programme').addEventListener('change', e => { state.programme = e.target.value; update(); });
  $('unit').addEventListener('change', e => { state.unit = e.target.value; update(); });

  $('course-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const code = btn.closest('.course-card').dataset.code;
    if (btn.dataset.act === 'add') addCourse(code);
    else if (btn.dataset.act === 'cancel') { state.picking = ''; update(); }
    else removeCourse(code);
  });
  $('course-list').addEventListener('change', e => {
    if (e.target.matches('select[data-act="pick"]')) {
      addCourse(e.target.closest('.course-card').dataset.code, e.target.value);
    } else if (e.target.matches('select[data-act="option"]')) {
      setOption(e.target.closest('.course-card').dataset.code, e.target.value);
    }
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
    $('sidebar-bar').textContent = 'Courses';
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
    const block = e.target.closest('.event');
    if (!block) return;
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

  // The small × on a class block removes that course from the timetable.
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
    $('show-exams').classList.toggle('active', view === 'exams');
    window.scrollTo({ top: 0 });
  }
  $('show-courses').addEventListener('click', () => setView('courses'));
  $('show-timetable').addEventListener('click', () => setView('timetable'));
  $('show-exams').addEventListener('click', () => setView('exams'));

  $('export-ics').addEventListener('click', () => {
    const list = entries();
    if (!list.length) { alert('Add at least one course and choose its section first.'); return; }
    const { text } = buildIcs(list);
    const slug = currentDraft().name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    download(`my-timetable${slug ? '-' + slug : ''}.ics`, text, 'text/calendar;charset=utf-8');
  });
  $('print').addEventListener('click', () => { preparePrint(); window.print(); });
  window.addEventListener('beforeprint', preparePrint);
  $('clear-all').addEventListener('click', () => {
    if (!state.selections.size) return;
    if (confirm(`Remove all courses from “${currentDraft().name}”?`)) { state.selections.clear(); update(); }
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
    if (window.matchMedia('(max-width: 860px)').matches) setView('exams');
    else $('exams').scrollIntoView();
  }

  // Exposed for testing in the browser console.
  window.ScheduleSandbox = { data, state, entries, newDraft, switchDraft, findClashes, buildIcs, addCourse, removeCourse, setOption, update, examLink, examItems };
})();
