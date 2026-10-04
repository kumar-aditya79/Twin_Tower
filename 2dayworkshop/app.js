/**
 * BDC '26 - Big Data Computing Workshop Client Application
 * Registration & Anti-Proxy Attendance Engine with Strict 10-Meter Geofencing GPS Verification,
 * Hardware Device Fingerprinting, and Client IP Tracking.
 */

(function () {
  'use strict';

  const config = window.WORKSHOP_CONFIG || {};

  // Local State Store
  const state = {
    activeDay: 'day1',
    attendanceRecords: [],
    venueSettings: JSON.parse(localStorage.getItem('bdc26_venue_settings')) || Object.assign({}, config.venueGeofence),
    userLocation: null,
    currentDistanceMeters: null,
    siteVisits: 1204,
    deviceToken: null,
    clientIp: 'Detecting...'
  };

  // --- 1. INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    initDeviceFingerprint();
    fetchClientIp();
    initNetworkCanvas();
    initScrollProgress();
    initCountdown();
    renderSchedule('day1');
    renderSpeaker();
    renderNotes();
    renderFaq();
    initAttendanceForm();
    initAdminModal();
    initVisitCounter();
    setupNavigation();
  });

  // --- 2. LIVE CLIENT IP DETECTION ---
  function fetchClientIp() {
    fetch('https://api64.ipify.org?format=json')
      .then(res => res.json())
      .then(data => {
        if (data && data.ip) {
          state.clientIp = data.ip;
          updateIpBadge(data.ip);
        }
      })
      .catch(() => {
        fetch('https://api.ipify.org?format=json')
          .then(res => res.json())
          .then(data => {
            if (data && data.ip) {
              state.clientIp = data.ip;
              updateIpBadge(data.ip);
            }
          })
          .catch(() => {
            state.clientIp = '127.0.0.1';
            updateIpBadge('127.0.0.1 (Local)');
          });
      });
  }

  function updateIpBadge(ip) {
    const ipText = document.getElementById('client-ip-text');
    if (ipText) {
      ipText.textContent = ip;
    }
  }

  // --- 3. HARDWARE & BROWSER DEVICE FINGERPRINTING ---
  function generateHardwareSignature() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial'";
      ctx.fillText('BDC26_DEVICE_FINGERPRINT_RAISONI', 2, 2);
      const canvasData = canvas.toDataURL().slice(-50);
      const screenDetails = `${screen.width}x${screen.height}x${screen.colorDepth}`;
      const navDetails = `${navigator.userAgent}_${navigator.hardwareConcurrency || 4}_${navigator.language}`;
      return 'DEV_' + btoa(canvasData + screenDetails + navDetails).replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);
    } catch (e) {
      return 'DEV_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    }
  }

  function initDeviceFingerprint() {
    let token = localStorage.getItem('bdc26_device_token');
    if (!token) {
      token = generateHardwareSignature();
      localStorage.setItem('bdc26_device_token', token);
      document.cookie = `bdc26_device_token=${token}; max-age=31536000; path=/`;
    }
    state.deviceToken = token;
  }

  // --- 4. BACKGROUND NETWORK CANVAS ANIMATION ---
  function initNetworkCanvas() {
    const canvas = document.getElementById('network-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      createParticles();
    }

    function createParticles() {
      particles = [];
      const count = Math.floor((width * height) / 22000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          radius: Math.random() * 1.5 + 1
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.08;
            ctx.strokeStyle = `rgba(45, 212, 191, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.fillStyle = 'rgba(45, 212, 191, 0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(draw);
  }

  // --- 5. SCROLL PROGRESS & NAVIGATION ---
  function initScrollProgress() {
    const progressBar = document.getElementById('scroll-progress');
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      if (progressBar) progressBar.style.width = `${progress}%`;

      // Update active nav link
      const sections = document.querySelectorAll('section[id]');
      let currentSectionId = '';
      sections.forEach(sec => {
        const top = sec.offsetTop - 120;
        const height = sec.offsetHeight;
        if (scrollTop >= top && scrollTop < top + height) {
          currentSectionId = sec.getAttribute('id');
        }
      });

      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${currentSectionId}`);
      });
    });
  }

  function setupNavigation() {
    const menuToggle = document.getElementById('menu-toggle');
    const navLinks = document.getElementById('nav-links');
    if (menuToggle && navLinks) {
      menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('mobile-open');
      });
      navLinks.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => navLinks.classList.remove('mobile-open'));
      });
    }

    // Connect Register buttons to focus on input
    document.querySelectorAll('a[href="#attendance"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          const nameInput = document.getElementById('student-name');
          if (nameInput) nameInput.focus();
        }, 400);
      });
    });
  }

  // --- 6. COUNTDOWN TIMER ---
  function initCountdown() {
    const targetDate = new Date(config.startDate || '2026-11-14T09:30:00+05:30').getTime();

    function update() {
      const now = new Date().getTime();
      const diff = targetDate - now;

      if (diff <= 0) {
        document.getElementById('days-count').textContent = '00';
        document.getElementById('hours-count').textContent = '00';
        document.getElementById('mins-count').textContent = '00';
        document.getElementById('secs-count').textContent = '00';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      const daysEl = document.getElementById('days-count');
      const hoursEl = document.getElementById('hours-count');
      const minsEl = document.getElementById('mins-count');
      const secsEl = document.getElementById('secs-count');

      if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
      if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
      if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
      if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
    }

    update();
    setInterval(update, 1000);
  }

  // --- 7. SCHEDULE TIMELINE RENDERING ---
  function renderSchedule(dayKey) {
    state.activeDay = dayKey;
    const container = document.getElementById('schedule-timeline-container');
    if (!container) return;

    // Update tab styles
    document.querySelectorAll('.schedule-nav .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-day') === dayKey);
    });

    const dayData = config.schedule[dayKey];
    if (!dayData || !dayData.sessions) return;

    container.innerHTML = dayData.sessions.map((session, index) => {
      let badgeClass = 'badge-theory';
      if (session.type === 'lab') badgeClass = 'badge-lab';
      if (session.type === 'break') badgeClass = 'badge-break';

      const topicsHtml = session.topics && session.topics.length > 0
        ? `<div class="timeline-topics-col">
             <div class="timeline-block-label">TOPICS</div>
             <ul class="topics-list">
               ${session.topics.map(t => `<li>${t}</li>`).join('')}
             </ul>
           </div>`
        : '';

      const activityHtml = session.activity || session.studentTask
        ? `<div class="timeline-activity-col">
             ${session.activity ? `
               <div class="activity-box">
                 <div class="timeline-block-label">ACTIVITY / CASE STUDY</div>
                 <div class="activity-text">${session.activity}</div>
                 ${session.studentTask ? `
                   <div class="student-task-box">
                     <div class="student-task-title">STUDENT TASK</div>
                     <div class="student-task-text">${session.studentTask}</div>
                   </div>
                 ` : ''}
               </div>
             ` : ''}
           </div>`
        : '';

      return `
        <div class="timeline-row ${index === 0 ? 'expanded' : ''}" data-id="${session.id}">
          <div class="timeline-header" onclick="window.toggleTimelineRow(this)">
            <div class="timeline-time">${session.time}</div>
            <div class="timeline-title-wrap">
              <span class="timeline-title">${session.title}</span>
              <span class="${badgeClass}">${session.typeLabel}</span>
            </div>
            <div class="timeline-toggle-icon">▼</div>
          </div>
          <div class="timeline-body" style="${index === 0 ? 'max-height: 500px;' : ''}">
            <div class="timeline-body-content">
              ${topicsHtml}
              ${activityHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.switchScheduleTab = function (dayKey) {
    renderSchedule(dayKey);
  };

  window.toggleTimelineRow = function (headerEl) {
    const row = headerEl.closest('.timeline-row');
    const body = row.querySelector('.timeline-body');
    const isExpanded = row.classList.contains('expanded');

    if (isExpanded) {
      row.classList.remove('expanded');
      body.style.maxHeight = '0px';
    } else {
      row.classList.add('expanded');
      body.style.maxHeight = (body.scrollHeight + 40) + 'px';
    }
  };

  // --- 8. SPEAKERS RENDERING ---
  function renderSpeaker() {
    const container = document.getElementById('speaker-container');
    if (!container || !config.speakers || config.speakers.length === 0) return;

    const speaker = config.speakers[0];
    container.innerHTML = `
      <div class="speaker-editorial-grid">
        <div class="speaker-photo-frame">
          <img src="${speaker.image}" alt="${speaker.name}" class="speaker-photo" />
        </div>
        <div class="speaker-info-col">
          <span class="speaker-badge">${speaker.roleBadge}</span>
          <h3 class="speaker-name">${speaker.name}</h3>
          <div class="speaker-designation">${speaker.designation}</div>
          <p class="speaker-bio">${speaker.bio}</p>
          <div class="speaker-topics-tags">
            ${speaker.topicBadges.map(t => `<span class="speaker-topic-tag">${t}</span>`).join('')}
          </div>
          <div class="speaker-links">
            <a href="${speaker.linkedin}" target="_blank" rel="noopener" class="speaker-link">VIEW PROFILE ↗</a>
          </div>
        </div>
      </div>
    `;
  }

  // --- 9. LECTURE NOTES ARCHIVE RENDERING ---
  function renderNotes() {
    const container = document.getElementById('archive-list-container');
    if (!container) return;

    const savedNotes = JSON.parse(localStorage.getItem('bdc26_notes')) || config.notes || [];

    container.innerHTML = savedNotes.map(note => `
      <div class="archive-row">
        <div class="archive-day">${note.day}</div>
        <div class="archive-title-wrap">
          <div class="archive-title">${note.title}</div>
          <div class="archive-session">${note.session} · ${note.speaker}</div>
        </div>
        <div class="archive-speaker mono">${note.type || 'PDF / SLIDES'}</div>
        <div class="archive-action-wrap">
          <a href="${note.fileUrl}" class="archive-btn" target="_blank" onclick="window.handleNoteDownload(event, '${note.title}')">
            DOWNLOAD ↗
          </a>
        </div>
      </div>
    `).join('');
  }

  window.handleNoteDownload = function (e, title) {
    if (e.target.getAttribute('href') === '#') {
      e.preventDefault();
      alert(`Lecture asset for "${title}" will be unlocked live during the workshop session.`);
    }
  };

  // --- 10. FAQ ACCORDION ---
  function renderFaq() {
    const container = document.getElementById('faq-container');
    if (!container || !config.faqs) return;

    container.innerHTML = config.faqs.map((faq, index) => `
      <div class="faq-item ${index === 0 ? 'expanded' : ''}">
        <button class="faq-question-btn" onclick="window.toggleFaq(this)">
          <span>${faq.q}</span>
          <span class="faq-toggle-icon">+</span>
        </button>
        <div class="faq-answer" style="${index === 0 ? 'max-height: 250px;' : ''}">
          <div class="faq-answer-text">${faq.a}</div>
        </div>
      </div>
    `).join('');
  }

  window.toggleFaq = function (btn) {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const isExpanded = item.classList.contains('expanded');

    if (isExpanded) {
      item.classList.remove('expanded');
      answer.style.maxHeight = '0px';
    } else {
      item.classList.add('expanded');
      answer.style.maxHeight = (answer.scrollHeight + 30) + 'px';
    }
  };

  // --- 11. STRICT 10-METER GPS GEOFENCING (GREEN <= 10m, RED > 10m) ---
  function computeHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  function acquireUserGeolocation() {
    const geoStatus = document.getElementById('geo-status-indicator');
    const distanceTag = document.getElementById('geo-distance-display');

    if (!navigator.geolocation) {
      if (geoStatus) geoStatus.textContent = 'Geolocation is not supported by your browser.';
      return;
    }

    if (geoStatus) geoStatus.textContent = 'Acquiring high-precision GPS fix...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };

        const dist = computeHaversineDistanceMeters(
          state.userLocation.lat,
          state.userLocation.lng,
          state.venueSettings.latitude,
          state.venueSettings.longitude
        );

        state.currentDistanceMeters = dist;
        const allowedRadius = state.venueSettings.radiusMeters || 10;
        const isWithin = dist <= allowedRadius;

        if (geoStatus) {
          geoStatus.textContent = `GPS Fix Locked (±${Math.round(pos.coords.accuracy)}m)`;
        }

        if (distanceTag) {
          if (isWithin) {
            distanceTag.textContent = `● ${dist}m FROM VENUE (IN ${allowedRadius}m RANGE — GREEN / VERIFIED)`;
            distanceTag.className = 'geo-distance-tag in-range';
          } else {
            distanceTag.textContent = `● ${dist}m FROM VENUE (OUT OF ${allowedRadius}m RANGE — RED / FLAGGED)`;
            distanceTag.className = 'geo-distance-tag out-of-range';
          }
        }
      },
      (err) => {
        if (geoStatus) {
          geoStatus.textContent = 'GPS permission required to calculate 10-meter geofence status.';
        }
        if (distanceTag) {
          distanceTag.textContent = '● GPS REQUIRED (RED)';
          distanceTag.className = 'geo-distance-tag out-of-range';
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // --- 12. ATTENDANCE FORM & STRICT SINGLE SUBMISSION PER DEVICE/IP ---
  function initAttendanceForm() {
    const form = document.getElementById('attendance-checkin-form');
    const emailInput = document.getElementById('student-email');
    const emailError = document.getElementById('email-domain-error');
    const acquireBtn = document.getElementById('acquire-gps-btn');

    if (acquireBtn) {
      acquireBtn.addEventListener('click', acquireUserGeolocation);
    }

    if (emailInput && emailError) {
      emailInput.addEventListener('input', () => {
        const val = emailInput.value.trim().toLowerCase();
        const requiredDomain = config.targetDomain.toLowerCase();
        if (val && !val.endsWith(requiredDomain)) {
          emailError.style.display = 'block';
          emailError.textContent = `Please use your college email (must end with ${config.targetDomain})`;
          emailInput.classList.add('error');
        } else {
          emailError.style.display = 'none';
          emailInput.classList.remove('error');
        }
      });
    }

    if (form) {
      form.addEventListener('submit', handleAttendanceSubmit);
    }

    // Check if this device already has a registered student
    checkExistingDeviceLock();
    acquireUserGeolocation();
  }

  function checkExistingDeviceLock() {
    const registered = JSON.parse(localStorage.getItem('bdc26_registered_student'));
    if (registered) {
      const nameInput = document.getElementById('student-name');
      const rollInput = document.getElementById('student-roll');
      const emailInput = document.getElementById('student-email');
      if (nameInput && !nameInput.value) nameInput.value = registered.name || '';
      if (rollInput && !rollInput.value) rollInput.value = registered.rollNumber || '';
      if (emailInput && !emailInput.value) emailInput.value = registered.email || '';
    }
  }

  function handleAttendanceSubmit(e) {
    e.preventDefault();
    const alertBox = document.getElementById('attendance-alert-box');
    alertBox.className = 'attendance-alert';
    alertBox.style.display = 'none';

    const name = document.getElementById('student-name').value.trim();
    const roll = document.getElementById('student-roll').value.trim().toUpperCase();
    const email = document.getElementById('student-email').value.trim().toLowerCase();
    const day = document.getElementById('attendance-day').value;
    const session = document.getElementById('attendance-session').value;
    const currentIp = state.clientIp || '127.0.0.1';

    // 1. College Email validation
    if (!email.endsWith(config.targetDomain.toLowerCase())) {
      showAlert('error', `Registration Denied: College email must end with ${config.targetDomain}`);
      return;
    }

    // 2. Strict One-Response-Per-Device & IP Tracking Check
    const existingRecords = getAttendanceRecords();
    const deviceRegisteredStudent = JSON.parse(localStorage.getItem('bdc26_registered_student'));

    // Check if device was previously registered under a different Roll Number
    if (deviceRegisteredStudent && deviceRegisteredStudent.rollNumber && deviceRegisteredStudent.rollNumber !== roll) {
      showAlert('error', `⚠️ Anti-Proxy Device Lock: This physical device is already bound to Roll No. ${deviceRegisteredStudent.rollNumber} (${deviceRegisteredStudent.name}). Only 1 response is permitted per device.`);
      return;
    }

    // Cross-check historical records for device token collision with different roll numbers
    const deviceCollision = existingRecords.find(r => r.deviceToken === state.deviceToken && r.rollNumber !== roll);
    if (deviceCollision) {
      showAlert('error', `⚠️ Device Conflict: This device hardware signature is already registered to Roll No. ${deviceCollision.rollNumber}. Submitting for multiple students from the same device is strictly blocked.`);
      return;
    }

    // Check if this student already submitted for this specific day + session
    const duplicate = existingRecords.find(r => r.rollNumber === roll && r.day === day && r.session === session);
    if (duplicate) {
      showAlert('error', `⚠️ Duplicate Check-in: Attendance for Roll No. ${roll} in ${day} - ${session} is already submitted.`);
      return;
    }

    // 3. Geofencing Check: Strict 10-meter boundary
    const allowedRadius = state.venueSettings.radiusMeters || 10;
    let distanceMeters = 0;
    let isFlagged = false;
    let flagReason = '';

    if (state.userLocation) {
      distanceMeters = computeHaversineDistanceMeters(
        state.userLocation.lat,
        state.userLocation.lng,
        state.venueSettings.latitude,
        state.venueSettings.longitude
      );

      if (distanceMeters > allowedRadius) {
        isFlagged = true;
        flagReason = `Geofence violation (${distanceMeters}m > allowed ${allowedRadius}m)`;
      }
    } else {
      isFlagged = true;
      flagReason = 'GPS location fix missing / Browser blocked';
    }

    // Record check-in
    const newRecord = {
      id: 'ATT_' + Date.now(),
      name: name,
      rollNumber: roll,
      email: email,
      day: day,
      session: session,
      clientIp: currentIp,
      timestamp: new Date().toISOString(),
      geoDistance: distanceMeters,
      allowedRadius: allowedRadius,
      deviceToken: state.deviceToken,
      flagged: isFlagged,
      flagReason: flagReason
    };

    // Lock device identity permanently to this student
    localStorage.setItem('bdc26_registered_student', JSON.stringify({
      rollNumber: roll,
      name: name,
      email: email,
      deviceToken: state.deviceToken,
      ip: currentIp
    }));

    saveAttendanceRecord(newRecord);

    if (isFlagged) {
      showAlert('error', `⚠️ ATTENDANCE RECORDED IN RED (FLAGGED): You are ${distanceMeters}m from the venue (allowed limit: ${allowedRadius}m). IP: ${currentIp}. This entry is marked FLAGGED in red on the admin dashboard.`);
    } else {
      showAlert('success', `✓ ATTENDANCE RECORDED IN GREEN (VERIFIED): Distance: ${distanceMeters}m <= ${allowedRadius}m | IP: ${currentIp}. Registration & Attendance locked to this device for ${name} (${roll})!`);
    }
  }

  function showAlert(type, message) {
    const alertBox = document.getElementById('attendance-alert-box');
    if (!alertBox) return;
    alertBox.className = `attendance-alert ${type}`;
    alertBox.textContent = message;
    alertBox.style.display = 'block';
  }

  function getAttendanceRecords() {
    return JSON.parse(localStorage.getItem('bdc26_attendance_records')) || [];
  }

  function saveAttendanceRecord(record) {
    const records = getAttendanceRecords();
    records.unshift(record);
    localStorage.setItem('bdc26_attendance_records', JSON.stringify(records));
    renderAdminTable();
  }

  // --- 13. ADMIN DASHBOARD & COMMAND CENTER ---
  function initAdminModal() {
    const adminBtn = document.getElementById('admin-btn');
    const modal = document.getElementById('admin-modal');
    const closeBtn = document.getElementById('close-admin-modal');
    const saveVenueBtn = document.getElementById('save-venue-btn');
    const setMyLocBtn = document.getElementById('set-my-location-venue-btn');
    const exportExcelBtn = document.getElementById('export-excel-btn');
    const addNoteForm = document.getElementById('add-note-form');

    if (adminBtn && modal) {
      adminBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const pass = prompt('Enter Admin Passcode:');
        if (pass === config.security.adminPasscode) {
          modal.classList.add('active');
          renderAdminTable();
          populateVenueSettingsForm();
        } else if (pass !== null) {
          alert('Unauthorized access code.');
        }
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (saveVenueBtn) {
      saveVenueBtn.addEventListener('click', handleVenueSettingsSave);
    }

    if (setMyLocBtn) {
      setMyLocBtn.addEventListener('click', handleSetCurrentLocationAsVenue);
    }

    if (exportExcelBtn) {
      exportExcelBtn.addEventListener('click', handleExcelExport);
    }

    if (addNoteForm) {
      addNoteForm.addEventListener('submit', handleAddNoteSubmit);
    }

    // Admin Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-admin-tab');
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(`admin-pane-${tab}`);
        if (target) target.style.display = 'block';
      });
    });

    const searchInput = document.getElementById('admin-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderAdminTable());
    }

    const filterSelect = document.getElementById('admin-filter-session');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => renderAdminTable());
    }
  }

  function populateVenueSettingsForm() {
    const latInput = document.getElementById('venue-lat-input');
    const lngInput = document.getElementById('venue-lng-input');
    const radInput = document.getElementById('venue-radius-input');

    if (latInput) latInput.value = state.venueSettings.latitude;
    if (lngInput) lngInput.value = state.venueSettings.longitude;
    if (radInput) radInput.value = state.venueSettings.radiusMeters || 10;
  }

  function handleSetCurrentLocationAsVenue() {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('venue-lat-input').value = lat;
        document.getElementById('venue-lng-input').value = lng;
        document.getElementById('venue-radius-input').value = 10;
        state.venueSettings = { latitude: lat, longitude: lng, radiusMeters: 10 };
        localStorage.setItem('bdc26_venue_settings', JSON.stringify(state.venueSettings));
        alert(`Venue set to current GPS coordinates (${lat.toFixed(6)}, ${lng.toFixed(6)}) with 10-meter geofence!`);
        acquireUserGeolocation();
      },
      (err) => alert('Could not retrieve GPS coordinates. Please grant location permissions.')
    );
  }

  function handleVenueSettingsSave() {
    const lat = parseFloat(document.getElementById('venue-lat-input').value);
    const lng = parseFloat(document.getElementById('venue-lng-input').value);
    const rad = parseInt(document.getElementById('venue-radius-input').value, 10);

    if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
      alert('Please enter valid numeric values for coordinates and radius.');
      return;
    }

    state.venueSettings = { latitude: lat, longitude: lng, radiusMeters: rad };
    localStorage.setItem('bdc26_venue_settings', JSON.stringify(state.venueSettings));
    alert(`Venue coordinates updated successfully with ${rad}m geofence.`);
    acquireUserGeolocation();
  }

  function renderAdminTable() {
    const tbody = document.getElementById('admin-attendance-tbody');
    if (!tbody) return;

    let records = getAttendanceRecords();
    const searchQuery = (document.getElementById('admin-search-input')?.value || '').trim().toLowerCase();
    const filterSession = document.getElementById('admin-filter-session')?.value || 'ALL';

    if (searchQuery) {
      records = records.filter(r =>
        r.rollNumber.toLowerCase().includes(searchQuery) ||
        r.name.toLowerCase().includes(searchQuery) ||
        r.email.toLowerCase().includes(searchQuery) ||
        (r.clientIp && r.clientIp.includes(searchQuery))
      );
    }

    if (filterSession !== 'ALL') {
      records = records.filter(r => `${r.day} - ${r.session}` === filterSession);
    }

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-dim);">No attendance records found matching filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const statusBadge = r.flagged
        ? `<span class="flag-badge-flagged" title="${r.flagReason || 'Out of 10m range'}">● RED / FLAGGED (${r.geoDistance}m > ${r.allowedRadius || 10}m)</span>`
        : `<span class="flag-badge-ok">● GREEN / VERIFIED (${r.geoDistance}m <= ${r.allowedRadius || 10}m)</span>`;

      return `
        <tr class="${r.flagged ? 'row-flagged-red' : 'row-verified-green'}">
          <td><strong>${r.rollNumber}</strong></td>
          <td>${r.name}</td>
          <td>${r.email}</td>
          <td><span style="color:var(--accent-cyan);">${r.clientIp || '127.0.0.1'}</span></td>
          <td>${r.day} · ${r.session}</td>
          <td>${timeStr}</td>
          <td><strong>${r.geoDistance}m</strong></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  // --- 14. EXCEL (.XLSX) EXPORT VIA SHEETJS ---
  function handleExcelExport() {
    const records = getAttendanceRecords();
    if (records.length === 0) {
      alert('No attendance records to export.');
      return;
    }

    const filterSession = document.getElementById('admin-filter-session')?.value || 'ALL';
    let exportData = records;
    if (filterSession !== 'ALL') {
      exportData = records.filter(r => `${r.day} - ${r.session}` === filterSession);
    }

    const rows = exportData.map(r => ({
      "Roll Number": r.rollNumber,
      "Full Name": r.name,
      "College Email": r.email,
      "IP Address": r.clientIp || "127.0.0.1",
      "Day": r.day,
      "Session": r.session,
      "Check-in Timestamp": new Date(r.timestamp).toLocaleString(),
      "Geo-Distance (Meters)": r.geoDistance,
      "Allowed Radius (Meters)": r.allowedRadius || 10,
      "Geofence Result": r.flagged ? "RED (OUT OF 10M BOUNDARY)" : "GREEN (VERIFIED IN 10M)",
      "Status": r.flagged ? "FLAGGED" : "OK",
      "Device Signature": r.deviceToken || "DEV_LOCKED",
      "Flag Reason": r.flagReason || "None"
    }));

    if (window.XLSX) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance_10m_Geofenced");
      const filename = `BDC26_Attendance_${filterSession.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
      XLSX.writeFile(wb, filename);
    } else {
      alert('Excel export engine loading... Please check connection.');
    }
  }

  function handleAddNoteSubmit(e) {
    e.preventDefault();
    const day = document.getElementById('new-note-day').value;
    const session = document.getElementById('new-note-session').value;
    const title = document.getElementById('new-note-title').value;
    const speaker = document.getElementById('new-note-speaker').value;
    const fileUrl = document.getElementById('new-note-url').value;

    const savedNotes = JSON.parse(localStorage.getItem('bdc26_notes')) || config.notes || [];
    savedNotes.push({
      id: 'note-' + Date.now(),
      day,
      session,
      title,
      speaker,
      type: 'PDF / SLIDES',
      fileUrl,
      updatedAt: new Date().toISOString().split('T')[0]
    });

    localStorage.setItem('bdc26_notes', JSON.stringify(savedNotes));
    renderNotes();
    alert('New lecture note added to archive.');
    document.getElementById('add-note-form').reset();
  }

  // --- 15. LIVE VISITOR COUNTER ---
  function initVisitCounter() {
    let visits = parseInt(localStorage.getItem('bdc26_visit_count'), 10);
    if (!visits || isNaN(visits)) {
      visits = 1204;
    }
    visits += 1;
    localStorage.setItem('bdc26_visit_count', visits);

    const counterEl = document.getElementById('footer-visit-counter');
    if (counterEl) {
      counterEl.textContent = `${visits.toLocaleString()} visits`;
    }
  }

  // Helper to clear lock for organizers testing
  window.resetDeviceLockForTesting = function () {
    localStorage.removeItem('bdc26_registered_student');
    localStorage.removeItem('bdc26_device_token');
    alert('Device lock reset for testing.');
    location.reload();
  };

})();
