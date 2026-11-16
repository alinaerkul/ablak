/*
 * Ablak — home page: tool panels that open in place.
 * Each tool (practice, phrases, courier card, call simulator) lives behind a
 * button. One panel is open at a time, so the page stays light until the
 * visitor asks for something.
 */
(function () {
  'use strict';
  var PANELS = { practice: 'practice-panel', phrases: 'phrases-panel', courier: 'courier-panel', sim: 'sim-panel' };

  function closeAll() {
    Object.keys(PANELS).forEach(function (k) {
      var p = document.getElementById(PANELS[k]);
      if (p) p.hidden = true;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tool-card'), function (c) { c.classList.remove('is-open'); });
  }

  function open(name) {
    var panel = document.getElementById(PANELS[name]);
    if (!panel) return;
    var wasOpen = !panel.hidden;
    closeAll();
    if (wasOpen) return;
    panel.hidden = false;
    var card = document.querySelector('.tool-card[data-card="' + name + '"]');
    if (card) card.classList.add('is-open');
    try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open]');
    if (opener) { open(opener.getAttribute('data-open')); return; }
    var closer = e.target.closest('[data-close]');
    if (closer) closeAll();
  });
})();
