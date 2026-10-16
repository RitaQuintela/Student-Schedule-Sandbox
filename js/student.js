/*
 * Schedule Sandbox – student screen.
 * Reads the published timetable (data/timetable-data.js), or an admin preview
 * saved in this browser, and lets the student build a weekly timetable.
 */
(function () {
  'use strict';

  const S = window.Schedule;
  const PREVIEW_KEY = 'scheduleSandbox.adminPreview.v1';
  const BLOCKS = (S.DAY_END - S.DAY_START) / 90; // 8 blocks of 1h30
  const SPAN = S.DAY_END - S.DAY_START;

  // Course colours from the brand book's programme palette: [stripe, light tint]
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
  const preview = load(PREVIEW_KEY);
  if (preview && Array.isArray(preview.rows)) {
    source = preview;
    const when = preview.generatedAt ? new Date(preview.generatedAt).toLocaleString() : '';
    document.getElementById('preview-text').textContent =
      `Preview: you are seeing the timetable uploaded on the admin page (“${preview.source || 'file'}”, ${when}). Only this browser sees it.`;
    document.getElementById('preview-notice').hidden = false;
  }
  const data = S.buildDataset(source.rows || []);
  // Choices made while previewing are kept apart, so they never replace the real ones.
  const STORE_KEY = source === preview ? 'scheduleSandbox.student.preview.v1' : 'scheduleSandbox.student.v1';

  /* ---------- State ---------- */

  const saved = load(STORE_KEY) || {};
  const todayIdx = (new Date().getDay() + 6) % 7;
  const state = {
    selections: new Map(), // course code -> { option: id, color: index }, in the order added
    week: 'typical',
    search: '',
    programme: '',
    unit: '',
    day: todayIdx < 5 ? todayIdx : 0,
    view: 'courses',
  };

  (saved.selections || []).forEach(([code, sel]) => {
    const course = data.byCode.get(code);
    if (!course || !course.options.length || !sel) return;
    const option = course.options.some(o => o.id === sel.option) ? sel.option : course.options[0].id;
    state.selections.set(code, { option, color: Number(sel.color) || 0 });
  });
  if (saved.week && (saved.week === 'typical' || data.weeks.includes(saved.week))) state.week = saved.week;
  if (saved.programme && data.programmes.some(p => p.code === saved.programme)) state.programme = saved.programme;
  if (saved.unit && data.units.some(u => u.code === saved.unit)) state.unit = saved.unit;

  function persist() {
    save(STORE_KEY, {
      selections: [...state.selections],
      week: state.week,
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

  function weeksText(weeks) {
    const n = weeks.length;
    const range = S.shortDate(weeks[0]) + (n > 1 ? ' – ' + S.shortDate(weeks[n - 1]) : '');
    return `${n} week${n === 1 ? '' : 's'} · ${range}`;
  }

  function courseTitle(course) {
    return (course.acronym || course.name).replace(/_/g, ' ');
  }

  // "T1" rather than "T T1"; "TP PL1" style only when the name doesn't say it.
  function sectionLabel(s) {
    return s.sectionName.toUpperCase().startsWith(s.typ) ? s.sectionName : `${s.typ} ${s.sectionName}`;
  }

  function entries() {
    return [...state.selections].map(([code, sel]) => {
      const course = data.byCode.get(code);
      const option = course.options.find(o => o.id === sel.option) || course.options[0];
      const color = COLORS[sel.color % COLORS.length];
      return { course, option, color };
    });
  }

  function inShownWeek(session) {
    return state.week === 'typical' || session.weekSet.has(state.week);
  }

  // All overlapping pairs between different selected courses.
  function findClashes(list) {
    const clashes = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        list[i].option.sessions.forEach(a => {
          list[j].option.sessions.forEach(b => {
            if (S.sessionsOverlap(a, b)) {
              clashes.push({ x: list[i], y: list[j], a, b, weeks: S.sharedWeeks(a, b) });
            }
          });
        });
      }
    }
    return clashes;
  }

  function optionFits(course, option, list) {
    return !list.some(e => e.course !== course && e.option.sessions.some(b => option.sessions.some(a => S.sessionsOverlap(a, b))));
  }

  /* ---------- Actions ---------- */

  function addCourse(code) {
    const course = data.byCode.get(code);
    if (!course || state.selections.has(code) || !course.options.length) return;
    const list = entries();
    const option = course.options.find(o => optionFits(course, o, list)) || course.options[0];
    const used = new Set([...state.selections.values()].map(s => s.color % COLORS.length));
    let color = 0;
    while (used.has(color) && color < COLORS.length) color++;
    if (color >= COLORS.length) color = state.selections.size % COLORS.length;
    state.selections.set(code, { option: option.id, color });
    update();
  }

  function removeCourse(code) {
    state.selections.delete(code);
    update();
  }

  function setOption(code, id) {
    const sel = state.selections.get(code);
    if (sel) { sel.option = id; update(); }
  }

  /* ---------- Rendering: course list ---------- */

  function renderFilters() {
    $('programme').innerHTML = '<option value="">All programmes</option>' +
      data.programmes.map(p => `<option value="${esc(p.code)}">${esc(p.label)}</option>`).join('');
    $('unit').innerHTML = '<option value="">All periods</option>' +
      data.units.map(u => `<option value="${esc(u.code)}">${esc(u.label)}</option>`).join('');
    $('programme').value = state.programme;
    $('unit').value = state.unit;
    $('week').innerHTML = '<option value="typical">Typical week (all classes)</option>' +
      data.weeks.map(w => `<option value="${w}">Week of ${S.shortDate(w)} – ${S.shortDate(S.addDays(w, 4))}</option>`).join('');
    $('week').value = state.week;
  }

  function renderList(list, clashes) {
    const q = fold(state.search.trim());
    const matches = c =>
      (!q || fold(`${c.name} ${c.acronym} ${c.code}`).includes(q)) &&
      (!state.programme || c.programmes.includes(state.programme)) &&
      (!state.unit || c.units.includes(state.unit));

    const rest = data.courses.filter(c => !state.selections.has(c.code) && matches(c));
    let html = '';
    if (list.length) {
      html += `<div class="list-divider">Your courses (${list.length})</div>`;
      html += list.map(e => cardHtml(e.course, e, list, clashes)).join('');
      html += `<div class="list-divider">All courses</div>`;
    }
    html += rest.map(c => cardHtml(c, null, list, clashes)).join('');
    if (!rest.length) html += `<p class="cc-meta" style="padding:4px">No other courses match your search or filters.</p>`;
    $('course-list').innerHTML = html;

    const total = data.courses.filter(matches).length;
    $('list-meta').textContent = `${total} of ${data.courses.length} courses` +
      (state.programme || state.unit || q ? ' match your filters' : '') +
      ' · drag a course onto the timetable, or use + Add';
  }

  function cardHtml(course, entry, list, clashes) {
    const units = course.units.map(u => `<span class="tag">${esc(u)}</span>`).join('');
    const meta = `${units}${esc(course.acronym ? course.acronym + ' · ' : '')}${esc(course.code)} · ${esc(course.typologies.join('/'))}`;
    if (!entry) {
      return `<article class="course-card" draggable="true" data-code="${esc(course.code)}">
        <div class="cc-head">
          <div><h3>${esc(course.name)}</h3><div class="cc-meta">${meta}</div></div>
          <button class="add-btn" data-act="add" aria-label="Add ${esc(course.name)}">+ Add</button>
        </div></article>`;
    }

    const mine = clashes.filter(c => c.x === entry || c.y === entry);
    const clashIds = new Set(mine.flatMap(c => [c.a.id, c.b.id]));
    const options = course.options.map(o => {
      const fits = optionFits(course, o, list);
      const days = [...new Set(o.sessions.map(s => S.WEEKDAYS_SHORT[s.day]))].join(', ');
      return `<option value="${esc(o.id)}"${o === entry.option ? ' selected' : ''}>${esc(o.label)} · ${days} — ${fits ? '✓ fits' : '⚠ overlaps'}</option>`;
    }).join('');

    const sessions = entry.option.sessions.map(s => {
      const allDates = s.weeks.map(w => S.shortDate(S.classDate(w, s.day))).join(', ');
      return `<li class="${clashIds.has(s.id) ? 'clash' : ''}" title="Dates: ${esc(allDates)}">
        <span class="when">${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)}</span>
        <span class="what">${esc(sectionLabel(s))}${s.room ? ' · ' + esc(s.room) : ''} · ${weeksText(s.weeks)}</span></li>`;
    }).join('');

    const notes = [...new Set(entry.option.sections.flatMap(s => s.studentNotes))]
      .map(n => `<div class="cc-note">ℹ ${esc(n)}</div>`).join('');

    const others = [...new Map(mine.map(c => {
      const other = c.x === entry ? c.y : c.x;
      const s = c.x === entry ? c.b : c.a;
      return [other.course.code + s.day + s.start, `${other.course.name} (${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)})`];
    })).values()];
    const clashHtml = others.length ? `<div class="cc-clash">⚠ Overlaps with ${esc(others.join(', '))}</div>` : '';

    return `<article class="course-card added${mine.length ? ' conflict' : ''}" draggable="true" data-code="${esc(course.code)}"
        style="--course-color:${entry.color[0]};--course-bg:${entry.color[1]}">
      <div class="cc-head">
        <div><h3>${esc(course.name)}</h3><div class="cc-meta">${meta}</div></div>
        <button class="add-btn is-added" data-act="remove" aria-label="Remove ${esc(course.name)}">
          <span class="when-idle">Added ✓</span><span class="when-hover">Remove ✕</span></button>
      </div>
      <div class="cc-body">
        <label class="field">${course.options.length > 1 ? 'Choose your section' : 'Section'}
          <select data-act="option">${options}</select></label>
        <ul class="session-list">${sessions}</ul>
        ${notes}${clashHtml}
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
    const shownClashes = state.week === 'typical' ? clashes : clashes.filter(c => c.weeks.includes(state.week));
    const clashIds = new Set(shownClashes.flatMap(c => [c.a.id, c.b.id]));
    const clashDays = new Set(shownClashes.map(c => c.a.day));

    let html = '<div class="tt-corner"></div>';
    S.WEEKDAYS.forEach((d, i) => {
      const date = state.week === 'typical' ? '' : `<small>${S.shortDate(S.classDate(state.week, i))}</small>`;
      html += `<div class="tt-dayhead${i === state.day ? ' current' : ''}">${d}${date}</div>`;
    });
    html += '<div class="tt-times">';
    for (let b = 0; b < BLOCKS; b++) html += `<div class="tt-time">${S.formatTime(S.DAY_START + b * 90)}</div>`;
    html += '</div>';

    let shownCount = 0;
    S.WEEKDAYS.forEach((d, day) => {
      const items = [];
      list.forEach(e => e.option.sessions.forEach(s => {
        if (s.day === day && inShownWeek(s) && s.end > S.DAY_START && s.start < S.DAY_END) items.push({ e, s });
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
        const dates = s.weeks.map(w => S.shortDate(S.classDate(w, s.day))).join(', ');
        const tip = `${e.course.name}\n${sectionLabel(s)} · ${timeRange(s)}${s.room ? ' · ' + s.room : ''}\nDates: ${dates}${clash ? '\n⚠ Overlaps with another class' : ''}`;
        html += `<div class="event${clash ? ' clash' : ''}" title="${esc(tip)}" draggable="true" data-code="${esc(e.course.code)}"
          style="top:calc(${top}% + 1px);height:calc(${height}% - 2px);left:calc(${left}% + 2px);width:calc(${width}% - 4px);--ev-fg:${e.color[0]};--ev-bg:${e.color[1]}">
          <button class="ev-remove" data-code="${esc(e.course.code)}" title="Remove ${esc(e.course.name)} from my timetable" aria-label="Remove ${esc(e.course.name)}">×</button>
          <b>${clash && lanes === 1 ? '⚠ ' : ''}${esc(courseTitle(e.course))}</b>
          <span>${esc(sectionLabel(s))} · ${timeRange(s)}</span>
          ${s.room ? `<span>${esc(s.room)}</span>` : ''}
          ${state.week === 'typical' ? `<span class="partial">${s.weeks.length} wk${s.weeks.length === 1 ? '' : 's'} · from ${S.shortDate(S.classDate(s.weeks[0], s.day))}</span>` : ''}
        </div>`;
      });
      html += '</div>';
    });

    if (!list.length) {
      html += `<div class="tt-empty">Your timetable is empty.<br>Add courses with “+ Add” or drag them here.</div>`;
    } else if (!shownCount) {
      html += `<div class="tt-empty">None of your courses have classes in this week.</div>`;
    }
    $('timetable').innerHTML = html;

    $('day-tabs').innerHTML = S.WEEKDAYS_SHORT.map((d, i) =>
      `<button role="tab" data-day="${i}" aria-selected="${i === state.day}" class="${i === state.day ? 'active' : ''}${clashDays.has(i) ? ' has-clash' : ''}">${d}${clashDays.has(i) ? ' ⚠' : ''}</button>`).join('');
  }

  function renderBanner(list, clashes) {
    const banner = $('banner');
    if (!list.length) {
      banner.className = 'banner';
      banner.textContent = 'Start by adding courses from the list. Each course lets you choose between its sections.';
      return;
    }
    if (clashes.length) {
      // One line per pair of courses and time slot.
      const lines = new Map();
      clashes.forEach(c => {
        const key = [c.x.course.code, c.y.course.code, c.a.day, c.a.start, c.b.start].join('|');
        const prev = lines.get(key);
        const weeks = new Set([...(prev ? prev.weeks : []), ...c.weeks]);
        lines.set(key, { c, weeks });
      });
      const items = [...lines.values()].map(({ c, weeks }) => {
        const w = [...weeks].sort();
        return `<li><b>${esc(c.x.course.name)}</b> (${esc(sectionLabel(c.a))}) and <b>${esc(c.y.course.name)}</b> (${esc(sectionLabel(c.b))}) · ${S.WEEKDAYS_SHORT[c.a.day]} ${timeRange(c.a)} / ${timeRange(c.b)} · ${weeksText(w)}</li>`;
      });
      banner.className = 'banner bad';
      banner.innerHTML = `<strong>⚠ ${items.length} overlap${items.length === 1 ? '' : 's'} in your timetable.</strong> Try another section for one of these courses:<ul>${items.join('')}</ul>`;
      return;
    }
    const weekly = list.reduce((n, e) => n + e.option.sessions.length, 0);
    banner.className = 'banner ok';
    banner.textContent = `✓ No overlaps · ${list.length} course${list.length === 1 ? '' : 's'} · ${weekly} class${weekly === 1 ? '' : 'es'} in a typical week`;
  }

  // Colour key under the timetable, like the one at the foot of the study plans.
  function renderLegend(list, clashes) {
    $('legend').innerHTML = list.map(e =>
      `<span style="--chip-fg:${e.color[0]};--chip-bg:${e.color[1]}">${esc(e.course.name)} · ${esc(e.option.label)}</span>`).join('') +
      (clashes.length ? '<span class="clash">⚠ Overlap</span>' : '');
  }

  function update() {
    const list = entries();
    const clashes = findClashes(list);
    renderList(list, clashes);
    renderTimetable(list, clashes);
    renderBanner(list, clashes);
    renderLegend(list, clashes);
    $('bar-week').textContent = state.week === 'typical'
      ? '· typical week'
      : `· ${S.shortDate(state.week)} – ${S.shortDate(S.addDays(state.week, 4))}`;
    $('switch-count').textContent = list.length ? `(${list.length})` : '';
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
    $('print-week').textContent = state.week === 'typical'
      ? 'Typical week (all classes)'
      : `Week of ${S.shortDate(state.week)} – ${S.shortDate(S.addDays(state.week, 4))}`;
    $('print-list').innerHTML = list.map(e =>
      `<p><b>${esc(e.course.name)}</b> (${esc(e.course.code)}) – ${esc(e.option.label)}: ` +
      e.option.sessions.map(s => `${S.WEEKDAYS_SHORT[s.day]} ${timeRange(s)}${s.room ? ' ' + esc(s.room) : ''}`).join('; ') + '</p>').join('');
  }

  /* ---------- Events ---------- */

  $('search').addEventListener('input', e => { state.search = e.target.value; update(); });
  $('programme').addEventListener('change', e => { state.programme = e.target.value; update(); });
  $('unit').addEventListener('change', e => { state.unit = e.target.value; update(); });
  $('week').addEventListener('change', e => { state.week = e.target.value; update(); });

  $('course-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const code = btn.closest('.course-card').dataset.code;
    if (btn.dataset.act === 'add') addCourse(code);
    else removeCourse(code);
  });
  $('course-list').addEventListener('change', e => {
    if (e.target.matches('select[data-act="option"]')) {
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
    window.scrollTo({ top: 0 });
  }
  $('show-courses').addEventListener('click', () => setView('courses'));
  $('show-timetable').addEventListener('click', () => setView('timetable'));

  $('export-ics').addEventListener('click', () => {
    const list = entries();
    if (!list.length) { alert('Add at least one course first.'); return; }
    const { text } = buildIcs(list);
    download('my-timetable.ics', text, 'text/calendar;charset=utf-8');
  });
  $('print').addEventListener('click', () => { preparePrint(); window.print(); });
  window.addEventListener('beforeprint', preparePrint);
  $('clear-all').addEventListener('click', () => {
    if (!state.selections.size) return;
    if (confirm('Remove all courses from your timetable?')) { state.selections.clear(); update(); }
  });
  $('preview-clear').addEventListener('click', () => {
    forget(PREVIEW_KEY);
    forget('scheduleSandbox.student.preview.v1');
    location.reload();
  });

  renderFilters();
  update();

  // Exposed for testing in the browser console.
  window.ScheduleSandbox = { data, state, entries, findClashes, buildIcs, addCourse, removeCourse, setOption, update };
})();
