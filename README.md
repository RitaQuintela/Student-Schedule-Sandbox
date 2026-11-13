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
4. **Choose your section.** If a course has several sections (or runs in several trimesters),
   **+ Add** first asks you to pick one in a dropdown on the card; the course moves to your
   courses once you've picked (or click **Cancel**). You can change the section later on the card.
   Every choice says **✓ fits** or **⚠ overlaps** with what you've already picked.
   For courses with practical classes (PL), you choose the PL; the theory class (T) that
   goes with it is added automatically.
5. **Check for overlaps.** Overlapping classes are highlighted in **raspberry** with ⚠ on the timetable and on the course
   card, and a banner lists them. Two classes only overlap if they happen on the same day,
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

Use the admin page of the site you are updating (bookmark them: the student pages don't link to them):
[Master admin](https://catolica-lisbon-sbe.github.io/Student-Schedule-Sandbox/master/admin.html) and
[Undergraduate admin](https://catolica-lisbon-sbe.github.io/Student-Schedule-Sandbox/undergraduate/admin.html). Each one publishes only its own site's
files (`master/data/…` or `undergraduate/data/…`). The same exam planner works for both: each
admin page keeps only its own exams (Cycle MSc or UG). The GitHub token is saved once and works
on both admin pages.

### Update the data (each semester, or when something changes)

Do it once for **each site**: Master and Undergraduate. Publish the **timetable first**, then the
**exams**, because exams are linked to the timetable's courses by name.

Each publish section of the admin page starts with **Live for students now**: the file students
see, when it was published and its size. Use it to check where the current data comes from.

#### 1. Timetable (from Bullet)

1. On GitHub, open
   [Actions → Fetch from Bullet](https://github.com/catolica-lisbon-sbe/Student-Schedule-Sandbox/actions/workflows/fetch-bullet.yml)
   and click **Run workflow**:
   - **Semester**: 1 (S1, T1, T2) or 2 (S2, T3, T4).
   - **Academic year**: leave empty for the current one.
   - **Mode**: **check** shows a summary only; **save** keeps the fetch for the admin pages.
   It takes about a minute. One run fetches both sites.
2. About 2 minutes after a **save** run, open the site's **admin page** and click
   **Load latest from Bullet**. The text above the button shows when the fetch was made.
3. Read the **summary**:
   - **Trimester dates and reference weeks**: students see one week per trimester (by default the
     first full week). Change it in the dropdown if needed.
   - **Problems to review**: **errors** (raspberry) must be fixed in Bullet before you can publish.
     **Warnings** (purple) don't block you, but check them (for example, "PLs were paired by
     section number", or a row with no section name in Bullet).
4. Optional: **Preview in the student view** to try it. Only your browser sees the preview;
   click **Stop preview** when you're done.
5. Click **Publish to students** and confirm. The message shows the publish time, and after
   1–2 minutes it says "now live for students".

**Without Bullet** (fallback): export the "Bullet extraction" file (`.xlsx` or `.csv`) and upload it
on the admin page instead of step 1–2. The rest is the same.

#### 2. Exam calendar (from the Integrated Exams Planner)

1. On the same admin page, under **Publish an exam calendar**, upload the
   **Integrated Exams Planner** (`.xlsm` or `.xlsx`). The same file works for both sites: each
   keeps only its own exams (Cycle MSc or UG), with the season dates from **Periods**. Macros are never run.
2. Check the summary and notes:
   - **Exam names not matched**: small differences are ignored (& / and, hyphens, accents, text in
     brackets, a final "s"). Names that still don't match are listed: often courses from another
     term; otherwise fix the spelling in the planner and upload it again.
   - **Not shown to students**: exams dated before a course's first class (usually the same course
     taught in an earlier term) are left out.
3. **Preview in the student view** (optional), then **Publish to students**.

#### 3. Check the student page

Open the student page and refresh it with **Ctrl+F5** (browsers can keep the old data for up to
10 minutes). Add a course or two and check its times and exam dates.

### Set up publishing (once, then about once a year)

The **Publish to students** buttons save the new data straight to GitHub, which hosts the site.
They need a GitHub *token*: a key that only allows changing files in this repository.

1. Signed in to GitHub, open <https://github.com/settings/personal-access-tokens/new>.
2. **Token name**: "Schedule Sandbox publishing". **Resource owner**: **catolica-lisbon-sbe** (the
   organisation, not your own account). **Expiration**: up to 1 year.
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
| `js/exams.js` | The exam rules (reading the planner, matching names, overlaps) |
| `js/student.js`, `js/admin.js` | Logic of each page |
| `css/styles.css` | Look and layout, including print |
| `vendor/xlsx.full.min.js` | SheetJS, used to read Excel files (works offline) |
| `vendor/fonts/` | Barlow, the brand typeface (works offline) |
| `assets/` | Official Católica-Lisbon logos |
