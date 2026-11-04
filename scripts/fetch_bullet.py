"""
Schedule Sandbox – fetch the timetable from Bullet's API (run by GitHub, see
.github/workflows/fetch-bullet.yml).

Downloads one semester of classes, keeps only the 13 columns the Sandbox uses
(the same ones as the "Bullet extraction" export; teacher and student data are
dropped), splits the rows into Master ("Aula Mestrado") and Undergraduate
("Aula Licenciatura") and saves them as drafts for the admin pages:
master/data/bullet-draft.js and undergraduate/data/bullet-draft.js.
Nothing reaches students until the admin loads a draft and clicks Publish.

Python standard library only. Settings come from environment variables:
  BULLET_CLIENT_ID, BULLET_CLIENT_SECRET  (GitHub repository secrets)
  SEMESTER        1 (Units S1, T1, T2) or 2 (Units S2, T3, T4)
  ACADEMIC_YEAR   first year of the academic year, e.g. 2026 for 2026/27 (empty = current)
  MODE            "check" (report only, saves nothing) or "save"
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

TOKEN_URL = os.environ.get('BULLET_TOKEN_URL') or 'https://clsbe-is.bulletscheduling.com/connect/token'
API_URL = os.environ.get('BULLET_API_URL') or 'https://clsbe-api.bulletscheduling.com'   # overridable for local tests
SCOPE = 'bestlegacy_api_scope'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UNITS = {'1': ('S1', 'T1', 'T2'), '2': ('S2', 'T3', 'T4')}
SITES = {'Aula Mestrado': 'master', 'Aula Licenciatura': 'undergraduate'}
WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

# Sandbox column <- Bullet API field(s), first non-empty one wins.
FIELDS = {
    'ModuleName': ['moduleName'],
    'ModuleAcronym': ['moduleAcronym'],
    'ModuleCode': ['moduleCode'],
    'Typology': ['typologyName'],
    'SectionName': ['wlsSectionName'],
    'StudentGroup': ['studentGroupName', 'studentGroupCode'],
    'Unit': ['unit'],
    'Classroom': ['classroomName', 'classroomCode'],
    'Annotations': ['annotations'],
}
COLUMNS = ['ModuleName', 'ModuleAcronym', 'ModuleCode', 'Typology', 'SectionName',
           'StudentGroup', 'Unit', 'Classroom', 'WeekdayName', 'StartTime', 'EndTime',
           'Week', 'Annotations']


class Stop(Exception):
    """An error explained in plain words for the run's summary."""


def explain(status, where):
    if where == 'the sign-in' and status in (400, 401):
        return ('Bullet refused the sign-in: check BULLET_CLIENT_ID and BULLET_CLIENT_SECRET '
                '(no spaces), or ask Bullet whether the secret has expired.')
    return {
        400: f'Bullet did not accept the request for {where} (400). The date format may need changing.',
        401: 'Bullet refused the sign-in (401): check BULLET_CLIENT_ID and BULLET_CLIENT_SECRET, or the secret has expired.',
        403: f'Integration_4 is not allowed to read {where} (403): ask Bullet to grant read access to Events.',
        404: f'Bullet does not know {where} (404): the API address may have changed.',
    }.get(status, f'Bullet answered with error {status} for {where}. Try again later; if it persists, ask Bullet.')


def request(url, data=None, headers=None, where='the timetable'):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return json.loads(res.read().decode('utf-8-sig'))
    except urllib.error.HTTPError as err:
        raise Stop(explain(err.code, where)) from None
    except urllib.error.URLError as err:
        raise Stop(f'Could not reach Bullet ({err.reason}). If Bullet only accepts approved '
                   'computers, GitHub\'s servers may be blocked: ask Bullet.') from None


def get_token(client_id, secret):
    body = urllib.parse.urlencode({'grant_type': 'client_credentials', 'client_id': client_id,
                                   'client_secret': secret, 'scope': SCOPE}).encode()
    res = request(TOKEN_URL, body, {'Content-Type': 'application/x-www-form-urlencoded'}, 'the sign-in')
    if not res.get('access_token'):
        raise Stop('Bullet\'s sign-in gave no access key.')
    return res['access_token']


def months(start, end):
    """(first day, last day) of every month from start to end."""
    d = start
    while d <= end:
        nxt = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        yield d, min(nxt - dt.timedelta(days=1), end)
        d = nxt


def semester_dates(semester, year):
    # Wide windows on purpose: rows are kept by their Unit, not by date.
    if semester == '1':
        return dt.date(year, 8, 1), dt.date(year + 1, 2, 28)
    return dt.date(year + 1, 1, 1), dt.date(year + 1, 7, 31)


def fetch_rows(token, start, end):
    rows = []
    for a, b in months(start, end):
        url = f'{API_URL}/api/Events/createeventallcsv/{a.isoformat()}/{b.isoformat()}'
        res = request(url, headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'},
                      where=f'the classes of {a:%B %Y}')
        data = res.get('data') if isinstance(res, dict) else res
        rows.extend(data or [])
    return rows


def pick(raw, keys):
    low = {k.lower(): v for k, v in raw.items()}
    for k in keys:
        v = low.get(k.lower())
        if v not in (None, ''):
            return str(v).strip()
    return ''


def to_date(v):
    m = re.match(r'(\d{4})-(\d{1,2})-(\d{1,2})', v or '')
    if m:
        return dt.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r'(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})', v or '')
    if m:
        return dt.date(int(m[3]), int(m[2]), int(m[1]))
    return None


def to_time(v):
    m = re.search(r'(\d{1,2}):(\d{2})', v or '')
    return f'{int(m[1]):02d}:{m[2]}' if m else (v or '')


def site_of(raw):
    """'master', 'undergraduate' or None, from the event type (EventType / EventTitle)."""
    for text in (pick(raw, ['eventTypeName']), pick(raw, ['eventName'])):
        for prefix, site in SITES.items():
            if text.lower().startswith(prefix.lower()):
                return site
    return None


def convert(raw):
    row = {col: pick(raw, keys) for col, keys in FIELDS.items()}
    day = to_date(pick(raw, ['eventDateOccurrence']))
    monday = day - dt.timedelta(days=day.weekday()) if day else to_date(pick(raw, ['eventWeekStartDate']))
    row['WeekdayName'] = WEEKDAYS[day.weekday()] if day else pick(raw, ['eventWeekdayText'])
    row['StartTime'] = to_time(pick(raw, ['eventStartTime']))
    row['EndTime'] = to_time(pick(raw, ['eventEndTime']))
    row['Week'] = monday.isoformat() if monday else ''
    return {c: row[c] for c in COLUMNS}


def merge_weeks(rows):
    """One row per class slot, listing all its weeks (like the export, and like mergeWeeks in js/parser.js)."""
    merged = {}
    for r in rows:
        key = tuple(r[c] for c in COLUMNS if c != 'Week')
        if key in merged:
            merged[key]['_weeks'].add(r['Week'])
        else:
            merged[key] = dict(r, _weeks={r['Week']} - {''})
    out = []
    for r in merged.values():
        r['Week'] = ','.join(sorted(r.pop('_weeks')))
        out.append(r)
    out.sort(key=lambda r: (r['ModuleName'], r['SectionName'], r['Unit'], r['WeekdayName'], r['StartTime']))
    return out


def counted(values, n=12):
    counts = {}
    for v in values:
        counts[v or '(empty)'] = counts.get(v or '(empty)', 0) + 1
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:n]
    return ', '.join(f'{k} ({v})' for k, v in top) + (' …' if len(counts) > n else '')


def main():
    client_id = os.environ.get('BULLET_CLIENT_ID', '').strip()
    secret = os.environ.get('BULLET_CLIENT_SECRET', '').strip()
    semester = os.environ.get('SEMESTER', '1').strip()
    mode = os.environ.get('MODE', 'check').strip()
    today = dt.date.today()
    year_text = os.environ.get('ACADEMIC_YEAR', '').strip()[:4]
    year = int(year_text) if year_text.isdigit() else (today.year if today.month >= 5 else today.year - 1)
    label = f'Semester {semester} {year}/{str(year + 1)[2:]}'
    report = [f'## Bullet fetch: {label}', '']

    try:
        if semester not in UNITS:
            raise Stop('Semester must be 1 or 2.')
        if not client_id or not secret:
            raise Stop('The secrets BULLET_CLIENT_ID and BULLET_CLIENT_SECRET are not set in the repository.')
        token = get_token(client_id, secret)
        start, end = semester_dates(semester, year)
        raw_rows = fetch_rows(token, start, end)
        report.append(f'- Rows received from Bullet ({start:%d %b %Y} – {end:%d %b %Y}): **{len(raw_rows)}**')
        if not raw_rows:
            raise Stop('Bullet returned no classes for these dates.')

        units = UNITS[semester]
        by_site = {'master': [], 'undergraduate': []}
        other_types, other_units = [], []
        for raw in raw_rows:
            site = site_of(raw)
            if not site:
                other_types.append(pick(raw, ['eventTypeName']))
                continue
            row = convert(raw)
            if row['Unit'].upper() not in units:
                other_units.append(row['Unit'])
                continue
            by_site[site].append(row)

        report.append(f'- Skipped, not "Aula Mestrado" / "Aula Licenciatura": {len(other_types)}'
                      + (f' – {counted(other_types)}' if other_types else ''))
        report.append(f'- Skipped, Unit not {"/".join(units)}: {len(other_units)}'
                      + (f' – {counted(other_units)}' if other_units else ''))
        fetched = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        for site, rows in by_site.items():
            merged = merge_weeks(rows)
            report += ['', f'### {"Master" if site == "master" else "Undergraduate"}',
                       f'- Class rows: {len(rows)} → {len(merged)} after merging weeks',
                       f'- Courses: {len({r["ModuleCode"] for r in merged})}',
                       f'- Units: {counted(r["Unit"] for r in merged)}',
                       f'- Typology: {counted(r["Typology"] for r in merged)}',
                       f'- Weekdays: {counted(r["WeekdayName"] for r in merged)}',
                       f'- Student groups: {counted(r["StudentGroup"] for r in merged)}',
                       f'- Classrooms (sample): {counted((r["Classroom"] for r in merged), 6)}',
                       f'- Times (sample): {counted((r["StartTime"] + "–" + r["EndTime"] for r in merged), 6)}',
                       f'- Missing week: {sum(1 for r in merged if not r["Week"])}']
            if mode == 'save' and merged:
                draft = {'fetchedAt': fetched, 'semester': int(semester), 'academicYear': f'{year}/{year + 1}',
                         'source': f'Bullet API · {label}', 'rows': merged}
                path = os.path.join(ROOT, site, 'data', 'bullet-draft.js')
                with open(path, 'w', encoding='utf-8', newline='\n') as f:
                    f.write('/* Timetable fetched from Bullet by the "Fetch from Bullet" task on GitHub.\n'
                            ' * A draft: students see it only after the admin loads it and clicks\n'
                            ' * "Publish to students". Replaced by every fetch; do not edit by hand. */\n'
                            'window.BULLET_DRAFT = ' + json.dumps(draft, ensure_ascii=False, indent=1) + ';\n')
                report.append(f'- Saved `{site}/data/bullet-draft.js`')
        report += ['', '**Check only: nothing was saved.**' if mode != 'save' else
                   '**Drafts saved.** In 1–2 minutes, open the admin page and use "Load latest from Bullet".']
        code = 0
    except Stop as err:
        report += ['', f'**✕ {err}**']
        code = 1

    text = '\n'.join(report) + '\n'
    sys.stdout.reconfigure(encoding='utf-8')
    print(text)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write(text)
    return code


if __name__ == '__main__':
    sys.exit(main())
