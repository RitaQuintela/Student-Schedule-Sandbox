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
    $('blocked').hidden = !blocked;
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

  $('download-data').addEventListener('click', () => {
    if (!current) return;
    const js = '/* Published timetable for Schedule Sandbox.\n' +
      ' * To publish a new timetable, replace this file with the one downloaded\n' +
      ' * from the admin page (admin.html). Do not edit by hand. */\n' +
      'window.SCHEDULE_DATA = ' + JSON.stringify(payload(), null, 1) + ';\n';
    download('timetable-data.js', js, 'text/javascript;charset=utf-8');
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

  showPreviewStatus();
  // Exposed for testing in the browser console.
  window.ScheduleAdmin = { handleFile, buildTemplate, get current() { return current; } };
})();
