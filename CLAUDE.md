# Schedule Sandbox – notes for Claude

Web app for Católica Lisbon Master and undergraduate students (one site each, see below) to build a weekly timetable by
combining courses and choosing sections. The owner is not a developer: explain
changes in plain language.

**Wording:** always write "Master" (never "Master's") and "Program(s)" (never "Programme(s)")
in anything users or readers see: UI text, messages, templates, docs. Internal code names
(`programmeOf`, the `programme` filter id and saved setting) are kept so saved choices still work.
Say "overlap" (never "clash") in anything users see; internal names (`clash`, `findClashes`) stay.

## Tech constraints
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm.
- Must work by opening `index.html` directly (file://). That is why the data is
  a `.js` file (`window.SCHEDULE_DATA = …`) and not JSON loaded with `fetch`.
- SheetJS is vendored in `vendor/xlsx.full.min.js` (0.20.3, Apache-2.0). Only
  `admin.html` loads it; the student page doesn't need it.
- Look follows the **Católica-Lisbon SBE Brand Guidelines 2026 (v2.3)**, with the layout
  structure of the Master Programs study plans (header bars, flat blocks; no colour legend under the timetable):
  - Institutional Blue `#0061FF` = main colour (header, bars, buttons, links, day headers).
  - Master purple `#B78BFC` (`#946FF1` on white, digital) = accent (header line, tags, notes, focus).
  - Complementary black `#131313`, grey `#F3F3F3`, white. Course colours = brand program
    colours as stripe + light tint (see `COLORS` in `js/student.js`). Overlaps use brand raspberry `#CC4A59` (text in the darker `#A93445` for readability), brand orange `#ED9438` is kept for warning banners (no orange highlighting of consecutive exam days); removing a course (Remove ✕, the × on blocks, drag-to-remove) uses black `#131313`.
  - Never use the logo's Bright Blue `#003CA5` outside the logo. No navy/gold (old identity).
  - Typeface Barlow, vendored in `vendor/fonts` (SIL OFL). Handwriting: Caveat (`vendor/fonts/caveat.woff2`,
    variable weight, latin subset, SIL OFL), used only for the draft stamp.
  - **Draft look** (owner's choice, "sketch C"): dashed timetable grid (dashed hour lines and day
    lines, straight, not wobbly) and a tilted hand-drawn **DRAFT stamp** in Master purple like the Beta tab (`--purple` #B78BFC; the draft name in `--purple-ink` #946FF1 for legibility) in the timetable toolbar, to
    the right of the buttons; it also prints, top right (CSS at the end of `styles.css`). No marker
    underlines (removed by the owner).
  - Logo: the version **with the seal** (owner's choice): `assets/logo-clsbe-seal-white.svg` on blue
    (brand pack `SVG/Logo CLSBE_Horiz_white_selo.svg`; colour version `assets/logo-clsbe-seal.svg` =
    `Logo CLSBE_Horiz_selo.svg` for white backgrounds). 240 px wide, 190 px on phones (the wordmark's
    150 px minimum); below 520px the logo sits on its own row above the title. The seal-less files
    (`logo-clsbe*.svg`) are kept but unused. Don't recolour, distort, outline or crowd it.
  - Browser-tab icon (owner's choice, "A"): the seal alone, white on a rounded Institutional Blue square,
    `assets/favicon.svg` (the seal's paths from `logo-clsbe-seal-white.svg`); `assets/apple-touch-icon.png`
    (180 px, square corners) for phone home screens. Linked in the `<head>` of all six HTML pages.
- Must stay mobile friendly (timetable shows one day at a time with day tabs below 860px).
- **Light / dark theme** (`js/theme.js`, loaded in `<head>` of both pages): a "Dark"/"Light" tab on the
  purple header line, left of "Beta version" (icon only below 520px). Default = the device setting; the
  student's choice is saved in localStorage `scheduleSandbox.theme`. Dark colours are token overrides
  under `:root[data-theme="dark"]` inside `@media screen` at the end of `styles.css`, so **print is always
  light**. Brand blue and Master purple stay; course tints become `color-mix` of the course colour with
  the dark surface. Use tokens, not hard-coded colours: `--text` for text (`--ink` stays black for text on
  purple), `--blue-ink` for blue text/links, `--remove`/`--on-remove` for removing a course, `--page` for the page.

## Two sites: Master and Undergraduate
Each site lives in its own folder with its own pages and data; code, styles, fonts and logos are
shared from the root, so a fix reaches both. `master/` = Master Programs, `undergraduate/` =
Undergraduate Programs. The root `index.html` and `admin.html` only redirect to `master/` (old links keep working).
- Each page sets `<html data-site="master|undergraduate">`; `js/site.js` (loaded first in `<head>`) turns
  that into `window.Site`: localStorage key prefix (Master keeps the original `scheduleSandbox.*` keys;
  undergraduate uses `scheduleSandbox.ug.*`, so drafts and previews never mix; the theme and GitHub
  token are shared), exam cycle (MSc / UG), how exam seasons are named, and the empty-timetable hint.
  Publish writes to `<site id>/data/…`. Site differences go in `SITES` there, not in `if` checks scattered around.
- **Undergraduate differences** (owner's choices): accent = brand **Verde Licenciaturas `#6CC9CC`**
  (brand book p. 30; the national colour is used when national and international programs appear
  together) with `#1F7F82` on white — the `--purple*` tokens are overridden under
  `:root[data-site="undergraduate"]` at the end of `styles.css`. No Program filter (search + period only;
  the page simply has no `#programme` select). Exams = planner **Cycle UG**, all three seasons (Midterms,
  Endterms, Final Exams) shown **with the planner's names**, because Endterms and Final Exams fall in the
  same trimester. No pre-enrolment sentence. Wording: "Undergraduate Programs".
- Undergraduate groups look like `Y1_LIC_GEST_SECTION_2`, `Y2_IUP_BA_SECTION_REOFFER_1`, `Y1_PPE`;
  `programmeOf` drops the year and section → `LIC_GEST`, `IUP_BA`, `PPE` (names in `PROGRAM_NAMES`, shown on the admin page).

## Files
- `master/index.html`, `undergraduate/index.html` + `js/student.js` – student screen.
- `master/admin.html`, `undergraduate/admin.html` + `js/admin.js` – (not linked from the student pages, owner's choice; `noindex`) upload, summary/warnings, preview, **Publish to students**, data file download, Excel template.
- `js/site.js` – which site a page belongs to (see above).
- `scripts/fetch_bullet.py` + `.github/workflows/fetch-bullet.yml` – fetch from the Bullet API (see below).
- `<site>/data/bullet-draft.js` – last fetch from Bullet, a draft for the admin page (written by the GitHub task).
- `js/parser.js` – **all timetable data rules**, shared by both screens. Change rules here only.
- `js/theme.js` – light/dark switch, shared by both screens.
- `js/exams.js` – **all exam rules** (reading the planner, name matching, clashes), shared by both screens.
- `<site>/data/timetable-data.js` – the published timetable (cleaned rows). Replaced by the admin, never edited by hand.
- `<site>/data/exam-data.js` – the published exam calendar (`window.EXAM_DATA`: periods + exams). Same rule.
- `css/styles.css` – all styling, including print.
- `assets/` – official logos (SVG, from the brand pack).
- `.claude/launch.json` – local preview server (`python -m http.server 8123`) for testing.

## Data rules (input: "Bullet extraction" export, .xlsx or .csv)
Columns used: ModuleName, ModuleAcronym, ModuleCode, Typology (T, PL, TP, O, S),
SectionName, StudentGroup, Unit (e.g. S1, T2), Classroom, WeekdayName, StartTime,
EndTime, Week, Annotations. Other columns are ignored. Headers match case-insensitively.

- One row = one weekly session. Courses are grouped by **ModuleCode**, sections by
  **SectionName + trimester** within a course (trimester = Unit T1–T4; S1/S2 count as none).
  A section can have several sessions per week.
- **Course + term**: Bullet reuses section names across trimesters (Business Ethics TP1 in T1 and
  TP1 in T2 are different editions). A course taught in several trimesters offers one choice per
  section per trimester ("Trimester 1 · TP1", trimester shown first, option id `TP1@T1`); pairing happens within a
  trimester only. Single-edition courses keep plain ids (`TP1`, `PL1-A`).
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
- **Full schedules**: the file may have one row per class date (all weeks). Rows of the same section
  with the same weekday, times, room and Unit are merged into one session with all their weeks
  (warnings appear once per slot), and the published file merges rows that differ only in Week
  (`mergeWeeks`).
- **Overlap**: two sessions overlap only if same weekday AND times overlap (back-to-back is fine)
  AND they share a **reference week** (see Trimesters). Clashes in other weeks are not shown (owner's choice).
- Admin warnings: unpaired PL, auto-paired by number, unpaired lecture, times outside 08:00–21:30
  (kept, clipped in the grid), non-weekday rows (skipped), invalid times, missing values, duplicates,
  same code with different names. Errors (missing columns, no usable rows) block applying.
- Program filter: StudentGroup with the class/group suffix removed
  (`MP_Man_SEI_S1_PA` → `MP_Man_SEI`, `MSc_Econ_1` → `MSc_Econ`), shown with the full names in
  `PROGRAM_NAMES` (`js/parser.js`, names given by the owner, e.g. `MP_Fin` → "Masters in Finance").
  A code not in that list shows as the code and the admin gets a warning to send its name.
  Period filter = Unit (`S1` → "Semester 1 (S1)", `T1` → "Trimester 1 (T1)").

## Trimesters (one grid each)
- `computeTerms` in `js/parser.js`: semester 1 = Units S1/T1/T2 → Trimester 1 and 2; semester 2 =
  S2/T3/T4 → Trimester 3 and 4. A trimester's dates = weeks of the courses tagged with it; if one
  trimester has no courses, it is the semester's other weeks before/after (flagged "inferred" on the
  admin page). A semester with only S courses is one "Semester n" grid.
- **Reference week** (one per trimester): the planner grids, course cards, overlaps and "fits/overlaps"
  show only the classes of that week; the .ics has every week. The admin picks it in a dropdown under
  each trimester in the summary (weeks listed with their number of classes). Default = **first full
  week** = first week with ≥ 90% of the classes of the trimester's busiest week (`setReferenceWeeks`).
  Saved in the data file as `referenceWeeks: { T1: 'YYYY-MM-DD', … }`; a new upload keeps the
  published choice when that week still exists. Students see "Trimester 1 · reference week", no date.
  Course cards list a section's classes in the reference weeks, one line per slot.
- The timetable shows **one grid per trimester** (headed "Trimester 1", "Trimester 2"), side by side when
  there is room, one above the other otherwise (always side by side when printed). A class appears in
  every trimester grid it has weeks in (semester courses in both). No trimester dropdown.

## Exam rules (input: Integrated Exams Planner, .xlsm/.xlsx)
- Read the **ExamData** sheet (header row found by its labels, not by position): Period ID, Cycle,
  Season, Date, Course. Keep the site's cycle only (**MSc** on master, **UG** on undergraduate). One exam per Period + Date + Course (the planner
  repeats it per program/track). Season date ranges come from the **Periods** sheet (MSc, Active ≠ No;
  up to 3 ranges); a season without a Periods row uses its first–last exam date. Macros never run.
  If there is no ExamData sheet, any sheet with Date and Course columns is used.
- No course codes in the planner, so exams link to timetable courses **by name**, ignoring case,
  accents, `&`/`and`, punctuation/hyphens, text in brackets (`(IMSc)`) and a final "s" on words.
  "Language Courses" maps to every course whose name contains "language" or "extensive course".
- For a course with several trimester editions, each exam belongs to the edition that has started
  by the exam date and finished most recently (`examsForOption`): a 19 Oct midterm → T1 edition,
  a 19 Dec endterm → T2 edition. Students only see their chosen edition's exams.
- An exam dated **before the course's first class week** is ignored (same course name taught in an
  earlier term, e.g. a T1 midterm for the T2 edition) and listed as an admin note.
- Times are TBD: two of a student's exams on the **same day = overlap (red)**. Exams on consecutive days
  are **not** flagged on the student page (the owner removed the orange highlight).
- Admin: unmatched exam names = one combined warning; loose matches, ignored early exams and
  courses without exams = info notes. Errors (no ExamData/no MSc exams) block applying.
  Preview key `scheduleSandbox.examPreview.v1`. Raw planners (`*.xlsm`) are git-ignored.
- Student: "Exam Calendar" section under the timetable (Exams tab on phones): one **list by date**
  per season on both sites, screen and print (owner's choice; the old day strip was removed), only days
  with exams of the student's courses, same-day overlaps red with ⚠, exam dates on each course card, exams in the .ics as all-day events.
- Students never see the planner's season names: each season is named after the **trimester it falls
  in** (`seasonTerm` in `js/student.js`: the trimester whose weeks contain the season's first day, else
  the latest one started), so Midterms → "Trimester 1", Endterms → "Trimester 2" (cards and chips
  say "T1"/"T2"; .ics "Exam: Course (Trimester 1)"). The season lists sit in one column per trimester,
  under the matching timetable grid. The admin page keeps the planner's names.

## Student page layout (November 2026, from the UX design work in `docs/ux`)
Owner's choices, made on a proof of concept and then built into both sites. **Where this section and
"Student features" below disagree, this section wins.**
- Four blocks, each with a blue bar. Left column: **Draft** (the stamp, Print / PDF, Clear all, on one
  line) and **Course List** (Search and Period on the first line, Program on the second; "All courses · N").
  Right column: **Your courses · N** (tiles) and **Preview of Weekly Timetable and Exam Calendar**.
  With an empty draft, Draft and Your courses are the same height so the second row starts level.
- **Added courses are tiles** in Your courses, not cards pinned in the list: short name, full name,
  section, exam dates, "⚠ overlaps" (names in the tooltip), Bullet notes, × to remove. A course with
  several sections has a **dropdown drawn by the page** (not a `<select>`): one line per section
  ("TP2 Mon, Wed 11:00–12:30 · ✓ fits / ⚠ overlaps / chosen"); pointing at a section, or moving to
  it with the arrow keys, **tries it on the timetable** as a dashed block (`state.preview`, only the grids
  are redrawn); Escape or a click elsewhere closes it (`state.open`).
- Cards of courses not added yet are compact: name, "+ Add", one line ("Trimester 1 · 2 sections", or
  the hours of a single section). "+ Add" on a course with several sections opens the same list of
  sections on the card ("Choose your section", Cancel).
- **Stamp**: the draft's name only, in capitals (the bar says "Draft"), Nanum Pen Script
  (`vendor/fonts/nanum-pen-script.woff2`, SIL OFL), straight (no tilt), frame lines crossing at the corners,
  `--purple-ink`, with an arrow. A draft is called **"Draft name"** until renamed (then "Draft name 2"…).
  It prints top right (`.print-stamp`).
- **Clear all** has no question: it clears and shows "Draft cleared · Undo" for 7 seconds, bottom right.
- **No "Export to calendar (.ics)" button** (owner removed it); `buildIcs` stays in `js/student.js`,
  unused, in case it returns.
- Trimester headings say only "Trimester 1" (no "reference week"). **Exams sit under each trimester's
  grid**, labelled "Exams" (undergraduate: "Exams · Midterms", one list per season); seasons in no
  trimester go in an "Other exams" column. There is no separate Exam Calendar panel and no Exams tab on
  phones (two tabs: Course list / Timetable and exams; the Draft block stays on top of both).
- Overlaps are shown **on top of the course colour** (red outline, ⚠), never instead of it. Two exams on
  the same day: pale red row and a red ⚠; the course names are not red. A banner about exams appears only
  when two exams share a day.
- An exam in the list has the same × as a class block (it removes the course) and can be dragged back to
  the course list, like a block.
- Round corners everywhere (the "Nexus look" section of `styles.css`, now permanent).

## Student features
Search + program/period filters; "+ Add" or drag a card onto the timetable; drag a class
block from the timetable back onto the course list, or click the small × on a block, to remove
that course (the list turns red, "Drop here to remove …"); button shows
"Added ✓" and "Remove ✕" on hover; added courses pinned at the top; section dropdown on the card
with "✓ fits" / "⚠ overlaps"; a course with **several sections (or terms) must get its section before it
is added** (owner's choice): "+ Add" or dropping it on the timetable turns its card into a "Choose your
section" dropdown (`state.picking`, not saved; the card **stays in its place** in the course list, owner's choice, and
stays visible if the search/filters change; with Cancel) and the course moves to Your courses only when a section is picked; a one-section course is
added straight away. An added course with option `''` (older saves, or a section that disappeared from the
data) still shows "Choose a section…" and is left out of the timetable, overlaps, exams and .ics until
picked (banner lists "Pick a section for: …"); Mon–Fri 08:00–21:30 grid in 1h30 blocks (last row 20:00), 56px per block (three lines of a short name fit); overlaps in red (blocks,
cards, banner); one grid per trimester (no dropdown, no single weeks); class blocks show only the
short course name (section, time and room are in the hover tooltip and on the card), day headers
use short names (MON…FRI); the overlap banner lists every overlap once, starting with the
trimester(s) it happens in; course cards, timetable blocks, their hover tooltips, the overlap banner, the timetable header and the printed header show **no class dates** (only trimester names, days, times, sections, rooms); dates appear only in the exam calendar, Bullet notes and the .ics export. Course cards show day/time/section/room only
(no week counts); .ics export (one event per real date,
TZID Europe/Lisbon, file named after the draft); Print/PDF (header shows the draft name);
**named drafts**: the DRAFT stamp shows the current draft's name and opens a menu to switch drafts,
create a new empty one, duplicate, rename (max 30 characters) or delete (max 10 drafts); each draft
keeps its own courses and sections; "Clear all" clears the current draft only. Saved in localStorage
(`scheduleSandbox.student.v1` = `{ drafts: [{ id, name, selections }], draftId, programme, unit }`;
older saves with a single `selections` list become "Draft 1"; admin previews use separate keys). Header shows a **Beta version** tab (purple, on the line under the
header) and a centered beta disclaimer in the footer (replaces the old "Always confirm your final enrollment" line) ("Schedule Sandbox is a beta planning tool: it does not enroll you … always check"). Subtitle:
"Plan your classes and exams, try different schedule options, and avoid overlaps before enrollment."

## Publishing (admin page)
- **Publish to students** (timetable and exam sections) saves `<site>/data/timetable-data.js` /
  `<site>/data/exam-data.js` (`master/` or `undergraduate/`, from `window.Site`) straight into the GitHub repo via the REST contents API (GET for the sha, then
  PUT), commit message "Publish … from <file> (admin page)". GitHub Pages rebuilds in 1–2 minutes.
- Needs a fine-grained GitHub token (only Student-Schedule-Sandbox, Contents: Read and write, ≤1 year)
  saved under **Publishing settings**, stored only in that browser (`scheduleSandbox.publish.v1`:
  token, repo default `RitaQuintela/Student-Schedule-Sandbox`, branch default `main`). The token is
  only sent to api.github.com and never shown again. Errors are explained in plain words (401 expired,
  403 no permission, 404 wrong repo/branch). "Download data file" stays as the manual fallback.
- Never ask the owner to paste the token in chat; never put a token in the repo.
- Each publish panel starts with **"Live for students now:"** (source, publish time, rows/exams), read from the
  published data file with `?t=` so it is never the browser's saved copy; after a publish it re-checks every
  20 s (up to 5 min) and then says "now live for students".

## Bullet API (alternative to the CSV export)
- API docs: https://clsbe-api.bulletscheduling.com/swagger-documentation/index.html (full read/write API;
  the client **Integration_4** is read-only, confirmed by the owner 2026-11-04). Sign-in: OAuth client
  credentials at `https://clsbe-is.bulletscheduling.com/connect/token`, scope `bestlegacy_api_scope`.
  Classes come from `createeventallcsv`, or `allRows` if that one is refused (403); when both are refused the
  run lists what the client may read, to send to Bullet. The API sends no CORS headers, so browsers (the admin page) can't call it: only the GitHub task does.
- **GitHub Action "Fetch from Bullet"** (`.github/workflows/fetch-bullet.yml`, manual Run only, owner's
  choice) runs `scripts/fetch_bullet.py` (Python standard library). Inputs: semester **1** (Units S1/T1/T2)
  or **2** (S2/T3/T4), academic year (empty = current; switches on 1 May), mode **check** (summary only)
  or **save**. It calls `GET /api/Events/createeventallcsv/{start}/{end}` **one week per request** (Bullet sends each class once per request, its first date in the range, so monthly requests kept only one week a month), keeps only rows of
  the chosen semester's Units, splits by event type: **"Aula Mestrado" → master, "Aula Licenciatura" →
  undergraduate** (owner's choice; other types skipped and counted), keeps only the 13 columns (teacher and
  student data dropped), merges weeks, and commits `<site>/data/bullet-draft.js` (`window.BULLET_DRAFT`).
  Students see one semester at a time: the draft holds one semester.
- The run's summary (Actions page) lists counts and samples per site; the repo is public, so it never shows
  personal data or the secret.
- Admin page: "Or: load the latest fetch from Bullet" loads the draft into the same summary/warnings as an
  upload; the admin then publishes as usual. The CSV upload stays as the fallback.
- Secrets `BULLET_CLIENT_ID`, `BULLET_CLIENT_SECRET` are GitHub repository secrets, set by the owner.
  Never ask for them in chat, never put them in the repo.
- Field mapping to check against the first real run: Typology ← `typologyName` (must be T/PL/TP/O/S),
  StudentGroup ← `studentGroupName`, Classroom ← `classroomName`, Week/weekday ← `eventDateOccurrence`.

## Privacy
Raw exports contain staff usernames/emails (CreatedUser, LastModifiedUser). They are
git-ignored (`Bullet extraction*`). Only the cleaned `<site>/data/timetable-data.js` files are committed.

## Cache busting
GitHub Pages lets browsers keep files for 10 minutes, so a new page can load with an old stylesheet.
Every page (`master/` and `undergraduate/`, `index.html` and `admin.html`) loads `../css/styles.css` and `../js/*.js` with `?v=YYYYMMDDx`.
**Whenever CSS or JS changes, bump that version in both HTML files** (same value everywhere).
Data files (`data/*.js`) are not versioned (the admin's Publish button can't edit the HTML).

## Testing
Start the preview server from `.claude/launch.json`, then test both sites' `index.html` and `admin.html`
at desktop and 375px widths. `window.ScheduleSandbox` and `window.ScheduleAdmin` expose helpers
for console checks. Browsers cache scripts: reload with `fetch(url, {cache:'reload'})` first.
