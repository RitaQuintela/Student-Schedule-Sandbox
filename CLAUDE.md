# Schedule Sandbox – notes for Claude

Web app for Católica Lisbon master students to build a weekly timetable by
combining courses and choosing sections. The owner is not a developer: explain
changes in plain language.

**Wording:** always write "Master" (never "Master's") and "Program(s)" (never "Programme(s)")
in anything users or readers see: UI text, messages, templates, docs. Internal code names
(`programmeOf`, the `programme` filter id and saved setting) are kept so saved choices still work.

## Tech constraints
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm.
- Must work by opening `index.html` directly (file://). That is why the data is
  a `.js` file (`window.SCHEDULE_DATA = …`) and not JSON loaded with `fetch`.
- SheetJS is vendored in `vendor/xlsx.full.min.js` (0.20.3, Apache-2.0). Only
  `admin.html` loads it; the student page doesn't need it.
- Look follows the **Católica-Lisbon SBE Brand Guidelines 2026 (v2.3)**, with the layout
  structure of the Master Programs study plans (header bars, flat blocks, colour legend):
  - Institutional Blue `#0061FF` = main colour (header, bars, buttons, links, day headers).
  - Master purple `#B78BFC` (`#946FF1` on white, digital) = accent (header line, tags, notes, focus).
  - Complementary black `#131313`, grey `#F3F3F3`, white. Course colours = brand program
    colours as stripe + light tint (see `COLORS` in `js/student.js`). Red `#C0262D` only for overlaps.
  - Never use the logo's Bright Blue `#003CA5` outside the logo. No navy/gold (old identity).
  - Typeface Barlow, vendored in `vendor/fonts` (SIL OFL).
  - Logo: `assets/logo-clsbe-white.svg` on blue (colour version `assets/logo-clsbe.svg` for white
    backgrounds), the version **without seal** (internal tools). Min. width on screen 150 px.
    Don't recolour, distort, outline or crowd it.
- Must stay mobile friendly (timetable shows one day at a time with day tabs below 860px).

## Files
- `index.html` + `js/student.js` – student screen.
- `admin.html` + `js/admin.js` – upload, summary/warnings, preview, data file download, Excel template.
- `js/parser.js` – **all timetable data rules**, shared by both screens. Change rules here only.
- `js/exams.js` – **all exam rules** (reading the planner, name matching, clashes), shared by both screens.
- `data/timetable-data.js` – the published timetable (cleaned rows). Replaced by the admin, never edited by hand.
- `data/exam-data.js` – the published exam calendar (`window.EXAM_DATA`: periods + exams). Same rule.
- `css/styles.css` – all styling, including print.
- `assets/` – official logos (SVG, from the brand pack).
- `.claude/launch.json` – local preview server (`python -m http.server 8123`) for testing.

## Data rules (input: "Bullet extraction" export, .xlsx or .csv)
Columns used: ModuleName, ModuleAcronym, ModuleCode, Typology (T, PL, TP, O, S),
SectionName, StudentGroup, Unit (e.g. S1, T2), Classroom, WeekdayName, StartTime,
EndTime, Week, Annotations. Other columns are ignored. Headers match case-insensitively.

- One row = one weekly session. Courses are grouped by **ModuleCode**, sections by
  **SectionName** within a course. A section can have several sessions per week.
- **Pairing (decided by the admin, never by the student)** happens only in courses that have PL sections:
  - The lecture typology is `T`; if the course has PLs but no T, `TP` plays that role (e.g. Macroeconomics: PL1 + TP1).
  - A lecture row whose Annotations mention PL section names (e.g. "For PL-G1, PL-G2 and PL-E1.") is paired with those PLs.
    Name matching is exact-token: "PL1" does not match "PL1-A" or "PL10".
  - A PL not mentioned in any note is paired with the lecture section(s) that have no pairing note (usually the single T).
  - If several lecture sections have no note, PLs are matched by section number (PL1-A → T1) and the admin gets a warning. (The 2026/27 sample has no notes, so Business Research Methods and Marketing Research rely on this.)
  - If no match is possible, the PL is offered on its own and the admin gets a "not paired" warning.
  - The student picks one PL; its paired lecture(s) come with it. Option id = PL section name.
  - Lecture sections paired with no PL, and other typologies in a PL course, are not offered (warning).
- Courses with no PL sections (TP, O, S…) offer one option per section.
- Annotations that are not pairing notes (e.g. "Online course…") are shown to students.
- **Week** is a comma-separated list of Mondays (YYYY-MM-DD; dd/mm/yyyy and Excel dates also accepted).
  Real class date = that Monday + weekday. Skipped weeks (holidays) are simply absent;
  T2 units start mid-semester. A non-Monday date is moved to its Monday with a warning.
- **Overlap**: two sessions overlap only if same weekday AND times overlap (back-to-back is fine)
  AND they share at least one week.
- Admin warnings: unpaired PL, auto-paired by number, unpaired lecture, times outside 08:00–20:00
  (kept, clipped in the grid), non-weekday rows (skipped), invalid times, missing values, duplicates,
  same code with different names. Errors (missing columns, no usable rows) block applying.
- Program filter: StudentGroup with the class/group suffix removed
  (`MP_Man_SEI_S1_PA` → `MP_Man_SEI`, `MSc_Econ_1` → `MSc_Econ`, `ELEC_*` → "Electives (…)").
  Period filter = Unit (`S1` → Semester 1, `T2` → Term 2).

## Exam rules (input: Integrated Exams Planner, .xlsm/.xlsx)
- Read the **ExamData** sheet (header row found by its labels, not by position): Period ID, Cycle,
  Season, Date, Course. Keep **Cycle = MSc** only. One exam per Period + Date + Course (the planner
  repeats it per program/track). Season date ranges come from the **Periods** sheet (MSc, Active ≠ No;
  up to 3 ranges); a season without a Periods row uses its first–last exam date. Macros never run.
  If there is no ExamData sheet, any sheet with Date and Course columns is used.
- No course codes in the planner, so exams link to timetable courses **by name**, ignoring case,
  accents, `&`/`and`, punctuation/hyphens, text in brackets (`(IMSc)`) and a final "s" on words.
  "Language Courses" maps to every course whose name contains "language" or "extensive course".
- An exam dated **before the course's first class week** is ignored (same course name taught in an
  earlier term, e.g. a T1 midterm for the T2 edition) and listed as an admin note.
- Times are TBD: two of a student's exams on the **same day = clash (red)**; exams on **consecutive
  days = amber note**.
- Admin: unmatched exam names = one combined warning; loose matches, ignored early exams and
  courses without exams = info notes. Errors (no ExamData/no MSc exams) block applying.
  Preview key `scheduleSandbox.examPreview.v1`. Raw planners (`*.xlsm`) are git-ignored.
- Student: "Exam Calendar" section under the timetable (Exams tab on phones): one day strip per
  season (list by date on phones), exam dates on each course card, exams in the .ics as all-day events.

## Student features
Search + program/period filters; "+ Add" or drag a card onto the timetable; drag a class
block from the timetable back onto the course list, or click the small × on a block, to remove
that course (the list turns red, "Drop here to remove …"); button shows
"Added ✓" and "Remove ✕" on hover; added courses pinned at the top; section dropdown on the card
with "✓ fits" / "⚠ overlaps"; Mon–Fri 08:00–20:00 grid in 1h30 blocks; overlaps in red (blocks,
cards, banner); typical week or a specific week; .ics export (one event per real date,
TZID Europe/Lisbon); Print/PDF; selection saved in localStorage
(`scheduleSandbox.student.v1`; admin previews use separate keys). Header shows a **Beta** tab (purple, on the line under the
header) and a centered beta disclaimer ("use it, but always check the information"). Subtitle:
"Plan your classes and exams, create your schedule, and avoid overlaps before your enrollment day."

## Privacy
Raw exports contain staff usernames/emails (CreatedUser, LastModifiedUser). They are
git-ignored (`Bullet extraction*`). Only the cleaned `data/timetable-data.js` is committed.

## Testing
Start the preview server from `.claude/launch.json`, then test `index.html` and `admin.html`
at desktop and 375px widths. `window.ScheduleSandbox` and `window.ScheduleAdmin` expose helpers
for console checks. Browsers cache scripts: reload with `fetch(url, {cache:'reload'})` first.
