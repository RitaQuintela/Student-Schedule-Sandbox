# Schedule Sandbox

**Católica Lisbon School of Business & Economics** – a planning tool for master students
to put together their own weekly timetable.

> This is a planning tool. It does not enrol you in anything. Always confirm your final
> choices in the official systems.

---

## For students

1. **Open the app.** Open `index.html` (or the website link your program shares).
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
5. **Check for overlaps.** Clashing classes turn **red** on the timetable and on the course
   card, and a red banner lists them. Two classes only clash if they happen on the same day,
   at the same time, in at least one of the same weeks.
6. **Pick the trimester.** Use **Trimester** to switch between the two trimesters of the semester
   (e.g. Trimester 1 and Trimester 2). Each shows only the classes that happen in it; semester-long
   courses appear in both. Overlaps are only counted when classes really happen in the same week.
7. **Save it to your calendar.** **Export to calendar (.ics)** creates one event for every real
   class date (Lisbon time). Open the file with Google Calendar, Outlook or Apple Calendar.
   **Print / PDF** gives you a printable timetable.

8. **Check your exams.** The **Exam calendar** (under the timetable, or the **Exams** tab on a
   phone) shows the exam dates of the courses you picked, season by season. A **red** day means two
   of your exams fall on the same day; **amber** means exams on consecutive days. Each course card
   also lists its exam dates. Exam times and rooms aren't included yet.

> **Beta version.** Use it to plan, but always check the information against the official class
> timetable and exam calendar.

Your choices are remembered in this browser, so you can come back later. On a phone,
switch between **Courses** and **Timetable** at the top, and use the day tabs to move
between days.

---

## For the admin

### Publish a new timetable

1. Export the timetable from the scheduling system ("Bullet extraction", `.xlsx` or `.csv`).
2. Open **`admin.html`** and upload the file. Nothing is sent anywhere; it's read in your browser.
3. Read the **summary** (courses, sections, weekly classes), the **trimester dates** students will
   see, and the **problems to review**:
   - **Errors** (red) must be fixed in the file before you can continue.
   - **Warnings** (amber) don't block you, but check them. For example, “PLs were paired
     by section number” means the file has no pairing notes for that course.
4. Click **Preview in the student view** to try it yourself. Only your browser sees the preview.
   Use **Stop preview** (or “Back to the published timetable”) when you're done.
5. Click **Download data file** to get `timetable-data.js`, and replace the file
   `data/timetable-data.js` with it. That's the only file that changes. No code editing needed.

### Publish a new exam calendar

1. Open **`admin.html`** and, under **Publish an exam calendar**, upload the
   **Integrated Exams Planner** (`.xlsm` or `.xlsx`). The app reads its **ExamData** sheet
   (Master exams only) and the season dates from **Periods**. Macros are never run.
2. Check the summary and notes:
   - **Exam names not matched**: exams are linked to courses **by name**. Small differences are
     ignored (& / and, hyphens, accents, text in brackets, a final "s"), and "Language Courses"
     covers every language course. Names that still don't match are listed. Often these are
     courses from another term; otherwise fix the spelling in the planner.
   - **Not shown to students**: exams dated before a course's first class (usually the same course
     taught in an earlier term) are left out.
3. **Preview in the student view**, then **Download data file** to get `exam-data.js`, and replace
   `data/exam-data.js` with it. The class timetable and the exam calendar are published separately.

### How to fill in the timetable file

Download the **Excel template** from the admin page. The key rules:

| Column | What to put |
|---|---|
| ModuleCode | Groups rows into one course. |
| SectionName | T1, PL-G1, TP1… Rows with the same name are the same section. |
| Typology | T, PL, TP, O or S. |
| WeekdayName, StartTime, EndTime | Monday–Friday, between 08:00 and 20:00. |
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
(see `.gitignore`). Only the cleaned `data/timetable-data.js`, which has just the
timetable columns, is published.

---

## Files

| File | What it is |
|---|---|
| `index.html` | Student app |
| `admin.html` | Admin upload page |
| `data/timetable-data.js` | The published timetable (replace it to publish a new one) |
| `data/exam-data.js` | The published exam calendar (replace it to publish a new one) |
| `js/parser.js` | The timetable rules (pairing, weeks, warnings) |
| `js/exams.js` | The exam rules (reading the planner, matching names, clashes) |
| `js/student.js`, `js/admin.js` | Logic of each page |
| `css/styles.css` | Look and layout, including print |
| `vendor/xlsx.full.min.js` | SheetJS, used to read Excel files (works offline) |
| `vendor/fonts/` | Barlow, the brand typeface (works offline) |
| `assets/` | Official Católica-Lisbon logos |
