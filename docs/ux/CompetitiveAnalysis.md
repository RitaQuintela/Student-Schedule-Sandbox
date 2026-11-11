# [Schedule Sandbox] – Exercise 2: Competitive Analysis

## 1. Project Context

* **Market / Area:** EdTech, specifically course scheduling and enrollment planning in higher education.
* **Target Users:** Master and undergraduate students at Católica Lisbon who are about to enroll and need to choose courses and sections for the coming semester.
* **Target Platform:** Web, responsive (desktop and mobile browser, no installation or login).
* **One-Liner Project Summary:** Schedule Sandbox lets students try out their schedule before they enroll: they add courses, compare sections, and instantly see their weekly timetable and exam dates, with any overlaps flagged.

## 2. Competitors (4)

### Direct Competitors

1. **NUSMods** ([nusmods.com/timetable](https://nusmods.com/timetable)): A timetable planner made for National University of Singapore students, where they add courses, switch class sections on a weekly grid and see their exam dates.
2. **Coursicle** ([coursicle.com](https://www.coursicle.com/)): A class planner covering thousands of universities, where students search classes, add them to a weekly calendar and keep their tasks and reminders in the same place.

### Indirect / Analogous Solutions

3. **Google Calendar:** A general calendar where students can type in their classes by hand and see overlapping events side by side, but with no course data, sections or exam calendar.
4. **Excel or a paper timetable grid:** What most students do today, copying class times from the official timetable into a grid of their own, which is flexible but slow and easy to get wrong.

## 3. Deep-Dive Audit

### Competitor 1: NUSMods

Link: [nusmods.com/timetable](https://nusmods.com/timetable) (open to anyone, no login)

* **Primary Interaction Loop:**
   1. The student opens the Timetable page (no login) and sees an empty weekly grid for the current semester.
   2. They type a course code or name in the "Add course to timetable" box under the grid and pick a result.
   3. The course lands on the grid straight away, with a lecture, tutorial and lab section already chosen for them.
   4. To change a section, they click its block; the other available times for that class appear on the grid and they click the one they want.
   5. The course list under the grid shows each course's exam date, time and credits; an "Exam Calendar" button switches the grid to a calendar of exams.
   6. They download the result (image, PDF, calendar file) or share it with a link.
* **Key UI Patterns & Mechanics:**
   * Open canvas: the timetable is the main workspace and sections are changed directly on it, not in a form.
   * Search-to-add: a single search box, with no course list to browse on the same screen.
   * Auto-fill: sections are pre-selected, so the student edits a full timetable instead of building one from nothing.
   * Toggles on one toolbar: Vertical Mode, Show Titles, Exam Calendar, Download, Share/Sync, Reset.
   * One semester per page, with Previous / Next Semester arrows.
   * Separate pages for extras: an Optimiser that builds a timetable automatically, and a multi-year Planner.
* **Friction & Cognitive Load Points:**
   * The student must already know which course to type; discovering courses means leaving the timetable for the Courses page.
   * Pre-selected sections can be mistaken for the only option, and clicking a block to reveal alternatives is not signposted.
   * Showing every alternative time at once makes a busy grid crowded and hard to read.
   * Blocks show codes (CS1010, TUT [05]) by default, which assumes the student knows them by heart.
   * Exams sit in a separate view from classes, so the student never sees both together.
   * Only one semester is visible at a time, so planning across two terms means flipping back and forth.

**SWOT**

* **Strengths:**
   * Fast and direct: add a course and it is on the grid in seconds, with no login.
   * Changing sections on the grid itself keeps the student's eyes on the timetable.
   * Exam dates include times, so exam overlaps can be precise.
   * Sharing by link, several export formats, and an automatic optimiser.
   * Trusted and mature: built by students and maintained by an open-source community for over ten years.
* **Weaknesses:**
   * Built only for one university's data and rules; it cannot be used elsewhere as is.
   * No side-by-side view of two terms.
   * Relies on course codes and hidden interactions, which is harder for new students.
   * Many features and pages (Today, Optimiser, Venues, Planner) add clutter for someone who only wants to check a schedule.
* **Opportunities (for Schedule Sandbox):**
   * Show both trimesters and their exams on one screen, which NUSMods does not.
   * Keep the course list next to the timetable, with Program filters, so students can browse without knowing codes.
   * Say "fits" or "overlaps" on each section before the student picks it, not after.
   * Borrow what works: sharing a draft by link, and changing a section by clicking its block.
* **Threats:**
   * Students who have seen tools like this expect the same polish: sharing, automatic schedule generation, a phone app.
   * It is open source, so another school or vendor could adapt it and offer a ready-made alternative.
   * It sets the bar for data freshness: if the Sandbox timetable is ever out of date, trust drops quickly.

### Competitor 2: Coursicle

Link: [coursicle.com](https://www.coursicle.com/) (pick a school; example with course data: [coursicle.com/unc](https://www.coursicle.com/unc/))

* **Primary Interaction Loop:**
   1. The student picks their university from a list of about 6,000 schools (no login to start).
   2. The planner opens with class cards on the left (code, section, title, days, time, instructor) and a weekly calendar in the middle.
   3. They search for a class or narrow the list with filters (term, weekdays, time range).
   4. They press "Add" on a card; the button turns to "Added" and the class appears as blocks on the calendar, which jumps to the first week of that term.
   5. They can add personal events ("+ Event") and keep more than one schedule (a "Primary" schedule menu).
   6. They share the schedule, and are invited to add homework tasks and reminders, or sync them from Canvas, Moodle, Blackboard or Brightspace.
   7. At a school with no course data (e.g. Trinity College Dublin), there is nothing to search: the student types each class by hand in a "New Course" form (name, days, start and end time, colour, location, professor).
* **Key UI Patterns & Mechanics:**
   * Three panels on one screen: class list, calendar, tasks.
   * Card + "Add" button: one card per section, so choosing a section means choosing a card.
   * Real dated calendar (Sunday to Saturday, all 24 hours, scrolls week by week) instead of a typical-week grid.
   * Left icon bar: Courses, Account, Premium.
   * Freemium: a "Premium Preview" countdown and "Get Premium" prompts inside the planner.
   * A robot check ("I'm not a robot") can interrupt searching.
* **Friction & Cognitive Load Points:**
   * Every section is a separate card, so a course with ten sections is ten near-identical cards to compare by reading.
   * Nothing on a card says whether that section fits the classes already added; the student only finds out on the calendar.
   * The calendar shows real dates and all hours, so the student scrolls and pages to find their classes, and the view jumps when a class is added.
   * The term in the search box and the term shown above the calendar can differ, which is confusing.
   * Tasks, reminders, chat and Premium prompts compete for attention with the one job of building a schedule.
   * No exam calendar: exam dates and exam overlaps are not part of the tool.
   * Outside the US and Canada many schools have no data, so the tool becomes manual typing.

**SWOT**

* **Strengths:**
   * Course list and calendar side by side: browse, add, see the result immediately.
   * Clear "Add" / "Added" button that needs no explanation.
   * Works for thousands of schools, with a phone app and sharing.
   * Covers the whole semester after enrollment too (tasks, reminders), so students keep coming back.
   * Several schedules can be kept and compared.
* **Weaknesses:**
   * No exams, and no upfront "fits / overlaps" signal on a section.
   * Sections of the same course are not grouped.
   * Data quality depends on the school; for many European schools there is none.
   * Premium prompts and the robot check interrupt the flow.
   * Generic: it knows nothing about a school's own rules (paired lectures and practicals, trimesters, Programs).
* **Opportunities (for Schedule Sandbox):**
   * Group sections inside one course card and mark each one "fits" or "overlaps" before the student chooses.
   * Include the exam calendar and exam overlaps, which Coursicle leaves out.
   * Use official, always-current school data and the school's own rules, with no account, no ads and no paid tier.
   * Keep a simple typical-week grid per trimester instead of a dated calendar the student has to page through.
   * Borrow what works: the plain "Add" / "Added" button, and sharing a schedule.
* **Threats:**
   * Students may already use Coursicle or a similar app for tasks and reminders and prefer one tool for everything.
   * If Coursicle added Católica Lisbon's course data, it would offer a polished phone app the Sandbox does not have.
   * Its all-in-one promise ("All your academics, all in one place") raises expectations for features beyond scheduling.

## 4. Key Lessons & Behavioral Directives for Our Design

1. **Friction to Avoid:** Making the student discover an overlap only after acting. In NUSMods sections are pre-chosen and alternatives stay hidden until a block is clicked; in Coursicle every section is a separate card with no sign of whether it fits. We prohibit both: no hidden interactions, no pre-chosen sections, and no section offered without saying "fits" or "overlaps" first. We also keep out anything that competes with the schedule (tasks, chat, paid prompts, logins).
2. **Opportunity Gap:** Students think about enrollment as one decision covering the whole semester: both trimesters and their exams together. Neither competitor matches that. NUSMods shows one semester at a time with exams in a separate view; Coursicle has no exams at all; Google Calendar and Excel have no course data. We show both trimesters side by side, each with its exams underneath, using the school's official data and its own rules (Programs, paired lectures and practicals).
3. **Behavioral Rule:** Every action shows its consequence immediately and on the same screen. Adding, switching or removing a course updates the timetable, the exam calendar and the overlap flags at once, and overlaps are always flagged but never blocked, so the student stays free to experiment. Nothing the student does in the tool is final: it is always a draft.

## How this was checked

Both tools were opened and tried on 10 November 2026.

* **NUSMods, confirmed:** toolbar, search box, auto-chosen sections, exam line per course, one-semester view. **To confirm by hand:** click a block to swap section, export formats, how exams on the same day are shown.
* **Coursicle, confirmed:** school picker, class cards with "Add" / "Added", dated calendar, filters, schedule menu, tasks panel, Premium prompts, manual "New Course" form, robot check. **To confirm by hand:** what happens when two added classes overlap, what the schedule menu offers, what Premium unlocks.
