/*
 * Schedule Sandbox – admin screen.
 * Reads an uploaded export, shows a summary and problems, and lets the admin
 * preview it in the student view or download the publishable data file.
 */
(function () {
  'use strict';

  const S = window.Schedule;
  const PREVIEW_KEY = 'scheduleSandbox.adminPreview.v1';
  const $ = id => document.getElementById(id);
  let current = null; // { source, rows, dataset }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showPreviewStatus() {
    let preview = null;
    try { preview = JSON.parse(localStorage.getItem(PREVIEW_KEY)); } catch (e) { /* ignore */ }
    const el = $('current-preview');
    if (preview && preview.rows) {
      el.innerHTML = `This browser is currently previewing “${esc(preview.source || 'file')}” in the student view. ` +
        `<button class="btn small" id="clear-preview">Stop preview</button>`;
      el.hidden = false;
      $('clear-preview').onclick = () => {
        try { localStorage.removeItem(PREVIEW_KEY); } catch (e) { /* ignore */ }
        showPreviewStatus();
      };
    } else {
      el.hidden = true;
    }
  }

  async function handleFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = await S.readFile(window.XLSX, file);
    } catch (err) {
      current = null;
      renderError(file.name, 'This file could not be read. Is it an .xlsx or .csv export? (' + err.message + ')');
      return;
    }
    const rows = S.cleanRows(parsed.rows);
    const dataset = S.buildDataset(rows);
    if (parsed.missingColumns.length) {
      dataset.issues.unshift({ level: 'error', message: `Missing column(s): ${parsed.missingColumns.join(', ')}. Check that the first row has the column names (see the template).` });
    }
    current = { source: file.name, rows, dataset };
    render();
  }

  function renderError(name, message) {
    $('result').hidden = false;
    $('file-name').textContent = name;
    $('stats').innerHTML = '';
    $('issues').innerHTML = `<ul class="issues"><li class="error">${esc(message)}</li></ul>`;
    $('courses').innerHTML = '';
    $('apply').disabled = true;
    $('download-data').disabled = true;
    $('publish-data').disabled = true;
    $('blocked').hidden = false;
  }

  function render() {
    const { dataset: d, source } = current;
    $('result').hidden = false;
    $('file-name').textContent = `File: ${source}`;

    const weeks = d.weeks.length ? `${S.shortDate(d.weeks[0])} – ${S.shortDate(S.addDays(d.weeks[d.weeks.length - 1], 4))}` : '–';
    const tiles = [
      [d.stats.courses, 'courses'],
      [d.stats.sections, 'sections'],
      [d.stats.sessions, 'weekly classes (rows used)'],
      [d.stats.options, 'choices for students'],
      [d.stats.skipped, 'rows skipped'],
      [d.units.map(u => u.code).join(', ') || '–', 'periods'],
      [d.weeks.length, 'teaching weeks · ' + weeks],
    ];
    $('stats').innerHTML = tiles.map(([n, l]) => `<div class="stat"><div class="num">${esc(n)}</div><div class="lbl">${esc(l)}</div></div>`).join('');

    // Trimesters students can choose on the timetable (dates come from the Units).
    $('terms-info').innerHTML = d.terms.length
      ? `<ul class="issues">${d.terms.map(t => `<li class="${t.inferred ? 'warning' : 'info'}">${t.inferred ? '⚠' : 'ℹ'} <b>${esc(t.label)}</b>: ` +
          `${S.shortDate(t.start)} – ${S.shortDate(S.addDays(t.end, 4))}` +
          (t.inferred ? ' – no courses are tagged with this trimester, so these dates are the rest of the semester. Please check.' : '') +
          '</li>').join('')}</ul>`
      : '';

    const errors = d.issues.filter(i => i.level === 'error');
    const warnings = d.issues.filter(i => i.level === 'warning');
    if (!errors.length && !warnings.length) {
      $('issues').innerHTML = '<div class="issues-ok">✓ No problems found.</div>';
    } else {
      const list = arr => `<ul class="issues">${arr.map(i => `<li class="${i.level}">${i.level === 'error' ? '✕' : '⚠'} ${esc(i.message)}</li>`).join('')}</ul>`;
      $('issues').innerHTML =
        (errors.length ? `<p class="lead"><b>${errors.length} error(s)</b> – these must be fixed before applying.</p>${list(errors)}` : '') +
        (warnings.length ? `<p class="lead" style="margin-top:10px"><b>${warnings.length} warning(s)</b> – the file can be applied, but please check these.</p>${list(warnings)}` : '');
    }

    $('courses').innerHTML = '<tr><th>Course</th><th>Code</th><th>Period</th><th>Programs</th><th>Choices for students</th></tr>' +
      d.courses.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.code)}</td><td>${esc(c.units.join(', '))}</td>
        <td>${esc(c.programmes.join(', '))}</td><td>${c.options.map(o => esc(o.label)).join('<br>')}</td></tr>`).join('');

    const blocked = errors.length > 0;
    $('apply').disabled = blocked;
    $('download-data').disabled = blocked;
    $('publish-data').disabled = blocked;
    $('blocked').hidden = !blocked;
    setStatus('publish-status', '', '');
  }

  function payload() {
    return { generatedAt: new Date().toISOString(), source: current.source, rows: current.rows };
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

  $('apply').addEventListener('click', () => {
    if (!current) return;
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(payload()));
    } catch (e) {
      alert('This browser would not save the preview (storage blocked or full).');
      return;
    }
    showPreviewStatus();
    window.open('index.html', '_blank');
  });

  function timetableJs() {
    return '/* Published timetable for Schedule Sandbox.\n' +
      ' * To publish a new timetable, replace this file with the one downloaded\n' +
      ' * from the admin page (admin.html). Do not edit by hand. */\n' +
      'window.SCHEDULE_DATA = ' + JSON.stringify(payload(), null, 1) + ';\n';
  }

  $('download-data').addEventListener('click', () => {
    if (!current) return;
    download('timetable-data.js', timetableJs(), 'text/javascript;charset=utf-8');
  });

  function buildTemplate() {
    const XLSX = window.XLSX;
    const weeks = '2026-10-26,2026-11-02,2026-11-09,2026-11-16,2026-11-23';
    const rows = [
      S.COLUMNS,
      ['Example Statistics', 'EX_STAT', 'X00.0001', 'T', 'T1', 'MSc_Example_S1', 'T2', 'Auditorium 101', 'Monday', '09:30', '11:00', weeks, 'For PL-G1 and PL-G2.'],
      ['Example Statistics', 'EX_STAT', 'X00.0001', 'T', 'T1', 'MSc_Example_S1', 'T2', 'Auditorium 101', 'Thursday', '09:30', '11:00', weeks, 'For PL-G1 and PL-G2.'],
      ['Example Statistics', 'EX_STAT', 'X00.0001', 'PL', 'PL-G1', 'MSc_Example_S1', 'T2', 'Classroom 201', 'Tuesday', '14:00', '15:30', weeks, ''],
      ['Example Statistics', 'EX_STAT', 'X00.0001', 'PL', 'PL-G2', 'MSc_Example_S1', 'T2', 'Classroom 202', 'Wednesday', '14:00', '15:30', weeks, ''],
      ['Example Elective', 'EX_ELEC', 'X00.0002', 'TP', 'TP1', 'ELEC_MSC_MAN', 'T2', 'Online', 'Friday', '17:00', '18:30', weeks, 'Online course – the link is on Moodle.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = S.COLUMNS.map(c => ({ wch: c === 'Week' ? 60 : c === 'Annotations' ? 36 : c === 'ModuleName' ? 24 : 14 }));
    const help = XLSX.utils.aoa_to_sheet([
      ['How to fill in the timetable'],
      [''],
      ['One row = one weekly class. Keep the column names in row 1 exactly as they are.'],
      ['ModuleCode groups rows into a course. SectionName (T1, PL-G1, TP1…) groups rows into a section.'],
      ['Typology: T, PL, TP, O or S.'],
      ['WeekdayName: Monday to Friday. StartTime/EndTime: HH:MM between 08:00 and 20:00.'],
      ['Week: the Mondays of the weeks the class happens, as YYYY-MM-DD, separated by commas.'],
      ['Unit: the period, e.g. S1 (semester) or T2 (term).'],
      ['StudentGroup: program groups, separated by commas (e.g. MP_Fin_S1_PA). Used for the program filter.'],
      ['Annotations on T rows pair them with PLs: "For PL-G1 and PL-G2." Other notes are shown to students.'],
    ]);
    help['!cols'] = [{ wch: 110 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    XLSX.utils.book_append_sheet(wb, help, 'How to fill');
    return wb;
  }

  $('template').addEventListener('click', () => {
    window.XLSX.writeFile(buildTemplate(), 'schedule-sandbox-template.xlsx');
  });

  $('file').addEventListener('change', e => handleFile(e.target.files[0]));
  const dz = $('dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('hover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('hover');
    handleFile(e.dataTransfer.files[0]);
  });

  /* ---------- Exam calendar ---------- */

  const EXAM_PREVIEW_KEY = 'scheduleSandbox.examPreview.v1';
  const E = window.Exams;
  let currentExams = null; // { source, payload, link }

  // Exams are matched against the timetable uploaded above, or the preview,
  // or the published one – whichever is most recent in this browser.
  function referenceCourses() {
    if (current && current.dataset.courses.length) return { courses: current.dataset.courses, from: `the timetable uploaded above (${current.source})` };
    try {
      const preview = JSON.parse(localStorage.getItem(PREVIEW_KEY));
      if (preview && preview.rows) return { courses: S.buildDataset(preview.rows).courses, from: `the timetable being previewed (${preview.source})` };
    } catch (e) { /* ignore */ }
    const published = window.SCHEDULE_DATA || { rows: [] };
    return { courses: S.buildDataset(published.rows || []).courses, from: 'the published timetable' };
  }

  function showExamPreviewStatus() {
    let preview = null;
    try { preview = JSON.parse(localStorage.getItem(EXAM_PREVIEW_KEY)); } catch (e) { /* ignore */ }
    const el = $('exam-current-preview');
    if (preview && preview.exams) {
      el.innerHTML = `This browser is currently previewing the exam calendar “${esc(preview.source || 'file')}” in the student view. ` +
        `<button class="btn small" id="clear-exam-preview">Stop preview</button>`;
      el.hidden = false;
      $('clear-exam-preview').onclick = () => {
        try { localStorage.removeItem(EXAM_PREVIEW_KEY); } catch (e) { /* ignore */ }
        showExamPreviewStatus();
      };
    } else {
      el.hidden = true;
    }
  }

  async function handleExamFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = await E.readExamFile(window.XLSX, file);
    } catch (err) {
      parsed = { exams: [], periods: [], issues: [{ level: 'error', message: 'This file could not be read. Is it the exam planner (.xlsm or .xlsx)? (' + err.message + ')' }] };
    }
    const payload = { generatedAt: new Date().toISOString(), source: file.name, periods: parsed.periods, exams: parsed.exams };
    const ref = referenceCourses();
    const link = E.linkExams(payload, ref.courses);
    const issues = parsed.issues.slice();
    if (!payload.exams.length && !issues.some(i => i.level === 'error')) {
      issues.push({ level: 'error', message: 'No Master exams were found in this file.' });
    }
    if (link.unmatched.length) {
      issues.push({
        level: 'warning',
        message: `${link.unmatched.length} exam course name(s) have no course with that name in ${ref.from}. ` +
          'That is expected for courses not in this timetable (e.g. another term); otherwise check the spelling in the planner, ' +
          `because students won't see these exams: ${link.unmatched.join('; ')}.`,
      });
    }
    if (link.beforeStart.length) {
      issues.push({
        level: 'info',
        message: 'Not shown to students because the exam is before the course\'s first class (probably the same course taught in an earlier term): ' +
          link.beforeStart.map(b => `${b.course.name} – ${b.exam.season} ${E.weekdayShort(b.exam.date)} ${S.shortDate(b.exam.date)}`).join('; ') + '.',
      });
    }
    if (link.loose.length) {
      issues.push({ level: 'info', message: 'Matched despite different spelling: ' + link.loose.map(([a, b]) => `“${a}” → “${b}”`).join('; ') + '.' });
    }
    if (link.noExam.length) {
      issues.push({ level: 'info', message: `Courses in ${ref.from} with no exam in this file: ${link.noExam.join('; ')}.` });
    }
    currentExams = { source: file.name, payload, link, issues, ref };
    renderExams();
  }

  function renderExams() {
    const { payload, link, issues, source, ref } = currentExams;
    $('exam-result').hidden = false;
    $('exam-file-name').textContent = `File: ${source} · matched against ${ref.from}`;
    const courseCount = new Set(payload.exams.map(e => e.course)).size;
    const tiles = [
      [payload.periods.length, 'exam seasons'],
      [payload.exams.length, 'exams (course + date)'],
      [courseCount, 'courses with exams'],
      [`${link.byCode.size} / ${ref.courses.length}`, 'timetable courses with an exam'],
      [link.unmatched.length, 'exam names not matched'],
    ];
    $('exam-stats').innerHTML = tiles.map(([n, l]) => `<div class="stat"><div class="num">${esc(n)}</div><div class="lbl">${esc(l)}</div></div>`).join('');

    const errors = issues.filter(i => i.level === 'error');
    const others = issues.filter(i => i.level !== 'error');
    const icon = { error: '✕', warning: '⚠', info: 'ℹ' };
    const list = arr => `<ul class="issues">${arr.map(i => `<li class="${i.level}">${icon[i.level]} ${esc(i.message)}</li>`).join('')}</ul>`;
    $('exam-issues').innerHTML = !issues.length
      ? '<div class="issues-ok">✓ No problems found.</div>'
      : (errors.length ? `<p class="lead"><b>${errors.length} error(s)</b> – these must be fixed before applying.</p>${list(errors)}` : '') +
        (others.length ? `<div style="margin-top:8px">${list(others)}</div>` : '');

    $('exam-table').innerHTML = '<tr><th>Season</th><th>Date</th><th>Course</th></tr>' +
      payload.exams.map(e => `<tr><td>${esc(e.season)}</td><td>${E.weekdayShort(e.date)} ${S.shortDate(e.date)}</td><td>${esc(e.course)}</td></tr>`).join('');

    const blocked = errors.length > 0;
    $('exam-apply').disabled = blocked;
    $('exam-download').disabled = blocked;
    $('exam-publish').disabled = blocked;
    $('exam-blocked').hidden = !blocked;
    setStatus('exam-publish-status', '', '');
  }

  $('exam-apply').addEventListener('click', () => {
    if (!currentExams) return;
    try {
      localStorage.setItem(EXAM_PREVIEW_KEY, JSON.stringify(currentExams.payload));
    } catch (e) {
      alert('This browser would not save the preview (storage blocked or full).');
      return;
    }
    showExamPreviewStatus();
    window.open('index.html#exams', '_blank');
  });

  function examJs() {
    return '/* Published exam calendar for Schedule Sandbox.\n' +
      ' * To publish a new exam calendar, replace this file with the one downloaded\n' +
      ' * from the admin page (admin.html). Do not edit by hand. */\n' +
      'window.EXAM_DATA = ' + JSON.stringify(currentExams.payload, null, 1) + ';\n';
  }

  $('exam-download').addEventListener('click', () => {
    if (!currentExams) return;
    download('exam-data.js', examJs(), 'text/javascript;charset=utf-8');
  });

  $('exam-file').addEventListener('change', e => handleExamFile(e.target.files[0]));
  const edz = $('exam-dropzone');
  edz.addEventListener('dragover', e => { e.preventDefault(); edz.classList.add('hover'); });
  edz.addEventListener('dragleave', () => edz.classList.remove('hover'));
  edz.addEventListener('drop', e => {
    e.preventDefault();
    edz.classList.remove('hover');
    handleExamFile(e.dataTransfer.files[0]);
  });

  /* ---------- Publish to students (GitHub) ---------- */
  /*
   * The live site is the GitHub repository's files, served by GitHub Pages.
   * "Publish" saves the new data file into the repository through GitHub's
   * API, using a token the admin saves in this browser (it is only ever sent
   * to api.github.com). GitHub Pages then rebuilds the site in 1–2 minutes.
   */
  const PUBLISH_KEY = 'scheduleSandbox.publish.v1';
  const DEFAULT_REPO = 'RitaQuintela/Student-Schedule-Sandbox';
  const DEFAULT_BRANCH = 'main';

  function publishSettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(PUBLISH_KEY)); } catch (e) { /* ignore */ }
    s = s || {};
    return { token: s.token || '', repo: s.repo || DEFAULT_REPO, branch: s.branch || DEFAULT_BRANCH };
  }

  function setStatus(id, cls, html) {
    const el = $(id);
    el.className = 'publish-status' + (cls ? ' ' + cls : '');
    el.innerHTML = html;
  }

  function showPublishSettings() {
    const s = publishSettings();
    $('pub-token').value = '';
    $('pub-token').placeholder = s.token ? 'Token saved in this browser (paste a new one to replace it)' : 'github_pat_…';
    $('pub-repo').value = s.repo;
    $('pub-branch').value = s.branch;
  }

  // UTF-8 safe base64 (course names have accents).
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function github(path, options) {
    const s = publishSettings();
    const res = await fetch('https://api.github.com' + path, Object.assign({}, options, {
      headers: Object.assign({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + s.token,
        'X-GitHub-Api-Version': '2022-11-28',
      }, (options && options.headers) || {}),
    }));
    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    return { ok: res.ok, status: res.status, body };
  }

  function explain(status, body) {
    const msg = body && body.message ? ` (GitHub says: ${body.message})` : '';
    if (status === 401) return 'GitHub did not accept the token: it may be mistyped, deleted or expired. Create a new one (see “How to create the token”) and save it again.';
    if (status === 403) return 'The token is not allowed to change this repository. Check that it has access to Student-Schedule-Sandbox with “Contents: Read and write”.' + msg;
    if (status === 404) return 'Repository or branch not found, or the token cannot see it. Check the repository and branch names under Publishing settings.' + msg;
    if (status === 409 || status === 422) return 'GitHub refused the change, probably because the file changed at the same moment. Please try again.' + msg;
    if (status === 0) return 'Could not reach GitHub. Check your internet connection and try again.';
    return `GitHub returned an error (${status}).` + msg;
  }

  async function publishFile(path, content, message) {
    const s = publishSettings();
    const where = `/repos/${s.repo}/contents/${path}`;
    let existing;
    try {
      existing = await github(`${where}?ref=${encodeURIComponent(s.branch)}`);
    } catch (e) {
      throw new Error(explain(0));
    }
    if (!existing.ok && existing.status !== 404) throw new Error(explain(existing.status, existing.body));
    const body = { message, content: toBase64(content), branch: s.branch };
    if (existing.ok && existing.body && existing.body.sha) body.sha = existing.body.sha; // replace the current file
    let put;
    try {
      put = await github(where, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error(explain(0));
    }
    if (!put.ok) throw new Error(explain(put.status, put.body));
    return put.body.commit;
  }

  async function doPublish(kind) {
    const isExam = kind === 'exam';
    const item = isExam ? currentExams : current;
    if (!item) return;
    const statusId = isExam ? 'exam-publish-status' : 'publish-status';
    const button = $(isExam ? 'exam-publish' : 'publish-data');
    if (!publishSettings().token) {
      setStatus(statusId, 'bad', 'Publishing is not set up in this browser yet. Add your GitHub token under <a href="#publishing">Publishing settings</a> (once), then try again.');
      return;
    }
    const what = isExam ? 'exam calendar' : 'timetable';
    if (!confirm(`Publish this ${what} (“${item.source}”) to students?\n\nIt replaces the current ${what} on the live site, which shows the change within 1–2 minutes.`)) return;
    button.disabled = true;
    setStatus(statusId, 'busy', 'Publishing…');
    try {
      const commit = await publishFile(
        isExam ? 'data/exam-data.js' : 'data/timetable-data.js',
        isExam ? examJs() : timetableJs(),
        `Publish ${what} from ${item.source} (admin page)`,
      );
      const link = commit && commit.html_url ? ` <a href="${esc(commit.html_url)}" target="_blank" rel="noopener">See the change on GitHub</a>.` : '';
      setStatus(statusId, 'ok', `✓ Published. The live site will show the new ${what} within 1–2 minutes (students may need to refresh the page).${link}`);
    } catch (e) {
      setStatus(statusId, 'bad', '✕ Not published. ' + esc(e.message));
    } finally {
      button.disabled = false;
    }
  }

  $('publish-data').addEventListener('click', () => doPublish('timetable'));
  $('exam-publish').addEventListener('click', () => doPublish('exam'));

  $('pub-save').addEventListener('click', () => {
    const old = publishSettings();
    const token = $('pub-token').value.trim() || old.token;
    const repo = $('pub-repo').value.trim() || DEFAULT_REPO;
    const branch = $('pub-branch').value.trim() || DEFAULT_BRANCH;
    if (!token) { setStatus('pub-status', 'bad', 'Paste a token first.'); return; }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { setStatus('pub-status', 'bad', 'The repository should look like “owner/name”, e.g. RitaQuintela/Student-Schedule-Sandbox.'); return; }
    try {
      localStorage.setItem(PUBLISH_KEY, JSON.stringify({ token, repo, branch }));
    } catch (e) {
      setStatus('pub-status', 'bad', 'This browser would not save the settings (storage blocked).');
      return;
    }
    showPublishSettings();
    setStatus('pub-status', 'ok', '✓ Saved in this browser. Click “Test connection” to check it works.');
  });

  $('pub-test').addEventListener('click', async () => {
    const s = publishSettings();
    if (!s.token) { setStatus('pub-status', 'bad', 'No token saved yet.'); return; }
    setStatus('pub-status', 'busy', 'Checking…');
    try {
      let repo;
      try { repo = await github(`/repos/${s.repo}`); } catch (e) { throw new Error(explain(0)); }
      if (!repo.ok) throw new Error(explain(repo.status, repo.body));
      if (repo.body.permissions && !repo.body.permissions.push) throw new Error(explain(403));
      const branch = await github(`/repos/${s.repo}/branches/${encodeURIComponent(s.branch)}`);
      if (!branch.ok) throw new Error(explain(branch.status, branch.body));
      setStatus('pub-status', 'ok', `✓ Connected. This browser can publish to ${esc(s.repo)}, branch ${esc(s.branch)}.`);
    } catch (e) {
      setStatus('pub-status', 'bad', '✕ ' + esc(e.message));
    }
  });

  $('pub-forget').addEventListener('click', () => {
    if (!confirm('Remove the GitHub token from this browser? You will need to paste it again to publish.')) return;
    try { localStorage.removeItem(PUBLISH_KEY); } catch (e) { /* ignore */ }
    showPublishSettings();
    setStatus('pub-status', 'ok', 'Token removed from this browser.');
  });

  showPublishSettings();
  showPreviewStatus();
  showExamPreviewStatus();
  // Exposed for testing in the browser console.
  window.ScheduleAdmin = {
    handleFile, buildTemplate, handleExamFile, publishFile, toBase64,
    get current() { return current; }, get currentExams() { return currentExams; },
  };
})();
