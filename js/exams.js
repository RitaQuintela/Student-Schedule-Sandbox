/*
 * Schedule Sandbox – exam rules.
 *
 * Reads the Integrated Exams Planner (.xlsm/.xlsx), keeps the Master (MSc)
 * exams from its ExamData sheet, links them to timetable courses by name and
 * finds clashes. Shared by the admin and student screens. See CLAUDE.md.
 */
(function (global) {
  'use strict';

  const S = global.Schedule;
  const CYCLE = 'msc'; // only Master exams are used

  function text(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // Excel dates arrive as serial numbers (e.g. 46310) or as text.
  function toIso(v) {
    if (typeof v === 'number' && v > 20000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    const s = text(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    return null;
  }

  function lower(v) {
    return text(v).toLowerCase();
  }

  /* ---------- Reading the planner ---------- */

  function sheetRows(XLSX, wb, name) {
    const real = wb.SheetNames.find(n => n.trim().toLowerCase() === name.toLowerCase());
    if (!real) return null;
    return XLSX.utils.sheet_to_json(wb.Sheets[real], { header: 1, raw: true, defval: '' });
  }

  // The header row isn't always row 1 (the planner has a title above it).
  function findHeader(rows, needed) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const cells = rows[i].map(lower);
      if (needed.every(n => cells.includes(n))) {
        const col = {};
        cells.forEach((c, j) => { if (c && !(c in col)) col[c] = j; });
        return { index: i, col };
      }
    }
    return null;
  }

  // Returns { exams, periods, issues }. Nothing is changed in the file.
  async function readExamFile(XLSX, file) {
    const issues = [];
    // SheetJS only reads cell values; macros in an .xlsm are never run.
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

    let rows = sheetRows(XLSX, wb, 'ExamData');
    let head = rows && findHeader(rows, ['date', 'course']);
    if (!head) {
      // Fallback: any sheet with Date and Course columns (e.g. a simple list).
      for (const name of wb.SheetNames) {
        rows = sheetRows(XLSX, wb, name);
        head = findHeader(rows, ['date', 'course']);
        if (head) break;
      }
    }
    if (!head) {
      issues.push({ level: 'error', message: 'No ExamData sheet (or any sheet with “Date” and “Course” columns) was found. Upload the Integrated Exams Planner.' });
      return { exams: [], periods: [], issues };
    }

    const c = head.col;
    const get = (r, name) => (name in c ? r[c[name]] : '');
    const all = rows.slice(head.index + 1)
      .filter(r => text(get(r, 'course')) || text(get(r, 'date')))
      .map((r, i) => ({
        line: head.index + i + 2,
        period: text(get(r, 'period id')),
        cycle: lower(get(r, 'cycle')),
        season: text(get(r, 'season')) || 'Exams',
        date: toIso(get(r, 'date')),
        course: text(get(r, 'course')),
      }));

    const hasCycle = 'cycle' in c;
    const master = hasCycle ? all.filter(e => e.cycle === CYCLE) : all;
    if (hasCycle && !master.length) {
      issues.push({ level: 'error', message: 'The file has no Master (MSc) exams in its ExamData sheet.' });
    }

    const seen = new Set();
    const exams = [];
    master.forEach(e => {
      if (!e.course) return;
      if (!e.date) {
        issues.push({ level: 'warning', message: `Row ${e.line} (${e.course}): the date could not be read, so this exam was skipped.` });
        return;
      }
      // The planner repeats an exam once per program/track: keep one.
      const key = [e.period, e.date, e.course].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      exams.push({ period: e.period || e.season, season: e.season, date: e.date, course: e.course });
    });
    exams.sort((a, b) => a.date.localeCompare(b.date) || a.course.localeCompare(b.course));

    // Exam seasons and their date ranges, from the Periods sheet if present.
    const periods = [];
    const prow = sheetRows(XLSX, wb, 'Periods');
    const phead = prow && findHeader(prow, ['period id', 'start date 1', 'end date 1']);
    if (phead) {
      const pc = phead.col;
      prow.slice(phead.index + 1).forEach(r => {
        const id = text(r[pc['period id']]);
        if (!id) return;
        if ('cycle' in pc && lower(r[pc['cycle']]) !== CYCLE) return;
        if ('active' in pc && lower(r[pc['active']]) === 'no') return;
        const ranges = [];
        [1, 2, 3].forEach(n => {
          const s = toIso(r[pc['start date ' + n]]);
          const e = toIso(r[pc['end date ' + n]]);
          if (s && e) ranges.push({ start: s, end: e });
        });
        if (ranges.length) periods.push({ id, season: text(r[pc['season']]) || id, ranges });
      });
    }
    // Any season with exams but no Periods row: use its first to last exam date.
    const known = new Set(periods.map(p => p.id));
    [...new Set(exams.map(e => e.period))].forEach(id => {
      if (known.has(id)) return;
      const dates = exams.filter(e => e.period === id).map(e => e.date).sort();
      periods.push({ id, season: exams.find(e => e.period === id).season, ranges: [{ start: dates[0], end: dates[dates.length - 1] }] });
    });
    periods.sort((a, b) => a.ranges[0].start.localeCompare(b.ranges[0].start));

    // Exams outside their season's dates are probably typos.
    exams.forEach(e => {
      const p = periods.find(x => x.id === e.period);
      if (p && !p.ranges.some(r => e.date >= r.start && e.date <= r.end)) {
        issues.push({ level: 'warning', message: `${e.course}: exam on ${S.shortDate(e.date)} is outside the ${p.season} dates.` });
      }
    });

    return { exams, periods, issues };
  }

  /* ---------- Matching exams to timetable courses ---------- */

  // "Business Ethics & Social Responsibility" and "Business Ethics and Social
  // Responsibility" become the same; also ignores accents, hyphens, text in
  // brackets ("(IMSc)") and a final "s" ("Foundation"/"Foundations").
  function normName(name) {
    return text(name)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
      .join(' ');
  }

  // "Language Courses" in the planner stands for every language course.
  const LANGUAGE_EXAM = normName('Language Courses');
  const isLanguageCourse = name => /language|extensive course/i.test(name);

  // Returns, for the given timetable courses:
  //   byCode: course code -> list of exams
  //   unmatched: exam course names with no timetable course
  //   loose: [exam name, course name] pairs matched despite different spelling
  //   noExam: timetable courses with no exam in the file
  //   beforeStart: exams ignored because they fall before the course's first class
  //                (the same course name taught in an earlier term, e.g. T1 vs T2)
  function firstClassWeek(course) {
    let first = null;
    (course.sections || []).forEach(s => s.sessions.forEach(ss => {
      if (ss.weeks.length && (!first || ss.weeks[0] < first)) first = ss.weeks[0];
    }));
    return first; // Monday of the first teaching week
  }

  function linkExams(examData, courses) {
    const byNorm = new Map();
    courses.forEach(c => {
      const k = normName(c.name);
      if (!byNorm.has(k)) byNorm.set(k, []);
      byNorm.get(k).push(c);
    });
    const byCode = new Map();
    const unmatched = new Set();
    const loose = new Map();
    const beforeStart = [];
    (examData.exams || []).forEach(e => {
      const k = normName(e.course);
      const targets = k === LANGUAGE_EXAM ? courses.filter(c => isLanguageCourse(c.name)) : byNorm.get(k) || [];
      if (!targets.length) { unmatched.add(e.course); return; }
      targets.forEach(c => {
        const first = firstClassWeek(c);
        if (first && e.date < first) { beforeStart.push({ exam: e, course: c }); return; }
        if (c.name !== e.course) loose.set(e.course + '→' + c.name, [e.course, c.name]);
        if (!byCode.has(c.code)) byCode.set(c.code, []);
        const list = byCode.get(c.code);
        if (!list.some(x => x.date === e.date && x.period === e.period)) list.push(e);
      });
    });
    byCode.forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
    return {
      byCode,
      unmatched: [...unmatched].sort(),
      loose: [...loose.values()],
      beforeStart,
      noExam: courses.filter(c => !byCode.has(c.code)).map(c => c.name),
    };
  }

  /*
   * For a course taught in several trimesters, an exam belongs to the edition
   * that has started by the exam date and finished most recently: a 19 Oct
   * exam goes to the T1 edition (T2 hasn't started), a 19 Dec exam to T2.
   * Courses with one edition keep all their exams.
   */
  function examsForOption(course, option, exams) {
    if (!exams || !exams.length || !option) return exams || [];
    const editions = new Map();
    course.options.forEach(o => {
      const t = o.term || '';
      o.sessions.forEach(ss => ss.weeks.forEach(w => {
        const r = editions.get(t) || { first: w, last: w };
        if (w < r.first) r.first = w;
        if (w > r.last) r.last = w;
        editions.set(t, r);
      }));
    });
    if (editions.size <= 1) return exams;
    const mine = option.term || '';
    return exams.filter(e => {
      let best = null;
      editions.forEach((r, t) => {
        if (r.first <= e.date && (best === null || r.last > editions.get(best).last)) best = t;
      });
      return best === mine;
    });
  }

  /* ---------- Clashes ---------- */

  // items: [{ course, exam }] for the student's chosen courses.
  // Same day = clash (red). Consecutive days = close (amber).
  function findExamClashes(items) {
    const byDate = new Map();
    items.forEach(it => {
      if (!byDate.has(it.exam.date)) byDate.set(it.exam.date, []);
      const list = byDate.get(it.exam.date);
      if (!list.some(x => x.course.code === it.course.code)) list.push(it);
    });
    const clashes = [];
    byDate.forEach((list, date) => { if (list.length > 1) clashes.push({ date, items: list }); });
    const close = [];
    const dates = [...byDate.keys()].sort();
    dates.forEach(d => {
      const next = S.addDays(d, 1);
      if (!byDate.has(next)) return;
      const a = byDate.get(d);
      const b = byDate.get(next);
      if (a.some(x => b.some(y => y.course.code !== x.course.code))) close.push({ date: d, next, items: [...a, ...b] });
    });
    clashes.sort((x, y) => x.date.localeCompare(y.date));
    return { byDate, clashes, close, clashDates: new Set(clashes.map(c => c.date)) };
  }

  // Every date of a season (all days, as in the planner's views).
  function seasonDays(period) {
    const days = [];
    period.ranges.forEach(r => {
      for (let d = r.start; d <= r.end; d = S.addDays(d, 1)) days.push(d);
    });
    return days;
  }

  // "Midterms" -> "Midterm"
  function seasonSingular(season) {
    return season.replace(/s$/i, '');
  }

  function weekdayShort(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  global.Exams = {
    readExamFile, linkExams, examsForOption, findExamClashes, seasonDays, seasonSingular, weekdayShort, normName, toIso,
  };
})(window);
