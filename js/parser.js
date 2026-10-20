/*
 * Schedule Sandbox – data rules.
 *
 * Everything that turns a "Bullet extraction" export into courses, sections
 * and options lives here, so the admin screen and the student screen always
 * apply exactly the same rules. See CLAUDE.md for the rules in plain words.
 */
(function (global) {
  'use strict';

  const DAY_START = 8 * 60;   // 08:00, in minutes after midnight
  const DAY_END = 20 * 60;    // 20:00
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const TYPOLOGIES = ['T', 'PL', 'TP', 'O', 'S'];

  // Columns the app uses. Any other columns in the export are ignored.
  const COLUMNS = [
    'ModuleName', 'ModuleAcronym', 'ModuleCode', 'Typology', 'SectionName',
    'StudentGroup', 'Unit', 'Classroom', 'WeekdayName', 'StartTime', 'EndTime',
    'Week', 'Annotations',
  ];
  const REQUIRED = [
    'ModuleName', 'ModuleCode', 'Typology', 'SectionName',
    'WeekdayName', 'StartTime', 'EndTime', 'Week',
  ];

  const DAY_NAMES = {
    monday: 0, mon: 0, segunda: 0, 'segunda-feira': 0,
    tuesday: 1, tue: 1, 'terça': 1, 'terça-feira': 1, terca: 1, 'terca-feira': 1,
    wednesday: 2, wed: 2, quarta: 2, 'quarta-feira': 2,
    thursday: 3, thu: 3, quinta: 3, 'quinta-feira': 3,
    friday: 4, fri: 4, sexta: 4, 'sexta-feira': 4,
    saturday: 5, sat: 5, 'sábado': 5, sabado: 5,
    sunday: 6, sun: 6, domingo: 6,
  };

  /* ---------- Small helpers ---------- */

  function text(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(min) {
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  // Dates are handled as "YYYY-MM-DD" strings and UTC dates, so the result
  // never shifts by a day because of the computer's time zone.
  function isoToDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function dateToIso(date) {
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  function addDays(iso, days) {
    const d = isoToDate(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return dateToIso(d);
  }

  function excelSerialToIso(n) {
    return dateToIso(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000));
  }

  // Accepts 09:30, 9:30, 09:30:00, 9h30, 9:30 AM, an Excel time (0.395…) or a Date.
  function parseTime(v) {
    if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
    if (typeof v === 'number') {
      const frac = v % 1;
      return Math.round(frac * 1440);
    }
    const s = text(v);
    const m = s.match(/^(\d{1,2})\s*[:h.]\s*(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(am|pm)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (m[3]) {
      const pm = m[3].toLowerCase() === 'pm';
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
    }
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function parseDay(v) {
    const s = text(v).toLowerCase();
    if (s in DAY_NAMES) return DAY_NAMES[s];
    return null;
  }

  // "Week" is a list of Mondays: "2026-08-31,2026-09-07". Also accepts
  // dd/mm/yyyy and Excel date numbers, in case the export was re-saved in Excel.
  function parseWeeks(v) {
    if (v instanceof Date) return { weeks: [dateToIso(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())))], bad: [] };
    if (typeof v === 'number') return { weeks: [excelSerialToIso(v)], bad: [] };
    const weeks = [];
    const bad = [];
    text(v).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).forEach(part => {
      let m = part.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) { weeks.push(m[1] + '-' + pad(m[2]) + '-' + pad(m[3])); return; }
      m = part.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (m) { weeks.push(m[3] + '-' + pad(m[2]) + '-' + pad(m[1])); return; }
      if (/^\d{5}$/.test(part)) { weeks.push(excelSerialToIso(Number(part))); return; }
      bad.push(part);
    });
    return { weeks, bad };
  }

  function toMonday(iso) {
    const day = (isoToDate(iso).getUTCDay() + 6) % 7; // Monday = 0
    return addDays(iso, -day);
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Does this note mention that section name? "PL1" must not match "PL1-A" or "PL10".
  function mentions(note, sectionName) {
    const re = new RegExp('(^|[^A-Za-z0-9-])' + escapeRegExp(sectionName) + '(?![A-Za-z0-9]|-[A-Za-z0-9])', 'i');
    return re.test(note);
  }

  function sectionNumber(name) {
    const m = name.match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  }

  /* ---------- Programs and periods (for the student filters) ---------- */

  // MP_Man_SEI_S1_PA -> MP_Man_SEI, MP_Fin_S3_PB -> MP_Fin, MSc_Econ_1 -> MSc_Econ
  function programmeOf(group) {
    return group.replace(/_S\d+(_P[A-Z0-9]+)?$/i, '').replace(/_\d+$/, '');
  }

  function programmeLabel(code) {
    const elec = code.match(/^ELEC_?(.*)$/i);
    if (elec) return 'Electives' + (elec[1] ? ' (' + elec[1].replace(/_/g, ' ') + ')' : '');
    return code.replace(/_/g, ' ');
  }

  function unitLabel(unit) {
    let m = unit.match(/^S(\d+)$/i);
    if (m) return 'Semester ' + m[1] + ' (' + unit + ')';
    m = unit.match(/^T(\d+)$/i);
    if (m) return 'Term ' + m[1] + ' (' + unit + ')';
    return unit;
  }

  /* ---------- Reading files ---------- */

  // Turns a spreadsheet's rows into objects with our column names.
  // Header matching ignores case, spaces and a leading byte-order mark.
  function normaliseRows(rawRows) {
    if (!rawRows.length) return { rows: [], missingColumns: REQUIRED.slice() };
    const headerMap = {};
    Object.keys(rawRows[0]).forEach(key => {
      const clean = key.replace(/^﻿/, '').replace(/\s+/g, '').toLowerCase();
      const match = COLUMNS.find(c => c.toLowerCase() === clean);
      if (match) headerMap[key] = match;
    });
    const found = new Set(Object.values(headerMap));
    const missingColumns = REQUIRED.filter(c => !found.has(c));
    const rows = rawRows.map(raw => {
      const row = {};
      COLUMNS.forEach(c => { row[c] = ''; });
      Object.entries(raw).forEach(([key, value]) => {
        if (headerMap[key]) row[headerMap[key]] = value;
      });
      return row;
    });
    return { rows, missingColumns };
  }

  // Reads an .xlsx/.xls/.csv File with SheetJS. Uses the first sheet.
  async function readFile(XLSX, file) {
    let wb;
    if (/\.csv$/i.test(file.name)) {
      // raw: keep every value as typed in the CSV (no automatic date guessing).
      wb = XLSX.read(await file.text(), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    }
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    return normaliseRows(rawRows);
  }

  // Rows in a tidy, text-only form: what gets published to students.
  function cleanRows(rows) {
    return rows.map(r => {
      const out = {};
      COLUMNS.forEach(c => { out[c] = r[c]; });
      const s = parseTime(r.StartTime);
      const e = parseTime(r.EndTime);
      if (s !== null) out.StartTime = formatTime(s);
      if (e !== null) out.EndTime = formatTime(e);
      const w = parseWeeks(r.Week);
      if (!w.bad.length && w.weeks.length) out.Week = w.weeks.join(',');
      COLUMNS.forEach(c => { out[c] = text(out[c]); });
      return out;
    });
  }

  /* ---------- Building the dataset ---------- */

  function buildDataset(rows) {
    const issues = [];
    const add = (level, message, course) => issues.push({ level, message, course: course || null });
    const courses = new Map();
    const seen = new Set();
    let sessionCount = 0;
    let skipped = 0;
    let sessionId = 0;

    rows.forEach((r, i) => {
      const line = i + 2; // row 1 is the header in the spreadsheet
      const missing = REQUIRED.filter(k => !text(r[k]));
      if (missing.length) {
        if (Object.values(r).every(v => !text(v))) return; // blank line
        add('warning', `Row ${line}: skipped – missing ${missing.join(', ')}.`);
        skipped++;
        return;
      }
      const code = text(r.ModuleCode);
      const name = text(r.ModuleName);
      const sectionName = text(r.SectionName);
      const where = `Row ${line} (${name}, ${sectionName})`;

      const day = parseDay(r.WeekdayName);
      if (day === null || day > 4) {
        add('warning', `${where}: skipped – weekday "${text(r.WeekdayName)}" is not Monday to Friday.`, code);
        skipped++;
        return;
      }
      const start = parseTime(r.StartTime);
      const end = parseTime(r.EndTime);
      if (start === null || end === null || end <= start) {
        add('warning', `${where}: skipped – start/end time "${text(r.StartTime)}–${text(r.EndTime)}" is not valid.`, code);
        skipped++;
        return;
      }
      const parsedWeeks = parseWeeks(r.Week);
      if (parsedWeeks.bad.length) {
        add('warning', `${where}: could not read week value(s) "${parsedWeeks.bad.join(', ')}"; they were ignored.`, code);
      }
      const weeks = [];
      parsedWeeks.weeks.forEach(w => {
        const monday = toMonday(w);
        if (monday !== w) add('warning', `${where}: week ${w} is not a Monday; used the Monday of that week (${monday}).`, code);
        if (!weeks.includes(monday)) weeks.push(monday);
      });
      weeks.sort();
      if (!weeks.length) {
        add('warning', `${where}: skipped – no valid weeks.`, code);
        skipped++;
        return;
      }

      const typ = text(r.Typology).toUpperCase();
      if (!TYPOLOGIES.includes(typ)) {
        add('warning', `${where}: unknown typology "${typ}" (expected T, PL, TP, O or S). It is kept as its own section.`, code);
      }

      let course = courses.get(code);
      if (!course) {
        course = {
          code,
          name,
          acronym: text(r.ModuleAcronym),
          units: new Set(),
          groups: new Set(),
          sections: new Map(),
        };
        courses.set(code, course);
      } else if (course.name !== name) {
        add('warning', `${where}: module code ${code} also appears as "${course.name}". Using "${course.name}".`, code);
      }

      let section = course.sections.get(sectionName);
      if (!section) {
        section = { name: sectionName, typ, sessions: [], groups: new Set(), notes: [], studentNotes: [] };
        course.sections.set(sectionName, section);
      } else if (section.typ !== typ) {
        add('warning', `${where}: section ${sectionName} appears with typologies ${section.typ} and ${typ}. Using ${section.typ}.`, code);
      }

      const groups = text(r.StudentGroup).split(',').map(s => s.trim()).filter(Boolean);
      const unit = text(r.Unit);
      const room = text(r.Classroom);
      const key = [code, sectionName, day, start, end, weeks.join(','), room].join('|');
      if (seen.has(key)) {
        add('warning', `${where}: duplicate of an earlier row; ignored.`, code);
        return;
      }
      seen.add(key);

      if (start < DAY_START || end > DAY_END) {
        add('warning', `${where}: ${WEEKDAYS[day]} ${formatTime(start)}–${formatTime(end)} is outside 08:00–20:00. It is kept, but the timetable only shows 08:00–20:00.`, code);
      }

      if (unit) course.units.add(unit);
      groups.forEach(g => { course.groups.add(g); section.groups.add(g); });
      const note = text(r.Annotations);
      if (note && !section.notes.includes(note)) section.notes.push(note);

      section.sessions.push({
        id: 's' + (++sessionId),
        day, start, end, weeks, weekSet: new Set(weeks), room, unit,
        sectionName, typ,
      });
      sessionCount++;
    });

    courses.forEach(course => buildOptions(course, add));

    // Final shape, sorted by course name.
    const list = [...courses.values()].sort((a, b) => a.name.localeCompare(b.name));
    const allWeeks = new Set();
    const programmes = new Map();
    const units = new Set();
    let sectionCount = 0;
    list.forEach(c => {
      c.units = [...c.units].sort();
      c.groups = [...c.groups].sort();
      c.programmes = [...new Set(c.groups.map(programmeOf))].sort();
      c.programmes.forEach(p => programmes.set(p, programmeLabel(p)));
      c.units.forEach(u => units.add(u));
      c.typologies = [...new Set([...c.sections.values()].map(s => s.typ))].sort();
      sectionCount += c.sections.size;
      c.sections.forEach(s => s.sessions.forEach(ss => ss.weeks.forEach(w => allWeeks.add(w))));
      c.sections = [...c.sections.values()].sort(byName);
      c.sections.forEach(s => { s.groups = [...s.groups].sort(); });
    });

    if (!list.length) add('error', 'No usable rows were found in this file.');

    const terms = computeTerms(list);

    return {
      courses: list,
      terms,
      byCode: new Map(list.map(c => [c.code, c])),
      weeks: [...allWeeks].sort(),
      units: [...units].sort().map(u => ({ code: u, label: unitLabel(u) })),
      programmes: [...programmes.entries()]
        .map(([code, label]) => ({ code, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      issues,
      stats: {
        rows: rows.length,
        skipped,
        courses: list.length,
        sections: sectionCount,
        sessions: sessionCount,
        options: list.reduce((n, c) => n + c.options.length, 0),
      },
    };
  }

  /*
   * Decide what a student can choose for one course ("options").
   *
   * - No PL sections: one option per section.
   * - With PL sections: one option per PL. Each PL brings its paired lecture
   *   section(s) along. The lecture typology is T, or TP when the course has
   *   no T at all (e.g. Macroeconomics: PL1 + TP1).
   * - Pairing comes from Annotations on lecture rows ("For PL-G1, PL-G2 …").
   *   A PL not mentioned in any note goes with the lecture section(s) that
   *   have no pairing note. If there are several such lectures, PLs are
   *   matched by section number (PL1-A -> T1) and the admin is warned.
   */
  function buildOptions(course, add) {
    const secs = [...course.sections.values()].sort(byName);
    const pls = secs.filter(s => s.typ === 'PL');

    if (!pls.length) {
      secs.forEach(s => { s.studentNotes = s.notes.slice(); });
      course.options = secs.map(s => makeOption(s.name, [s]));
      return;
    }

    const lectureTyp = secs.some(s => s.typ === 'T') ? 'T' : secs.some(s => s.typ === 'TP') ? 'TP' : null;
    const lectures = secs.filter(s => s.typ === lectureTyp);
    const others = secs.filter(s => s.typ !== 'PL' && s.typ !== lectureTyp);
    const pairs = new Map(pls.map(p => [p.name, []]));
    const noted = new Set();

    secs.forEach(s => {
      s.notes.forEach(note => {
        const mentioned = pls.filter(p => mentions(note, p.name));
        if (mentioned.length && s.typ === lectureTyp) {
          noted.add(s);
          mentioned.forEach(p => pairs.get(p.name).push(s));
        } else {
          if (mentioned.length) {
            add('warning', `${course.name}: the note on ${s.typ} section ${s.name} mentions PL sections, but only ${lectureTyp || 'T'} notes decide pairing. It is shown to students as a normal note.`, course.code);
          }
          s.studentNotes.push(note);
        }
      });
    });

    const free = lectures.filter(l => !noted.has(l));
    const autoPaired = [];
    pls.forEach(p => {
      const list = pairs.get(p.name);
      if (list.length) return;
      if (free.length === 1) {
        list.push(free[0]);
      } else if (free.length > 1) {
        const n = sectionNumber(p.name);
        const match = free.filter(l => sectionNumber(l.name) === n);
        if (n !== null && match.length === 1) {
          list.push(match[0]);
          autoPaired.push(`${p.name} → ${match[0].name}`);
        } else {
          add('warning', `${course.name}: PL ${p.name} is not paired. It isn't in any pairing note and couldn't be matched to one of the ${lectureTyp} sections (${free.map(f => f.name).join(', ')}). Students will see it without a ${lectureTyp}.`, course.code);
        }
      } else {
        add('warning', `${course.name}: PL ${p.name} is not paired – there is no ${lectureTyp || 'T'} section left to pair it with. Students will see it on its own.`, course.code);
      }
    });

    if (autoPaired.length) {
      add('warning', `${course.name}: ${free.length} ${lectureTyp} sections have no pairing notes, so PLs were paired by section number: ${autoPaired.join(', ')}. Please check, and add notes to the ${lectureTyp} rows to make it official.`, course.code);
    }

    const used = new Set();
    pairs.forEach(list => list.forEach(l => used.add(l)));
    lectures.filter(l => !used.has(l)).forEach(l => {
      add('warning', `${course.name}: ${lectureTyp} section ${l.name} is not paired with any PL, so students can't choose it.`, course.code);
    });
    if (others.length) {
      add('warning', `${course.name}: section(s) ${others.map(o => `${o.name} (${o.typ})`).join(', ')} are not part of a ${lectureTyp}/PL pair and are not offered to students.`, course.code);
    }

    // Label puts the PL first, because that is what the student is choosing.
    course.options = pls.map(p => {
      const lects = pairs.get(p.name).sort(byName);
      return makeOption(p.name, [...lects, p], [p, ...lects].map(s => s.name).join(' + '));
    });
  }

  function makeOption(id, sections, label) {
    return {
      id,
      label: label || sections.map(s => s.name).join(' + '),
      sections,
      sessions: sections.flatMap(s => s.sessions)
        .slice()
        .sort((a, b) => a.day - b.day || a.start - b.start),
    };
  }

  /* ---------- Trimesters ---------- */

  /*
   * Work out the two trimesters of each semester from the courses' Units:
   *   semester 1 = units S1, T1, T2  ->  Trimester 1 and Trimester 2
   *   semester 2 = units S2, T3, T4  ->  Trimester 3 and Trimester 4
   * A trimester's dates are the weeks of the courses tagged with it. If one
   * trimester has no courses (e.g. a T2-only export), it is the rest of the
   * semester's weeks before (or after) the other trimester. A semester with
   * only S courses can't be split and is shown as one period.
   * Returns [{ id, label, start, end, inferred }], start/end = Mondays.
   */
  const SEMESTERS = [
    { sem: 'S1', first: 'T1', second: 'T2' },
    { sem: 'S2', first: 'T3', second: 'T4' },
  ];

  function computeTerms(courses) {
    const weeksOf = unit => {
      const set = new Set();
      courses.forEach(c => {
        if (!c.units.includes(unit)) return;
        c.sections.forEach(s => s.sessions.forEach(ss => { if (ss.unit === unit) ss.weeks.forEach(w => set.add(w)); }));
      });
      return [...set].sort();
    };
    const terms = [];
    SEMESTERS.forEach(({ sem, first, second }) => {
      const a = weeksOf(first);
      const b = weeksOf(second);
      const all = [...new Set([...weeksOf(sem), ...a, ...b])].sort();
      if (!all.length) return;
      const label = id => 'Trimester ' + id.slice(1);
      if (!a.length && !b.length) {
        terms.push({ id: sem, label: 'Semester ' + sem.slice(1), start: all[0], end: all[all.length - 1], inferred: false });
        return;
      }
      let t1;
      let t2;
      if (a.length && b.length) {
        t1 = { start: a[0], end: a[a.length - 1], inferred: false };
        t2 = { start: b[0], end: b[b.length - 1], inferred: false };
      } else if (b.length) {
        const before = all.filter(w => w < b[0]);
        t2 = { start: b[0], end: b[b.length - 1], inferred: false };
        t1 = before.length ? { start: before[0], end: before[before.length - 1], inferred: true } : null;
      } else {
        const after = all.filter(w => w > a[a.length - 1]);
        t1 = { start: a[0], end: a[a.length - 1], inferred: false };
        t2 = after.length ? { start: after[0], end: after[after.length - 1], inferred: true } : null;
      }
      if (t1) terms.push(Object.assign({ id: first, label: label(first) }, t1));
      if (t2) terms.push(Object.assign({ id: second, label: label(second) }, t2));
    });
    return terms;
  }

  function inTerm(session, term) {
    return session.weeks.some(w => w >= term.start && w <= term.end);
  }

  function termWeeks(session, term) {
    return session.weeks.filter(w => w >= term.start && w <= term.end);
  }

  /* ---------- Overlaps ---------- */

  // Two classes only overlap if they share the day, the time AND a week.
  function sessionsOverlap(a, b) {
    if (a.day !== b.day || a.start >= b.end || b.start >= a.end) return false;
    return a.weeks.some(w => b.weekSet.has(w));
  }

  function sharedWeeks(a, b) {
    return a.weeks.filter(w => b.weekSet.has(w));
  }

  /* ---------- Dates ---------- */

  function classDate(mondayIso, day) {
    return addDays(mondayIso, day);
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) {
    const d = isoToDate(iso);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }

  global.Schedule = {
    DAY_START, DAY_END, WEEKDAYS, WEEKDAYS_SHORT, COLUMNS, REQUIRED,
    readFile, normaliseRows, cleanRows, buildDataset,
    sessionsOverlap, sharedWeeks, classDate, computeTerms, inTerm, termWeeks, addDays, shortDate, formatTime,
    parseTime, parseWeeks, programmeOf, programmeLabel, unitLabel, mentions,
  };
})(window);
