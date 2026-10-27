# Schedule Sandbox

**Católica Lisbon School of Business & Economics** – a planning tool for Master and
undergraduate students to put together their own weekly timetable.

There are two sites, each with its own timetable, exam calendar and admin page:

| Site | Student page | Admin page |
|---|---|---|
| Master Programs | `master/index.html` | `master/admin.html` |
| Undergraduate Programs | `undergraduate/index.html` | `undergraduate/admin.html` |

The old address (the site's main page) still opens the Master site. Both sites work the same way;
the undergraduate one uses the undergraduate green, has no program filter and shows the
planner's exam season names (Midterms, Endterms, Final Exams).

> This is a planning tool. It does not enrol you in anything. Always confirm your final
> choices in the official systems.

---

## For students

1. **Open the app.** Open the website link your program shares (or `master/index.html` /
   `undergraduate/index.html`).
2. **Find your courses.** Search by name, acronym or code, or filter by program and period.
3. **Add a course.** Click **+ Add**, or drag the course onto the timetable.
   The button changes to **Added ✓**. Click it again to remove the course (it shows **Remove ✕**),
   or click the small **×** on one of its classes in the timetable (you can also drag a class
   back onto the course list).
   Your courses stay at the top of the list.
4. **Choose your section.** Each added course has a dropdown. Every choice says
   **✓ fits** or **⚠ overlaps** with what you've already picked.
   For courses with practical classes (PL), you choose the PL; the theory class (T) that
   goes with it is added automatically.
5. **Check for overlaps.** Clashing classes are highlighted in **raspberry** with ⚠ on the timetable and on the course
   card, and a banner lists them. Two classes only clash if they happen on the same day,
   at the same time, in at least one of the same weeks.
6. **Pick the trimester.** Use **Trimester** to switch between the two trimesters of the semester
   (e.g. Trimester 1 and Trimester 2). Each shows only the classes that happen in it; semester-long
   courses appear in both. Overlaps are only counted when classes really happen in the same week.
7. **Save it to your calendar.** **Export to calendar (.ics)** creates one event for every real
   class date (Lisbon time). Open the file with Google Calendar, Outlook or Apple Calendar.
   **Print / PDF** gives you a printable timetable.

8. **Check your exams.** The **Exam calendar** (under the timetable, or the **Exams** tab on a
   phone) shows the exam dates of the courses you picked, one trimester per column. A **raspberry** day means two
   of your exams fall on the same day. Each course card
   also lists its exam dates. Exam times and rooms aren't included yet.

> Schedule Sandbox is a beta planning tool: it does not enroll you in anything.
> Use it to plan your enrollment on the official platforms, and always check the information against
> the official class timetable and exam calendar.

Your choices are remembered in this browser, so you can come back later. On a phone,
switch between **Courses** and **Timetable** at the top, and use the day tabs to move
between days.

---

## For the admin

Use the admin page of the site you are updating: `master/admin.html` for Master Programs,
`undergraduate/admin.html` for Undergraduate Programs. Each one publishes only its own site's
files (`master/data/…` or `undergraduate/data/…`). The same exam planner works for both: each
admin page keeps only its own exams (Cycle MSc or UG). The GitHub token is saved once and works
on both admin pages.

### Publish a new timetable

1. Export the timetable from the scheduling system ("Bullet extraction", `.xlsx` or `.csv`).
2. Open the site's **admin page** and upload the file. Nothing is sent anywhere; it's read in your browser.
3. Read the **summary** (courses, sections, weekly classes), the **trimester dates** students will
   see, and the **problems to review**:
   - **Errors** (raspberry) must be fixed in the file before you can continue.
   - **Warnings** (purple) don't block you, but check them. For example, “PLs were paired
     by section number” means the file has no pairing notes for that course.
4. Click **Preview in the student view** to try it yourself. Only your browser sees the preview.
   Use **Stop preview** (or “Back to the published timetable”) when you're done.
5. Click **Publish to students**. The live site shows the new timetable within 1–2 minutes.
   (One-time setup: see **Set up publishing** below. Without it, use **Download data file** and
   replace `master/data/timetable-data.js` or `undergraduate/data/timetable-data.js` by hand.)

### Publish a new exam calendar

1. Open the site's **admin page** and, under **Publish an exam calendar**, upload the
   **Integrated Exams Planner** (`.xlsm` or `.xlsx`). The app reads its **ExamData** sheet
   (only that site's exams: MSc or UG) and the season dates from **Periods**. Macros are never run.
2. Check the summary and notes:
   - **Exam names not matched**: exams are linked to courses **by name**. Small differences are
     ignored (& / and, hyphens, accents, text in brackets, a final "s"), "Language Courses"
     covers every language course and "Portuguese Language Course" every Portuguese course
     (extensive and intensive). Names that still don't match are listed. Often these are
     courses from another term; otherwise fix the spelling in the planner.
   - **Not shown to students**: exams dated before a course's first class (usually the same course
     taught in an earlier term) are left out.
3. **Preview in the student view**, then **Publish to students**. The class timetable and the exam
   calendar are published separately.

### Set up publishing (once, then about once a year)

The **Publish to students** buttons save the new data straight to GitHub, which hosts the site.
They need a GitHub *token*: a key that only allows changing files in this repository.

1. Signed in to GitHub, open <https://github.com/settings/personal-access-tokens/new>.
2. **Token name**: "Schedule Sandbox publishing". **Expiration**: up to 1 year.
3. **Repository access**: "Only select repositories" → **Student-Schedule-Sandbox**.
4. **Permissions → Repository permissions → Contents**: "Read and write". Nothing else.
5. **Generate token**, copy it, and paste it on the admin page under **Publishing settings**.
   Click **Save in this browser**, then **Test connection**.

The token is saved only in that browser, so set it up on your own computer. Never share it; if it
leaks, delete it on GitHub and make a new one. When it expires, the admin page tells you, and you
repeat these steps.

### How to fill in the timetable file

Download the **Excel template** from the admin page. The key rules:

| Column | What to put |
|---|---|
| ModuleCode | Groups rows into one course. |
| SectionName | T1, PL-G1, TP1… Rows with the same name are the same section. |
| Typology | T, PL, TP, O or S. |
| WeekdayName, StartTime, EndTime | Monday–Friday, between 08:00 and 21:30. |
| Week | The Mondays of the weeks the class happens, e.g. `2026-10-26,2026-11-02`. Leave out holiday weeks. |
| Unit | The period: S1, T2… (used for the period filter). |
| StudentGroup | Program groups, comma-separated (used for the program filter). |
| Annotations | On **T** rows: which PLs go with this T, e.g. `For PL-G1, PL-G2 and PL-E1.` Any other note (e.g. “Online course…”) is shown to students. |

**T/PL pairing:** a PL that isn't mentioned in any T note goes with the T section that has
no note (usually the only T). If a course has several T sections, write a note on each T row
so the pairing is explicit. If a course has PLs but no T, its TP section plays the role of the T.

### Privacy

Raw exports include staff usernames and emails, and the exam planner includes student numbers.
They are kept out of Git
(see `.gitignore`). Only the cleaned `master/data/timetable-data.js`, which has just the
timetable columns, is published.

---

## Files

| File | What it is |
|---|---|
| `master/index.html` | Student app (Master Programs) |
| `master/admin.html` | Admin upload page (Master Programs) |
| `master/data/timetable-data.js` | The published timetable (replace it to publish a new one) |
| `master/data/exam-data.js` | The published exam calendar (replace it to publish a new one) |
| `js/parser.js` | The timetable rules (pairing, weeks, warnings) |
| `js/exams.js` | The exam rules (reading the planner, matching names, clashes) |
| `js/student.js`, `js/admin.js` | Logic of each page |
| `css/styles.css` | Look and layout, including print |
| `vendor/xlsx.full.min.js` | SheetJS, used to read Excel files (works offline) |
| `vendor/fonts/` | Barlow, the brand typeface (works offline) |
| `assets/` | Official Católica-Lisbon logos |
