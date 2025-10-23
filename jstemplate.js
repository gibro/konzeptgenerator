(function() {
  function initSeminarplaner() {
    const wrapper = document.querySelector('.sp-wrapper');
    if (!wrapper || wrapper.dataset.spInitialized === '1') {
      return;
    }
    wrapper.dataset.spInitialized = '1';

    function buildStorageKey() {
      const path = location.pathname.replace(/\/+$/, '');
      return 'seminarplan_' + path;
    }

    const CONFIG = {
      baseSlotMinutes: 5,
      day: { start: { h: 8, m: 0 }, end: { h: 22, m: 0 } },
      days: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'],
      storageKey: buildStorageKey(),
      metaKey: buildStorageKey() + '_meta',
      zoomKey: buildStorageKey() + '_zoom'
    };

    const BASE_SLOT_MINUTES = CONFIG.baseSlotMinutes;
    const ZOOM_LEVELS = [
      { id: 'fine', label: '5 Min', slotMinutes: 5, slotPx: 18, labelEverySlots: 3, showMinor: true },
      { id: 'medium', label: '15 Min', slotMinutes: 15, slotPx: 26, labelEverySlots: 1, showMinor: true },
      { id: 'coarse', label: '30 Min', slotMinutes: 30, slotPx: 30, labelEverySlots: 2, showMinor: false }
    ];
    let zoomIndex = 0;

    const toMin = (h, m) => h * 60 + m;
    const DAY_START = toMin(CONFIG.day.start.h, CONFIG.day.start.m);
    const DAY_END = toMin(CONFIG.day.end.h, CONFIG.day.end.m);
    let slotMinutes = ZOOM_LEVELS[zoomIndex].slotMinutes;
    let slotPx = ZOOM_LEVELS[zoomIndex].slotPx;
    let slotsPerDay = (DAY_END - DAY_START) / slotMinutes;

    const timesContainer = document.getElementById('sp-times');
    const msg = document.getElementById('sp-msg');
    const printList = document.getElementById('sp-print-list');
    const printTable = document.getElementById('sp-print-table');
    let modalKeydownHandler = null;
    const modal = document.createElement('div');
    modal.className = 'sp-modal';
    modal.innerHTML = `
      <div class="sp-modal__backdrop" data-modal-close="1"></div>
      <div class="sp-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="sp-break-modal-title">
        <header class="sp-modal__header">
          <h2 id="sp-break-modal-title">Pause hinzufügen</h2>
          <button type="button" class="sp-modal__close" data-modal-close="1" aria-label="Modal schließen">✕</button>
        </header>
        <form class="sp-modal__body" id="sp-break-form">
          <label class="sp-modal__field">
            <span class="sp-modal__label">Tag</span>
            <select name="day" id="sp-break-day" required>
              ${CONFIG.days.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </label>
          <label class="sp-modal__field">
            <span class="sp-modal__label">Startzeit</span>
            <input type="time" name="start" id="sp-break-start" min="08:00" max="21:55" required>
          </label>
          <label class="sp-modal__field">
            <span class="sp-modal__label">Dauer (Minuten)</span>
            <input type="number" name="duration" id="sp-break-duration" min="5" step="5" value="15" required>
          </label>
          <div class="sp-modal__actions">
            <button type="button" class="sp-btn sp-btn--ghost" data-modal-close="1">Abbrechen</button>
            <button type="submit" class="sp-btn sp-btn--primary">Übernehmen</button>
          </div>
        </form>
      </div>`;
    const breakForm = modal.querySelector('#sp-break-form');
    const breakDayField = modal.querySelector('#sp-break-day');
    const breakStartField = modal.querySelector('#sp-break-start');
    const breakDurationField = modal.querySelector('#sp-break-duration');
    breakStartField.setAttribute('min', formatTime(DAY_START));
    breakStartField.setAttribute('max', formatTime(DAY_END - BASE_SLOT_MINUTES));
    wrapper.appendChild(modal);
    modal.setAttribute('aria-hidden', 'true');
    resetBreakForm();
    const zoomOutBtn = document.getElementById('sp-zoom-out');
    const zoomInBtn = document.getElementById('sp-zoom-in');
    const zoomIndicator = document.getElementById('sp-zoom-indicator');
    const $printTitle = document.getElementById('sp-print-title');
    const defaultPrintTitle = 'Seminarplaner (Drag & Drop)';
    const cardLookup = Object.create(null);

    wrapper.style.setProperty('--slot-height', slotPx + 'px');

    const $metaTitle = document.getElementById('sp-meta-title');
    const $metaDate = document.getElementById('sp-meta-date');
    const $metaNumber = document.getElementById('sp-meta-number');
    const $metaContact = document.getElementById('sp-meta-contact');

    const $phTitle = document.getElementById('sp-ph-title');
    const $phDate = document.getElementById('sp-ph-date');
    const $phNumber = document.getElementById('sp-ph-number');
    const $phContact = document.getElementById('sp-ph-contact');

    function label(min) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    function buildTimeColumn() {
      const level = ZOOM_LEVELS[zoomIndex];
      const labelEvery = level.labelEverySlots || Math.max(1, Math.round(60 / slotMinutes));
      const showMinor = level.showMinor;
      const frag = document.createDocumentFragment();
      for (let t = DAY_START, i = 0; t < DAY_END; t += slotMinutes, i++) {
        const d = document.createElement('div');
        const isMajor = i % labelEvery === 0;
        const classes = ['sp-timeslot'];
        classes.push(isMajor ? 'sp-timeslot--major' : showMinor ? 'sp-timeslot--minor' : 'sp-timeslot--quiet');
        d.className = classes.join(' ');
        d.textContent = isMajor ? label(t) : '';
        d.style.textAlign = 'right';
        d.style.paddingRight = '8px';
        d.style.fontSize = '12px';
        if (i === 0) {
          d.style.borderTop = 'none';
        }
        frag.appendChild(d);
      }
      timesContainer.innerHTML = '';
      timesContainer.appendChild(frag);
    }

    function setupDayGrids() {
      const level = ZOOM_LEVELS[zoomIndex];
      const labelEvery = level.labelEverySlots || Math.max(1, Math.round(60 / slotMinutes));
      const showMinor = level.showMinor;
      document.querySelectorAll('.sp-daycol').forEach(dayCol => {
        dayCol.style.setProperty('--rows', slotsPerDay);
        dayCol.style.setProperty('--slot-height', slotPx + 'px');

        const grid = dayCol.querySelector('.sp-grid');
        if (grid) {
          grid.style.setProperty('--rows', slotsPerDay);
          grid.innerHTML = '';
          for (let i = 0; i < slotsPerDay; i++) {
            const cell = document.createElement('div');
            const isMajor = i % labelEvery === 0;
            const classes = ['sp-timeslot'];
            classes.push(isMajor ? 'sp-timeslot--major' : showMinor ? 'sp-timeslot--minor' : 'sp-timeslot--quiet');
            cell.className = classes.join(' ');
            cell.addEventListener('dragover', e => e.preventDefault());
            cell.addEventListener('drop', e => onDrop(e, grid, i));
            grid.appendChild(cell);
          }
        }

        const overlay = dayCol.querySelector('.sp-overlay');
        if (overlay) {
          overlay.style.setProperty('--rows', slotsPerDay);
          overlay.style.setProperty('--slot-height', slotPx + 'px');
        }
      });
    }

    function getCurrentLevel() {
      return ZOOM_LEVELS[zoomIndex];
    }

    function updateGridDimensions() {
      const level = getCurrentLevel();
      slotMinutes = level.slotMinutes;
      slotPx = level.slotPx;
      slotsPerDay = Math.max(1, Math.round((DAY_END - DAY_START) / slotMinutes));
      wrapper.style.setProperty('--slot-height', slotPx + 'px');
      wrapper.dataset.spZoom = level.id;
    }

    function refreshLayout(options = {}) {
      const { preserveScroll = false } = options;
      let scrollMemory;
      if (preserveScroll) {
        scrollMemory = [];
        document.querySelectorAll('.sp-daycol').forEach((dayCol, idx) => {
          scrollMemory[idx] = dayCol.scrollTop;
        });
      }
      buildTimeColumn();
      setupDayGrids();
      normalizeSidebar();
      hydratePlanDetailsFromLookup();
      renderOverlays();
      renderPrintList();
      renderPrintTable();
      updateSums();
      if (preserveScroll && scrollMemory) {
        document.querySelectorAll('.sp-daycol').forEach((dayCol, idx) => {
          if (typeof scrollMemory[idx] === 'number') {
            dayCol.scrollTop = scrollMemory[idx];
          }
        });
      }
      updateZoomControls();
    }

    function updateZoomControls() {
      const level = getCurrentLevel();
      if (zoomInBtn) {
        zoomInBtn.disabled = zoomIndex === 0;
      }
      if (zoomOutBtn) {
        zoomOutBtn.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
      }
      if (zoomIndicator) {
        zoomIndicator.textContent = level.label;
        zoomIndicator.setAttribute('data-zoom', level.id);
      }
    }

    function persistZoom() {
      try {
        localStorage.setItem(CONFIG.zoomKey, String(zoomIndex));
      } catch (err) {
        /* ignore persistence errors */
      }
    }

    function changeZoom(delta) {
      const next = Math.min(Math.max(zoomIndex + delta, 0), ZOOM_LEVELS.length - 1);
      if (next === zoomIndex) {
        return;
      }
      zoomIndex = next;
      updateGridDimensions();
      refreshLayout({ preserveScroll: true });
      persistZoom();
    }

    function loadZoomPreference() {
      try {
        const stored = localStorage.getItem(CONFIG.zoomKey);
        const parsed = Number.parseInt(stored, 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed < ZOOM_LEVELS.length) {
          zoomIndex = parsed;
        }
      } catch (err) {
        zoomIndex = 0;
      }
      updateGridDimensions();
    }

    function resetBreakForm() {
      const defaultStart = Math.min(
        DAY_END - BASE_SLOT_MINUTES,
        Math.max(DAY_START, snapToGridStart(DAY_START + 4 * 60))
      );
      breakDayField.value = CONFIG.days[0];
      breakStartField.value = formatTime(defaultStart);
      breakDurationField.value = String(15);
    }

    function openBreakModal(options = {}) {
      resetBreakForm();
      const {
        day = CONFIG.days[0],
        startMin = snapToGridStart(DAY_START + 4 * 60),
        duration = 15
      } = options;
      if (CONFIG.days.includes(day)) {
        breakDayField.value = day;
      }
      const editableStart = Math.min(
        DAY_END - BASE_SLOT_MINUTES,
        Math.max(DAY_START, snapToGridStart(startMin))
      );
      breakStartField.value = formatTime(editableStart);
      breakDurationField.value = String(snapDuration(duration));
      modal.classList.add('sp-modal--visible');
      modal.removeAttribute('aria-hidden');
      clearWarn();
      if (modalKeydownHandler) {
        document.removeEventListener('keydown', modalKeydownHandler);
      }
      modalKeydownHandler = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeBreakModal();
        }
      };
      document.addEventListener('keydown', modalKeydownHandler);
      setTimeout(() => {
        breakStartField.focus();
      }, 0);
    }

    function closeBreakModal() {
      modal.classList.remove('sp-modal--visible');
      modal.setAttribute('aria-hidden', 'true');
      if (modalKeydownHandler) {
        document.removeEventListener('keydown', modalKeydownHandler);
        modalKeydownHandler = null;
      }
      resetBreakForm();
    }

    function normalizeSidebar() {
      const sidebar = document.getElementById('sp-methods');
      if (!sidebar) {
        return;
      }
      const cards = [...sidebar.querySelectorAll('.sp-card')];
      for (const key in cardLookup) {
        delete cardLookup[key];
      }

      cards.forEach(card => {
        const titleEl = card.querySelector('.sp-title-text');
        const moreAnchor = card.querySelector('.sp-morelink a');
        if (titleEl) {
          titleEl.setAttribute('draggable', 'false');
          titleEl.addEventListener('dragstart', ev => ev.preventDefault());
        }

        const titleText = (card.querySelector('.sp-titletext')?.textContent || '').trim();
        const durationRaw = (card.querySelector('.sp-duration')?.textContent || '').toString();
        const durationValue = parseInt(durationRaw.replace(/\D+/g, ''), 10);
        const dur = snapDuration(Number.isFinite(durationValue) ? durationValue : BASE_SLOT_MINUTES);
        card.style.removeProperty('min-height');

        const entryId = moreAnchor ? extractEntryId(moreAnchor.getAttribute('href')) : null;
        const details = extractCardDetails(card);
        const cardHtml = prepareCardHtml(card);
        if (entryId) {
          card.dataset.entryId = entryId;
          cardLookup[entryId] = { html: cardHtml, title: titleText, details: cloneDetails(details) };
        } else {
          delete card.dataset.entryId;
        }
        card.dataset.printHtml = cardHtml;
        card.dataset.dragTitle = titleText;
        card.dataset.dragDuration = String(dur);
        card.dataset.dragDetails = JSON.stringify(cloneDetails(details));

        if (!card.dataset.boundDrag) {
          card.dataset.boundDrag = '1';
          const dragGuardReset = () => {
            delete card.dataset.dragGuard;
          };
          card.addEventListener('pointerdown', ev => {
            card.dataset.dragGuard = ev.target.closest('.sp-title-text') ? '0' : '1';
          });
          card.addEventListener('pointerup', dragGuardReset);
          card.addEventListener('pointercancel', dragGuardReset);
          card.addEventListener('mouseleave', dragGuardReset);
          card.addEventListener('dragstart', e => {
            if (card.dataset.dragGuard === '0') {
              e.preventDefault();
              return;
            }
            let payloadDetails;
            try {
              payloadDetails = card.dataset.dragDetails ? JSON.parse(card.dataset.dragDetails) : cloneDetails(details);
            } catch (err) {
              payloadDetails = cloneDetails(details);
            }
            const payload = {
              type: 'method',
              title: card.dataset.dragTitle || '',
              duration: snapDuration(
                Number.parseInt(
                  card.dataset.dragDuration || String(BASE_SLOT_MINUTES),
                  10
                )
              ),
              cardHtml: card.dataset.printHtml || '',
              entryId: card.dataset.entryId || null,
              details: payloadDetails
            };
            e.dataTransfer.setData('text/plain', JSON.stringify(payload));
          });
        }
      });
    }

    function minutesToIndex(min) {
      return Math.floor((min - DAY_START) / slotMinutes);
    }

    function indexToMinutes(idx) {
      return DAY_START + idx * slotMinutes;
    }

    function snapDuration(raw) {
      const numeric = Number.parseInt(raw, 10);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return BASE_SLOT_MINUTES;
      }
      const snapped =
        Math.ceil(Math.max(BASE_SLOT_MINUTES, numeric) / BASE_SLOT_MINUTES) * BASE_SLOT_MINUTES;
      return Math.max(BASE_SLOT_MINUTES, snapped);
    }

    function snapToGridStart(min) {
      if (!Number.isFinite(min)) {
        return DAY_START;
      }
      const clamped = Math.min(Math.max(min, DAY_START), DAY_END);
      const offset = clamped - DAY_START;
      const snapped = Math.floor(offset / BASE_SLOT_MINUTES) * BASE_SLOT_MINUTES;
      return DAY_START + snapped;
    }

    function formatTime(min) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function parseTimeToMinutes(value) {
      if (!value) {
        return null;
      }
      const [hh, mm] = value.split(':').map(part => Number.parseInt(part, 10));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
        return null;
      }
      return toMin(hh, mm);
    }

    function extractEntryId(href) {
      if (!href) {
        return null;
      }
      try {
        const parsed = new URL(href, location.origin);
        const rid =
          parsed.searchParams.get('rid') ||
          parsed.searchParams.get('id') ||
          parsed.searchParams.get('recordid');
        if (rid) {
          return rid;
        }
      } catch (err) {
        const match = href.match(/[?&](?:rid|recordid|id)=([^&]+)/i);
        if (match) {
          return match[1];
        }
      }
      return null;
    }

    function prepareCardHtml(card) {
      const clone = card.cloneNode(true);
      clone.removeAttribute('draggable');
      clone.removeAttribute('title');
      clone.classList.remove('sp-card');
      clone.querySelectorAll('.sp-morelink').forEach(el => el.remove());
      clone.querySelectorAll('.sp-btn').forEach(el => el.remove());
      clone.querySelectorAll('.sp-hidden-data, .sp-hidden').forEach(el => el.remove());
      return clone.innerHTML.trim();
    }

    function extractCardDetails(card) {
      const get = field => {
        const el = card.querySelector(`[data-field="${field}"]`);
        if (!el) {
          return '';
        }
        return (el.innerHTML || '').trim();
      };
      return {
        description: get('description'),
        reflection: get('reflection'),
        requirements: get('requirements'),
        materials: get('materials'),
        flow: get('flow'),
        risks: get('risks'),
        resources: get('materialsList'),
        objectives: get('objectives'),
        contact: get('contact')
      };
    }

    function cloneDetails(details = {}) {
      return {
        description: details.description || '',
        reflection: details.reflection || '',
        requirements: details.requirements || '',
        materials: details.materials || '',
        flow: details.flow || '',
        risks: details.risks || '',
        resources: details.resources || '',
        objectives: details.objectives || '',
        contact: details.contact || ''
      };
    }

    function hydratePlanDetailsFromLookup() {
      CONFIG.days.forEach(day => {
        const entries = plan.days[day] || [];
        entries.forEach(item => {
          if (!item || item.kind === 'break') {
            return;
          }
          item.details = cloneDetails(item.details);
          if (item.entryId && cardLookup[item.entryId] && cardLookup[item.entryId].details) {
            const lookup = cloneDetails(cardLookup[item.entryId].details);
            item.details = cloneDetails({ ...lookup, ...item.details });
          }
        });
      });
    }

    let plan = loadPlan();

    function defaultPlan() {
      const days = {};
      CONFIG.days.forEach(d => (days[d] = []));
      return { days };
    }

    function loadPlan() {
      try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        if (!raw) {
          return defaultPlan();
        }
        const data = JSON.parse(raw);
        if (!data || !data.days) {
          return defaultPlan();
        }
        CONFIG.days.forEach(day => {
          if (!Array.isArray(data.days[day])) {
            data.days[day] = [];
          }
          data.days[day] = data.days[day].map(item => {
            const next = Object.assign({}, item);
            if (!next.kind) {
              next.kind = 'method';
            }
            if (typeof next.startMin !== 'number' || typeof next.endMin !== 'number') {
              if (typeof next.start === 'number' && typeof next.end === 'number') {
                next.startMin = next.start;
                next.endMin = next.end;
              }
            }
            next.startMin = snapToGridStart(next.startMin);
            const snappedDuration = snapDuration(next.endMin - next.startMin);
            let snappedEnd = next.startMin + snappedDuration;
            if (snappedEnd > DAY_END) {
              snappedEnd = DAY_END;
              next.startMin = snapToGridStart(snappedEnd - snappedDuration);
            }
            let ensuredEnd = Math.max(next.startMin + BASE_SLOT_MINUTES, snappedEnd);
          if (ensuredEnd > DAY_END) {
            ensuredEnd = DAY_END;
            next.startMin = snapToGridStart(ensuredEnd - BASE_SLOT_MINUTES);
          }
          next.endMin = ensuredEnd;
          next.details = cloneDetails(next.details);
          return next;
        });
      });
      return data;
      } catch (e) {
        return defaultPlan();
      }
    }

    function savePlan() {
      hydratePlanDetailsFromLookup();
      renderOverlays();
      renderPrintList();
      renderPrintTable();
      updateSums();
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(plan));
    }

    function loadMeta() {
      try {
        const raw = localStorage.getItem(CONFIG.metaKey);
        if (!raw) {
          return {};
        }
        return JSON.parse(raw) || {};
      } catch (e) {
        return {};
      }
    }

    function saveMeta(meta) {
      localStorage.setItem(CONFIG.metaKey, JSON.stringify(meta));
      updatePrintHeader(meta);
    }

    function updatePrintHeader(meta) {
      if ($phTitle) {
        $phTitle.textContent = meta.title || '—';
      }
      if ($phDate) {
        $phDate.textContent = meta.date || '—';
      }
      if ($phNumber) {
        $phNumber.textContent = meta.number || '—';
      }
      if ($phContact) {
        $phContact.textContent = meta.contact || '—';
      }
      if ($printTitle) {
        const parts = [];
        if (meta.title) {
          parts.push(meta.title);
        }
        if (meta.date) {
          parts.push(meta.date);
        }
        if (meta.number) {
          parts.push(`Nr. ${meta.number}`);
        }
        if (meta.contact) {
          parts.push(meta.contact);
        }
        $printTitle.textContent = parts.length ? parts.join(' · ') : defaultPrintTitle;
      }
    }

    function bindMetaInputs() {
      const meta = Object.assign({}, { title: '', date: '', number: '', contact: '' }, loadMeta());
      if ($metaTitle) {
        $metaTitle.value = meta.title;
      }
      if ($metaDate) {
        $metaDate.value = meta.date;
      }
      if ($metaNumber) {
        $metaNumber.value = meta.number;
      }
      if ($metaContact) {
        $metaContact.value = meta.contact;
      }
      updatePrintHeader(meta);

      const handler = () => {
        const current = {
          title: $metaTitle ? $metaTitle.value.trim() : '',
          date: $metaDate ? $metaDate.value.trim() : '',
          number: $metaNumber ? $metaNumber.value.trim() : '',
          contact: $metaContact ? $metaContact.value.trim() : ''
        };
        saveMeta(current);
      };
      [$metaTitle, $metaDate, $metaNumber, $metaContact].forEach(el => {
        if (el) {
          el.addEventListener('input', handler);
        }
      });
    }

    function withinBounds(s, e) {
      return s >= DAY_START && e <= DAY_END;
    }

    function overlaps(a, b) {
      return a.startMin < b.endMin && b.startMin < a.endMin;
    }

    function hasCollision(list, cand) {
      return (list || []).some(x => overlaps(x, cand));
    }

    function randomId() {
      return 'id-' + Math.random().toString(36).slice(2);
    }

    function onDrop(e, col, slotIndex) {
      e.preventDefault();
      const day = col.getAttribute('data-day');
      if (!plan.days[day]) {
        plan.days[day] = [];
      }
      const payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');

      const startMin = indexToMinutes(slotIndex);

      if (payload.type === 'move') {
        const items = plan.days[payload.day] || [];
        const moving = items.find(x => x.uid === payload.uid);
        if (!moving) {
          return;
        }
        const duration = snapDuration(moving.endMin - moving.startMin);
        const candidate = { ...moving, startMin, endMin: startMin + duration };
        if (!withinBounds(candidate.startMin, candidate.endMin)) {
          return warn('Außerhalb des Rasters (08:00–22:00).');
        }
        const targetList =
          day === payload.day ? items.filter(x => x.uid !== payload.uid) : plan.days[day] || [];
        if (hasCollision(targetList, candidate)) {
          return warn('Zeitüberschneidung im Zieltag.');
        }
        plan.days[payload.day] = items.filter(x => x.uid !== payload.uid);
        plan.days[day].push(candidate);
        savePlan();
        clearWarn();
        return;
      }

      if (payload.type === 'method') {
        const duration = snapDuration(payload.duration);
        const endMin = startMin + duration;
        if (!withinBounds(startMin, endMin)) {
          return warn('Dauer überschreitet das Tagesraster (08:00–22:00).');
        }
        let payloadDetails = {};
        if (payload.details) {
          if (typeof payload.details === 'string') {
            try {
              payloadDetails = JSON.parse(payload.details);
            } catch (err) {
              payloadDetails = {};
            }
          } else if (typeof payload.details === 'object') {
            payloadDetails = payload.details;
          }
        }
        if ((!payloadDetails.description || !payloadDetails.reflection) && payload.entryId) {
          const lookupDetails = cardLookup[payload.entryId]?.details;
          if (lookupDetails) {
            payloadDetails = { ...lookupDetails, ...payloadDetails };
          }
        }
        const item = {
          uid: randomId(),
          title: payload.title,
          startMin,
          endMin,
          kind: 'method',
          cardHtml: payload.cardHtml || '',
          entryId: payload.entryId || null,
          details: cloneDetails(payloadDetails)
        };
        if (hasCollision(plan.days[day], item)) {
          return warn('Zeitüberschneidung in ' + day + '.');
        }
        plan.days[day].push(item);
        savePlan();
        clearWarn();
      }
    }

    function addBreakInteractive() {
      openBreakModal();
    }

    function handleBreakFormSubmit(event) {
      event.preventDefault();
      const selectedDay = breakDayField.value;
      if (!CONFIG.days.includes(selectedDay || '')) {
        warn('Ungültiger Tag.');
        return;
      }
      const startValue = parseTimeToMinutes(breakStartField.value);
      if (!Number.isFinite(startValue)) {
        warn('Bitte eine gültige Startzeit wählen.');
        return;
      }
      const durationValue = Number.parseInt(breakDurationField.value, 10);
      const duration = snapDuration(durationValue);
      if (!duration) {
        warn(`Bitte eine sinnvolle Dauer angeben (>=${BASE_SLOT_MINUTES}).`);
        return;
      }
      const startMin = snapToGridStart(startValue);
      const endMin = startMin + duration;
      if (!withinBounds(startMin, endMin)) {
        warn('Außerhalb des Rasters (08:00–22:00).');
        return;
      }
      if (!plan.days[selectedDay]) {
        plan.days[selectedDay] = [];
      }
      const candidate = {
        uid: randomId(),
        title: 'Pause',
        startMin,
        endMin,
        kind: 'break',
        cardHtml: `<p class="sp-print-card__text"><strong>Pause</strong> – ${duration} Min</p>`,
        entryId: null
      };
      if (hasCollision(plan.days[selectedDay], candidate)) {
        warn('Überschneidung mit bestehender Einheit.');
        return;
      }
      plan.days[selectedDay].push(candidate);
      savePlan();
      clearWarn();
      closeBreakModal();
    }

    function warn(text) {
      if (msg) {
        msg.textContent = text;
      }
    }

    function clearWarn() {
      if (msg) {
        msg.textContent = '';
      }
    }

    function renderOverlays() {
      const allDays = CONFIG.days;
      allDays.forEach(day => {
        const overlay = document.querySelector(`[data-overlay="${day}"]`);
        const items = (plan.days[day] || []).slice().sort((a, b) => a.startMin - b.startMin);
        if (!overlay) {
          return;
        }
        overlay.innerHTML = '';
        overlay.style.setProperty('--rows', slotsPerDay);
        overlay.style.setProperty('--slot-height', slotPx + 'px');
        const level = ZOOM_LEVELS[zoomIndex];
        const placeholderThreshold = level.slotMinutes;
        const placeholderMode = level.slotMinutes >= 30;
        items.forEach(it => {
          let startIdx = minutesToIndex(it.startMin) + 1;
          let endIdx = minutesToIndex(it.endMin) + 1;
          if (endIdx <= startIdx) {
            endIdx = startIdx + 1;
          }
          const div = document.createElement('div');
          const durationMinutes = Math.max(BASE_SLOT_MINUTES, it.endMin - it.startMin);
          const isShort = durationMinutes <= slotMinutes * 2;
          const isPlaceholder = isShort || (placeholderMode && durationMinutes < placeholderThreshold);
          div.className =
            'sp-item' +
            (it.kind === 'break' ? ' sp-item--break' : '') +
            (isPlaceholder ? ' sp-item--placeholder' : '');
          div.style.gridRow = `${startIdx} / ${endIdx}`;
          div.style.gridColumn = '1 / -1';
          div.draggable = true;
          div.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'move', day, uid: it.uid }));
          });
          const adjustButtons =
            it.kind !== 'break'
              ? `<button type="button" class="sp-btn" data-act="shorten" data-uid="${it.uid}" title="Dauer um ${BASE_SLOT_MINUTES} Minuten verkürzen">−${BASE_SLOT_MINUTES}</button>` +
                `<button type="button" class="sp-btn" data-act="extend" data-uid="${it.uid}" title="Dauer um ${BASE_SLOT_MINUTES} Minuten verlängern">+${BASE_SLOT_MINUTES}</button>`
              : '';
          const actions = `
          <div class="sp-item-actions" role="group" aria-label="Aktionen">
            ${adjustButtons}
            <button type="button" class="sp-btn" data-act="delete" data-uid="${it.uid}" title="Eintrag vom Plan entfernen">Löschen</button>
          </div>`;
          if (isPlaceholder) {
            div.innerHTML = `
          <div class="sp-item-placeholder" title="${escapeHtml(it.title)}">
            <span class="sp-placeholder-dot" aria-hidden="true"></span>
            <span class="sp-placeholder-title">${escapeHtml(it.title)}</span>
            <span class="sp-placeholder-meta">${label(it.startMin)} · ${durationMinutes} Min${
              it.kind === 'break' ? ' · Pause' : ''
            }</span>
          </div>
          ${actions}`;
          } else {
            div.innerHTML = `
          <div class="sp-item-content">
            <div class="sp-title">${escapeHtml(it.title)}</div>
            <div class="sp-meta">${label(it.startMin)}–${label(it.endMin)} · ${durationMinutes} Min</div>
          </div>
          ${actions}`;
          }
          overlay.appendChild(div);
        });
      });
    }

    function renderPrintList() {
      if (!printList) {
        return;
      }
      const frag = document.createDocumentFragment();
      const activeDays = CONFIG.days.filter(day =>
        (plan.days[day] || []).some(entry => entry && entry.kind !== 'break')
      );
      activeDays.forEach(day => {
        const methods = (plan.days[day] || [])
          .filter(item => item && item.kind !== 'break')
          .slice()
          .sort((a, b) => a.startMin - b.startMin);
        if (!methods.length) {
          return;
        }

        const daySection = document.createElement('section');
        daySection.className = 'sp-print-day';

        const heading = document.createElement('h2');
        heading.className = 'sp-print-day__title';
        heading.textContent = day;
        daySection.appendChild(heading);

        methods.forEach(item => {
          const duration = Math.max(BASE_SLOT_MINUTES, item.endMin - item.startMin);
          const details = getItemDetails(item);
          const card = document.createElement('article');
          card.className = 'sp-print-card';

          const header = document.createElement('header');
          header.className = 'sp-print-card__header';
          header.innerHTML = `
            <div class="sp-print-card__heading">
              <h3 class="sp-print-card__name">${escapeHtml(item.title)}</h3>
              <div class="sp-print-card__time">${label(item.startMin)}–${label(item.endMin)} · ${duration} Min</div>
            </div>`;
          card.appendChild(header);

          const body = document.createElement('div');
          body.className = 'sp-print-card__body';

          appendPrintSection(body, 'Kurzbeschreibung', details.description);
          appendPrintSection(body, 'Ablauf', details.flow);
          appendPrintSection(body, 'Reflexion', details.reflection);
          appendPrintSection(body, 'Raumanforderungen &amp; Material/Technik', combineRequirements(details));
          appendPrintSection(body, 'Materialien', details.resources);
          appendPrintSection(body, 'Risiken & Tipps', details.risks);
          appendPrintSection(body, 'Lernziele', details.objectives);
          appendPrintSection(body, 'Kontakt', details.contact);

          if (body.children.length) {
            card.appendChild(body);
          }

          daySection.appendChild(card);
        });

        frag.appendChild(daySection);
      });
      printList.innerHTML = '';
      printList.appendChild(frag);
      printList.setAttribute('aria-hidden', printList.childElementCount ? 'false' : 'true');
    }

    function formatTableCellText(text) {
      const html = normalizeContent(text);
      return html || '—';
    }

    function normalizeContent(value) {
      if (!value) {
        return '';
      }
      const raw = typeof value === 'string' ? value : String(value);
      const trimmed = raw.trim();
      if (!trimmed) {
        return '';
      }
      if (/[<>]/.test(trimmed)) {
        return trimmed;
      }
      return trimmed.replace(/\r?\n/g, '<br>');
    }

    function appendPrintSection(container, label, value) {
      const html = normalizeContent(value);
      if (!html) {
        return;
      }
      const section = document.createElement('section');
      section.className = 'sp-print-card__section';
      section.innerHTML = `<h3>${label}</h3><div>${html}</div>`;
      container.appendChild(section);
    }

    function combineRequirements(details) {
      const segments = [];
      if (details.requirements && details.requirements.trim()) {
        segments.push(details.requirements.trim());
      }
      if (details.materials && details.materials.trim()) {
        segments.push(details.materials.trim());
      }
      if (details.resources && details.resources.trim()) {
        segments.push(details.resources.trim());
      }
      return segments.join('<br><br>');
    }

    function getItemDetails(item) {
      if (item.details && typeof item.details === 'object') {
        return item.details;
      }
      let sourceDetails = null;
      if (item.entryId && cardLookup[item.entryId] && cardLookup[item.entryId].details) {
        sourceDetails = cloneDetails(cardLookup[item.entryId].details);
      } else if (item.details && typeof item.details === 'string') {
        try {
          sourceDetails = cloneDetails(JSON.parse(item.details));
        } catch (err) {
          sourceDetails = cloneDetails();
        }
      } else {
        sourceDetails = cloneDetails();
      }
      item.details = sourceDetails;
      return sourceDetails;
    }

    function renderPrintTable() {
      if (!printTable) {
        return;
      }
      const frag = document.createDocumentFragment();
      const activeDays = CONFIG.days.filter(day =>
        (plan.days[day] || []).some(entry => entry && entry.kind !== 'break')
      );
      activeDays.forEach(day => {
        const methods = (plan.days[day] || [])
          .filter(entry => entry && entry.kind !== 'break')
          .slice()
          .sort((a, b) => a.startMin - b.startMin);
        if (!methods.length) {
          return;
        }
        const section = document.createElement('section');
        section.className = 'sp-table-day';
        const heading = document.createElement('h2');
        heading.className = 'sp-table-day__title';
        heading.textContent = day;
        section.appendChild(heading);

        const table = document.createElement('table');
        table.className = 'sp-table';
        const thead = document.createElement('thead');
        thead.innerHTML = `
          <tr>
            <th>Uhrzeit</th>
            <th>Kurzbeschreibung</th>
            <th>Reflexion</th>
            <th>Raumanforderungen &amp; Material/Technik</th>
          </tr>`;
        table.appendChild(thead);
        const tbody = document.createElement('tbody');

        methods.forEach(item => {
          const details = getItemDetails(item);
          const row = document.createElement('tr');

          const timeCell = document.createElement('td');
          timeCell.textContent = `${label(item.startMin)} – ${label(item.endMin)}`;
          row.appendChild(timeCell);

          const descCell = document.createElement('td');
          descCell.innerHTML = formatTableCellText(details.description);
          row.appendChild(descCell);

          const reflectionCell = document.createElement('td');
          reflectionCell.innerHTML = formatTableCellText(details.reflection);
          row.appendChild(reflectionCell);

          const requirementsCell = document.createElement('td');
          requirementsCell.innerHTML = formatTableCellText(combineRequirements(details));
          row.appendChild(requirementsCell);

          tbody.appendChild(row);
        });

        table.appendChild(tbody);
        section.appendChild(table);
        frag.appendChild(section);
      });

      printTable.innerHTML = '';
      printTable.appendChild(frag);
      printTable.setAttribute('aria-hidden', printTable.childElementCount ? 'false' : 'true');
    }

    function updateSums() {
      CONFIG.days.forEach(day => {
        const sum = (plan.days[day] || []).reduce((a, b) => a + (b.endMin - b.startMin), 0);
        const el = document.querySelector(`[data-sum="${day}"]`);
        if (el) {
          el.textContent = Math.floor(sum / 60) + ' Std ' + (sum % 60) + ' Min';
        }
      });
    }

    const exportBtn = document.getElementById('sp-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const payload = {
          version: 1,
          raster: { slotMinutes, day: { start: DAY_START, end: DAY_END } },
          plan
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'seminarplan.json';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    const importInput = document.getElementById('sp-import');
    if (importInput) {
      importInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (!f) {
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            if (!data.plan || !data.plan.days) {
              throw new Error('Ungültiges Format');
            }
            plan = data.plan;
            savePlan();
          } catch (err) {
            warn('Import fehlgeschlagen: ' + err.message);
          }
        };
        reader.readAsText(f);
      });
    }

    const clearBtn = document.getElementById('sp-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Gesamten Plan löschen?')) {
          plan = defaultPlan();
          savePlan();
        }
      });
    }

    const printBtn = document.getElementById('sp-print');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    const addBreakBtn = document.getElementById('sp-addbreak');
    if (addBreakBtn) {
      addBreakBtn.addEventListener('click', addBreakInteractive);
    }

    if (breakForm) {
      breakForm.addEventListener('submit', handleBreakFormSubmit);
    }

   modal.addEventListener('click', event => {
     if (event.target && event.target.getAttribute('data-modal-close') === '1') {
       event.preventDefault();
       closeBreakModal();
     }
   });

    modal.addEventListener('submit', event => {
      if (event.target && event.target.id === 'sp-break-form') {
        handleBreakFormSubmit(event);
      }
    });

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => changeZoom(-1));
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => changeZoom(1));
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, s => {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[s];
      });
    }

    const docClickHandler = e => {
      const btn = e.target.closest('button.sp-btn');
      if (!btn) {
        return;
      }
      const act = btn.getAttribute('data-act');
      if (!act) {
        return;
      }
      const uid = btn.getAttribute('data-uid');
      const day = CONFIG.days.find(d => (plan.days[d] || []).some(x => x.uid === uid));
      if (!day) {
        return;
      }
      const list = plan.days[day];
      const idx = list.findIndex(x => x.uid === uid);
      if (idx < 0) {
        return;
      }
      const it = list[idx];

      if (act === 'delete') {
        list.splice(idx, 1);
        savePlan();
        return;
      }

      if (it.kind === 'break') {
        return;
      }

      if (act === 'extend' || act === 'shorten') {
        const delta = act === 'extend' ? BASE_SLOT_MINUTES : -BASE_SLOT_MINUTES;
        const dur = it.endMin - it.startMin + delta;
        if (dur < BASE_SLOT_MINUTES) {
          return warn(`Mindestdauer ${BASE_SLOT_MINUTES} Minuten.`);
        }
        const candidate = { ...it, endMin: it.startMin + dur };
        if (!withinBounds(candidate.startMin, candidate.endMin)) {
          return warn('Grenze des Tagesrasters erreicht.');
        }
        if (hasCollision(list.filter(x => x.uid !== it.uid), candidate)) {
          return warn('Überschneidung bei Anpassung.');
        }
        list[idx] = candidate;
        savePlan();
        clearWarn();
      }
    };

    document.addEventListener('click', docClickHandler);

    loadZoomPreference();
    refreshLayout();
    bindMetaInputs();
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(plan));
  }

  window.initSeminarplaner = initSeminarplaner;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeminarplaner);
  } else {
    initSeminarplaner();
  }
})();
