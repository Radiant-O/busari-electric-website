/* BusterElectric: mobile navigation and forms. */
(function () {
  'use strict';

  /* ---------- mobile nav ---------- */
  var header = document.querySelector('[data-header]');
  var toggle = document.querySelector('[data-nav-toggle]');
  function setNav(open) {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }
  if (toggle) {
    toggle.addEventListener('click', function () { setNav(toggle.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && header.classList.contains('nav-open')) { setNav(false); toggle.focus(); } });
    window.matchMedia('(min-width: 1200px)').addEventListener('change', function (m) { if (m.matches) setNav(false); });
  }

  /* ---------- forms ----------
   * <form data-form data-subject="..." data-endpoint="https://...">
   * With an endpoint: POSTs JSON. Without one: opens the visitor's email app with the message filled in.
   */
  // Preselect a topic from the URL, e.g. /contact/?topic=plus
  var topicSelect = document.querySelector('[data-topic]');
  if (topicSelect) {
    var topic = new URLSearchParams(window.location.search).get('topic');
    var opt = topic && topicSelect.querySelector('option[data-key="' + topic.replace(/[^\w-]/g, '') + '"]');
    if (opt) opt.selected = true;
  }

  document.querySelectorAll('form[data-form]').forEach(function (form) {
    var status = form.querySelector('[data-form-status]');
    var submit = form.querySelector('[type="submit"]');

    function fieldLabel(input) {
      var l = form.querySelector('label[for="' + input.id + '"]');
      return l ? l.textContent.replace(/\s*\(optional\)\s*/i, '').trim() : input.name;
    }
    function showError(input, msg) {
      input.setAttribute('aria-invalid', 'true');
      var id = input.id + '-error';
      var el = document.getElementById(id);
      if (!el) { el = document.createElement('p'); el.id = id; el.className = 'field-error'; input.insertAdjacentElement('afterend', el); }
      el.textContent = msg;
      input.setAttribute('aria-describedby', id);
    }
    function clearError(input) {
      input.removeAttribute('aria-invalid');
      var el = document.getElementById(input.id + '-error');
      if (el) el.remove();
    }
    form.querySelectorAll('input, select, textarea').forEach(function (i) { i.addEventListener('input', function () { clearError(i); }); });

    function setStatus(state, msg) {
      if (!status) return;
      status.hidden = false; status.dataset.state = state; status.textContent = msg;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      form.querySelectorAll('input, select, textarea').forEach(function (i) {
        if (i.classList.contains('hp-input')) return;
        clearError(i);
        if (!i.checkValidity()) {
          var msg = i.validity.valueMissing ? (i.tagName === 'SELECT' ? 'Choose a ' + fieldLabel(i).toLowerCase() + '.' : 'Enter your ' + fieldLabel(i).toLowerCase() + '.')
            : i.dataset.error ? i.dataset.error
            : i.type === 'email' ? 'Enter an email address like name@company.com.'
            : i.type === 'tel' ? 'Enter a phone number with area code.'
            : 'Check this field.';
          showError(i, msg);
          firstBad = firstBad || i;
        }
      });
      if (firstBad) { firstBad.focus(); setStatus('error', 'Fix the highlighted fields, then send again.'); return; }

      var hp = form.querySelector('.hp-input');
      if (hp && hp.value) return; // bot

      var data = {};
      new FormData(form).forEach(function (v, k) { if (k !== 'website_url') data[k] = v; });
      var subject = form.dataset.subject || 'Website inquiry';
      var endpoint = form.dataset.endpoint;

      if (endpoint) {
        submit.disabled = true;
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(Object.assign({ _subject: subject }, data)) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); setStatus('ok', form.dataset.success || 'Message sent. We will reply within one business day.'); })
          .catch(function () { setStatus('error', 'Your message did not send. Try again, or email us at ' + form.dataset.email + '.'); })
          .then(function () { submit.disabled = false; });
      } else {
        var body = Object.keys(data).map(function (k) {
          var input = form.querySelector('[name="' + k + '"]');
          return (input && input.id ? fieldLabel(input) : k) + ': ' + data[k];
        }).join('\n');
        window.location.href = 'mailto:' + form.dataset.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        setStatus('ok', 'Your email app should open with your message ready to send. If it does not, email us at ' + form.dataset.email + '.');
      }
    });
  });
})();
