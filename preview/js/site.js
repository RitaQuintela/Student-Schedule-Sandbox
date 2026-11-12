/*
 * Schedule Sandbox – which site this page belongs to.
 * Each site (master/, undergraduate/) sets <html data-site="…">; the shared code
 * reads its settings from window.Site. Loaded in <head>, before the other scripts.
 */
(function (global) {
  'use strict';

  const SITES = {
    master: {
      id: 'master',
      keyPrefix: 'scheduleSandbox',      // the original keys, so saved drafts keep working
      examCycle: 'msc',                 // planner rows kept (Cycle column)
      examCycleLabel: 'Master (MSc)',
      seasonsByTerm: true,              // students see "Trimester 1", not "Midterms"
      startHint: '<strong>If the Master Affairs team has already enrolled you in a section, pick that section.</strong> ' +
        'You can only choose your own section for electives.',
    },
    undergraduate: {
      id: 'undergraduate',
      keyPrefix: 'scheduleSandbox.ug',
      examCycle: 'ug',
      examCycleLabel: 'Undergraduate (UG)',
      seasonsByTerm: false,             // several seasons share a trimester: keep the planner's names
      startHint: '',
    },
  };

  const site = SITES[document.documentElement.dataset.site] || SITES.master;
  // Browser storage key for this site: key('student.v1') -> 'scheduleSandbox.student.v1' on master.
  site.key = name => site.keyPrefix + '.' + name;
  global.Site = site;
})(window);
