/* ============================================================
   BASF Kids' Lab Dashboard — Application Logic
   Now powered by Neon Postgres via Express API
   ============================================================ */

(function () {
  'use strict';

  // ── Constants ──
  const API_BASE = '/api';
  const CREDENTIALS = {
    admin: { username: 'admin', password: 'admin123' },
    mentor: { username: 'mentor', password: 'mentor123' }
  };
  const SESSION_KEY = 'basf_kidslab_session';
  const SESSION_ROLE_KEY = 'basf_kidslab_user_role';

  // ── State ──
  let currentPage = 'overview';
  let currentSchoolId = null;
  let trackingIntervalId = null;
  let geolocationWatchId = null;
  let mentorTrackingState = {
    active: false,
    schoolId: null,
    tripName: '',
    mentorName: '',
    status: 'Departed',
    lat: null,
    lon: null,
    distance: null
  };

  // ── DOM References ──
  const splashScreen = document.getElementById('splash-screen');
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const pageContent = document.getElementById('page-content');
  const pageTitle = document.getElementById('page-title');
  const toastContainer = document.getElementById('toast-container');

  // ============================================================
  //  INITIALIZATION
  // ============================================================
  function init() {
    runSplashAnimation();
    setupEventListeners();
    updateDate();
  }

  // ============================================================
  //  TOAST NOTIFICATIONS (Dynamic Island Style)
  // ============================================================
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400); // match animation duration
    }, 4000);
  }

  // ============================================================
  //  API HELPER
  // ============================================================
  async function api(endpoint, options = {}) {
    try {
      const url = API_BASE + endpoint;
      const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      };
      if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
      }
      const res = await fetch(url, config);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }
      return await res.json();
    } catch (err) {
      console.error('API Error:', err.message);
      throw err;
    }
  }

  // ============================================================
  //  LOADING OVERLAY
  // ============================================================
  function showLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
  }

  // ============================================================
  //  SPLASH SCREEN
  // ============================================================
  function runSplashAnimation() {
    // Cinematic Apple-style fade takes about 4.5s.
    setTimeout(() => {
      splashScreen.classList.add('fade-out');
      setTimeout(() => {
        splashScreen.style.display = 'none';
        if (isLoggedIn()) {
          showDashboard();
        } else {
          showLogin();
        }
      }, 1500); // Wait for the smooth 1.5s fade-out transition
    }, 4500);
  }

  //  AUTHENTICATION
  // ============================================================
  function isLoggedIn() {
    return localStorage.getItem(SESSION_KEY) === 'true';
  }

  function login(username, password) {
    if (username === CREDENTIALS.admin.username && password === CREDENTIALS.admin.password) {
      localStorage.setItem(SESSION_KEY, 'true');
      localStorage.setItem(SESSION_ROLE_KEY, 'admin');
      return 'admin';
    } else if (username === CREDENTIALS.mentor.username && password === CREDENTIALS.mentor.password) {
      localStorage.setItem(SESSION_KEY, 'true');
      localStorage.setItem(SESSION_ROLE_KEY, 'mentor');
      return 'mentor';
    }
    return null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_ROLE_KEY);
    if (geolocationWatchId) {
      navigator.geolocation.clearWatch(geolocationWatchId);
      geolocationWatchId = null;
    }
    dashboard.classList.remove('active');
    showLogin();
  }

  function showLogin() {
    loginScreen.classList.add('active');
    dashboard.classList.remove('active');
  }

  function showDashboard() {
    loginScreen.classList.remove('active');
    dashboard.classList.add('active');
    
    const role = localStorage.getItem(SESSION_ROLE_KEY);
    const roleBadge = document.getElementById('user-role-badge');
    if (roleBadge) {
      roleBadge.textContent = role === 'admin' ? '🛡️ Admin' : '👥 Mentor';
    }
    
    // Always show sidebar layout
    document.getElementById('sidebar').style.display = 'flex';
    document.querySelector('.main-content').style.marginLeft = '';

    const adminItems = [
      document.getElementById('nav-overview'),
      document.getElementById('nav-schools'),
      document.getElementById('nav-tracking'),
      document.getElementById('nav-add-school'),
      document.getElementById('nav-section-actions')
    ];

    if (role === 'mentor') {
      // Hide admin tabs, show only mentor console
      adminItems.forEach(el => { if (el) el.style.display = 'none'; });
      const mentorBtn = document.getElementById('nav-mentor-console');
      if (mentorBtn) mentorBtn.style.display = 'flex';
      navigateTo('mentor-console');
    } else {
      // Show all tabs
      adminItems.forEach(el => { if (el) el.style.display = 'flex'; });
      const mentorBtn = document.getElementById('nav-mentor-console');
      if (mentorBtn) mentorBtn.style.display = 'flex';
      navigateTo('overview');
    }
  }

  // ============================================================
  //  NAVIGATION
  // ============================================================
  function navigateTo(page, schoolId) {
    if (trackingIntervalId) {
      clearInterval(trackingIntervalId);
      trackingIntervalId = null;
    }

    currentPage = page;
    currentSchoolId = schoolId || null;

    document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
      item.classList.remove('active');
      if (item.dataset.page === page) item.classList.add('active');
    });

    const titles = {
      overview: 'Dashboard',
      schools: 'Schools',
      'school-detail': 'School Details',
      tracking: 'Live Transit Tracking',
      'mentor-console': 'Bus Transit Tracker'
    };
    pageTitle.textContent = titles[page] || 'Dashboard';

    switch (page) {
      case 'overview':
        renderOverview();
        break;
      case 'schools':
        renderSchools();
        break;
      case 'school-detail':
        renderSchoolDetail(schoolId);
        break;
      case 'tracking':
        renderTracking();
        break;
      case 'mentor-console':
        renderMentorDashboard();
        break;
    }
  }

  // ============================================================
  //  RENDER: OVERVIEW
  // ============================================================
  async function renderOverview() {
    pageContent.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="border-color: var(--border); border-top-color: var(--basf-blue); width: 40px; height: 40px; margin: 0 auto;"></div><p style="margin-top: 1rem;">Loading dashboard...</p></div>';

    try {
      const [stats, schools] = await Promise.all([
        api('/stats'),
        api('/schools'),
      ]);

      const recentSchools = schools.slice(0, 5);

      pageContent.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card blue">
            <div class="stat-icon blue">🏫</div>
            <div class="stat-info">
              <div class="stat-value animate-count">${stats.totalSchools}</div>
              <div class="stat-label">Total Schools</div>
            </div>
          </div>
          <div class="stat-card orange">
            <div class="stat-icon orange">📦</div>
            <div class="stat-info">
              <div class="stat-value animate-count">${stats.totalBatches}</div>
              <div class="stat-label">Total Batches</div>
            </div>
          </div>
          <div class="stat-card green">
            <div class="stat-icon green">✅</div>
            <div class="stat-info">
              <div class="stat-value animate-count">${stats.totalPresent}</div>
              <div class="stat-label">Students Present</div>
            </div>
          </div>
        </div>

        <div class="section-header">
          <h2>Recent Schools</h2>
          <button class="btn btn-primary" id="overview-add-school">➕ Add School</button>
        </div>

        ${
          recentSchools.length === 0
            ? `
          <div class="empty-state">
            <div class="empty-icon">🏫</div>
            <h3>No Schools Added Yet</h3>
            <p>Start by adding the first school that visited the Kids' Lab program.</p>
            <button class="btn btn-primary" id="empty-add-school">➕ Add First School</button>
          </div>
        `
            : `
          <div class="schools-grid">
            ${recentSchools.map((s) => renderSchoolCard(s)).join('')}
          </div>
        `
        }
      `;

      // Bind events
      const addBtn = document.getElementById('overview-add-school');
      if (addBtn) addBtn.addEventListener('click', () => openModal('modal-add-school'));
      const emptyBtn = document.getElementById('empty-add-school');
      if (emptyBtn) emptyBtn.addEventListener('click', () => openModal('modal-add-school'));
      bindSchoolCards();
      updateBadge(stats.totalSchools);
    } catch (err) {
      pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Connection Error</h3><p>${err.message}</p></div>`;
    }
  }

  // ============================================================
  //  RENDER: SCHOOLS LIST
  // ============================================================
  async function renderSchools() {
    pageContent.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="border-color: var(--border); border-top-color: var(--basf-blue); width: 40px; height: 40px; margin: 0 auto;"></div><p style="margin-top: 1rem;">Loading schools...</p></div>';

    try {
      const schools = await api('/schools');

      pageContent.innerHTML = `
        <div class="section-header">
          <h2>All Schools (${schools.length})</h2>
          <button class="btn btn-primary" id="schools-add-btn">➕ Add School</button>
        </div>

        ${
          schools.length === 0
            ? `
          <div class="empty-state">
            <div class="empty-icon">🏫</div>
            <h3>No Schools Added Yet</h3>
            <p>Add schools that have participated in the BASF Kids' Lab program.</p>
            <button class="btn btn-primary" id="empty-add-school2">➕ Add First School</button>
          </div>
        `
            : `
          <div class="schools-grid">
            ${schools.map((s) => renderSchoolCard(s)).join('')}
          </div>
        `
        }
      `;

      const addBtn = document.getElementById('schools-add-btn');
      if (addBtn) addBtn.addEventListener('click', () => openModal('modal-add-school'));
      const emptyBtn = document.getElementById('empty-add-school2');
      if (emptyBtn) emptyBtn.addEventListener('click', () => openModal('modal-add-school'));
      bindSchoolCards();
      updateBadge(schools.length);
    } catch (err) {
      pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderSchoolCard(school) {
    const present = school.presentCount || 0;
    const batchCount = school.batchCount || 0;
    const hasConsent = school.hasConsentForm;
    const hasAttendance = school.hasAttendanceSheet;
    const hasPhoto = school.hasGroupPhoto;

    return `
      <div class="school-card" data-school-id="${school.id}">
        ${hasPhoto ? `<div class="school-card-cover" style="height: 140px; background-size: cover; background-position: center; border-radius: var(--radius-xl) var(--radius-xl) 0 0; background-image: url('/api/schools/${school.id}/photo-image'); border-bottom: 1px solid var(--border);"></div>` : ''}
        <div class="school-card-header">
          <h3>${escapeHtml(school.name)}</h3>
          <span class="school-date">📅 ${formatDate(school.date)}</span>
        </div>
        <div class="school-card-body">
          <div class="school-card-stats">
            <div class="school-mini-stat">
              <span class="mini-icon">📦</span>
              <div class="mini-info">
                <span class="mini-value">${batchCount}</span>
                <span class="mini-label">Batches</span>
              </div>
            </div>
            <div class="school-mini-stat">
              <span class="mini-icon">👥</span>
              <div class="mini-info">
                <span class="mini-value">${present}</span>
                <span class="mini-label">Total Students</span>
              </div>
            </div>
            <div class="school-mini-stat">
              <span class="mini-icon">✅</span>
              <div class="mini-info">
                <span class="mini-value" style="color: var(--success);">${present}</span>
                <span class="mini-label">Present</span>
              </div>
            </div>
          </div>
        </div>
        <div class="school-card-footer">
          <span class="status-badge ${hasConsent ? 'uploaded' : 'pending'}">
            ${hasConsent ? '✅' : '⏳'} Consent Form
          </span>
          <span class="status-badge ${hasAttendance ? 'uploaded' : 'pending'}">
            ${hasAttendance ? '✅' : '⏳'} Attendance
          </span>
          <span class="status-badge ${hasPhoto ? 'uploaded' : 'pending'}">
            ${hasPhoto ? '📸' : '⏳'} Photo
          </span>
        </div>
      </div>
    `;
  }

  function bindSchoolCards() {
    document.querySelectorAll('.school-card').forEach((card) => {
      card.addEventListener('click', () => {
        navigateTo('school-detail', card.dataset.schoolId);
      });
    });
  }

  // ============================================================
  //  RENDER: SCHOOL DETAIL
  // ============================================================
  async function renderSchoolDetail(schoolId, activeTab) {
    activeTab = activeTab || 'batches';

    pageContent.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="border-color: var(--border); border-top-color: var(--basf-blue); width: 40px; height: 40px; margin: 0 auto;"></div><p style="margin-top: 1rem;">Loading school...</p></div>';

    try {
      const school = await api('/schools/' + schoolId);

      pageTitle.textContent = school.name;
      const batches = school.batches || [];
      const present = school.presentCount || 0;

      pageContent.innerHTML = `
        <div class="detail-header">
          <button class="back-btn" id="btn-back">←</button>
          <div class="detail-title" style="flex: 1;">
            <h2>${escapeHtml(school.name)}</h2>
            <p>📅 ${formatDate(school.date)} ${school.principal ? '&nbsp;|&nbsp; 👤 ' + escapeHtml(school.principal) : ''} ${school.email ? '&nbsp;|&nbsp; ✉️ ' + escapeHtml(school.email) : ''}</p>
          </div>
          <button class="btn btn-danger" id="btn-delete-school">🗑️ Delete School</button>
        </div>

        <div class="tabs">
          <button class="tab-btn ${activeTab === 'batches' ? 'active' : ''}" data-tab="batches">📦 Batches</button>
          <button class="tab-btn ${activeTab === 'consent' ? 'active' : ''}" data-tab="consent">📄 Consent Form</button>
          <button class="tab-btn ${activeTab === 'attendance' ? 'active' : ''}" data-tab="attendance">📋 Attendance</button>
          <button class="tab-btn ${activeTab === 'photo' ? 'active' : ''}" data-tab="photo">📸 Group Photo</button>
          <button class="tab-btn ${activeTab === 'stats' ? 'active' : ''}" data-tab="stats">👥 Students</button>
        </div>

        <!-- Tab: Batches -->
        <div class="tab-content ${activeTab === 'batches' ? 'active' : ''}" id="tab-batches">
          <div class="section-header">
            <h2>Batches (${batches.length})</h2>
            <button class="btn btn-primary" id="btn-add-batch">➕ Add Batch</button>
          </div>
          ${
            batches.length === 0
              ? `<div class="empty-state"><div class="empty-icon">📦</div><h3>No Batches Yet</h3><p>Add batches with their timings for this school visit.</p></div>`
              : `
            <div class="data-table-wrapper">
              <table class="data-table">
                <thead><tr><th>#</th><th>Batch Name</th><th>Start Time</th><th>End Time</th><th>Actions</th></tr></thead>
                <tbody>
                  ${batches.map((b, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td><strong>${escapeHtml(b.name)}</strong></td>
                      <td>${formatTime(b.startTime)}</td>
                      <td>${formatTime(b.endTime)}</td>
                      <td><button class="btn btn-danger btn-sm delete-batch-btn" data-batch-id="${b.id}">🗑️ Delete</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
          }
        </div>

        <!-- Tab: Consent Form -->
        <div class="tab-content ${activeTab === 'consent' ? 'active' : ''}" id="tab-consent">
          <div class="section-header"><h2>Consent Form</h2></div>
          ${(school.consentForm && school.consentForm.length > 0) ? `
            <div class="gallery-grid" style="margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
              ${school.consentForm.map((f, i) => `
                <div class="gallery-item" style="border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-hover); padding: 0.5rem; text-align: center;">
                  <div style="height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
                    <img src="${f.data}" alt="Consent Form" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                    <div style="display: none; color: var(--text-muted);">
                      <div style="font-size: 2rem;">📄</div>
                      <div>Document Uploaded</div>
                    </div>
                  </div>
                  <div class="file-name" style="font-size: 0.8rem; margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.name || 'consent_form')}</div>
                  <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-secondary btn-sm view-consent-btn" data-index="${i}" style="flex: 1;">👁️ View</button>
                    <button class="btn btn-danger btn-sm delete-consent-btn" data-index="${i}" style="flex: 1;">🗑️ Remove</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="upload-zone" id="consent-upload-zone" style="margin-top: 1.5rem;">
            <div class="upload-icon">📤</div>
            <h4>Upload Consent Form</h4>
            <p>Drag & drop scanned consent forms (PDF or Image) here, or <span class="browse-link">browse files</span></p>
            <input type="file" id="consent-file-input" accept=".pdf,image/*,.png,.jpg,.jpeg,.webp" multiple style="display: none;" />
          </div>
        </div>

        <!-- Tab: Attendance -->
        <div class="tab-content ${activeTab === 'attendance' ? 'active' : ''}" id="tab-attendance">
          <div class="section-header"><h2>Attendance Sheet</h2></div>
          ${(school.attendanceSheet && school.attendanceSheet.length > 0) ? `
            <div class="gallery-grid" style="margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
              ${school.attendanceSheet.map((f, i) => `
                <div class="gallery-item" style="border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-hover); padding: 0.5rem; text-align: center;">
                  <div style="height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
                    <img src="${f.data}" alt="Attendance Sheet" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                    <div style="display: none; color: var(--text-muted);">
                      <div style="font-size: 2rem;">📄</div>
                      <div>Document Uploaded</div>
                    </div>
                  </div>
                  <div class="file-name" style="font-size: 0.8rem; margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.name || 'attendance_sheet')}</div>
                  <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-secondary btn-sm view-attendance-btn" data-index="${i}" style="flex: 1;">👁️ View</button>
                    <button class="btn btn-danger btn-sm delete-attendance-btn" data-index="${i}" style="flex: 1;">🗑️ Remove</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="upload-zone" id="attendance-upload-zone" style="margin-top: 1.5rem;">
            <div class="upload-icon">📤</div>
            <h4>Upload Attendance Sheet</h4>
            <p>Drag & drop scanned attendance sheets (PDF or Image) here, or <span class="browse-link">browse files</span></p>
            <input type="file" id="attendance-file-input" accept=".pdf,image/*,.png,.jpg,.jpeg,.webp" multiple style="display: none;" />
          </div>
        </div>

        <!-- Tab: Group Photo -->
        <div class="tab-content ${activeTab === 'photo' ? 'active' : ''}" id="tab-photo">
          <div class="section-header"><h2>Group Photo (Cover)</h2></div>
          ${(school.groupPhoto && school.groupPhoto.length > 0) ? `
            <div class="gallery-grid" style="margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
              ${school.groupPhoto.map((f, i) => `
                <div class="gallery-item" style="border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-hover); padding: 0.5rem; text-align: center;">
                  <div style="height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
                    <img src="/api/schools/${school.id}/photo-image?index=${i}" alt="Group Photo" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                    <div style="display: none; color: var(--text-muted);">
                      <div style="font-size: 2rem;">📄</div>
                      <div>Document Uploaded</div>
                    </div>
                  </div>
                  <div class="file-name" style="font-size: 0.8rem; margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.name || 'group_photo')}</div>
                  <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-secondary btn-sm view-photo-btn" data-index="${i}" style="flex: 1;">👁️ View</button>
                    <button class="btn btn-danger btn-sm delete-photo-btn" data-index="${i}" style="flex: 1;">🗑️ Remove</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="upload-zone" id="photo-upload-zone" style="margin-top: 1.5rem;">
            <div class="upload-icon">📤</div>
            <h4>Upload Group Photo</h4>
            <p>Drag & drop group photos (Image or PDF) here, or <span class="browse-link">browse files</span></p>
            <input type="file" id="photo-file-input" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp" multiple style="display: none;" />
          </div>
        </div>

        <!-- Tab: Student Stats -->
        <div class="tab-content ${activeTab === 'stats' ? 'active' : ''}" id="tab-stats">
          <div class="section-header"><h2>Student Attendance Count</h2></div>
          <div class="student-count-grid">
            <div class="count-card present">
              <div class="count-icon">✅</div>
              <div class="count-value">${present}</div>
              <div class="count-label">Students Present</div>
              <div class="count-input-group">
                <input type="number" class="count-input" id="input-present" value="${present}" min="0" placeholder="0" />
                <button class="btn btn-success btn-sm" id="btn-save-present">Save</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // ── Bind Detail Events ──
      document.getElementById('btn-back').addEventListener('click', () => navigateTo('schools'));

      // Delete School
      document.getElementById('btn-delete-school').addEventListener('click', () => {
        document.getElementById('delete-confirm-text').textContent = `Are you sure you want to delete ${school.name}? This will permanently delete all batches and files associated with it.`;
        openModal('modal-confirm-delete');
        
        // Reset listeners on confirm button using cloneNode
        const confirmBtn = document.getElementById('btn-confirm-delete-action');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', async () => {
          closeModal('modal-confirm-delete');
          showLoading();
          try {
            await api('/schools/' + schoolId, { method: 'DELETE' });
            hideLoading();
            showToast('School deleted successfully', 'success');
            navigateTo('schools');
          } catch (err) {
            hideLoading();
            showToast('Failed to delete school', 'error');
          }
        });
      });

      // Tabs
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
      });

      // Add Batch (opens the separate batch modal)
      document.getElementById('btn-add-batch').addEventListener('click', () => openModal('modal-add-batch'));

      // Delete Batch
      document.querySelectorAll('.delete-batch-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await api('/batches/' + btn.dataset.batchId, { method: 'DELETE' });
            showToast('Batch deleted', 'success');
            renderSchoolDetail(schoolId, 'batches');
          } catch (err) {
            showToast('Failed to delete batch', 'error');
          }
        });
      });

      // Consent Form Upload
      setupFileUpload('consent-upload-zone', 'consent-file-input', async (files) => {
        showLoading();
        let successCount = 0;
        for (const file of files) {
          try {
            await api('/schools/' + schoolId + '/consent', { method: 'PUT', body: { files: [file] } });
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        hideLoading();
        if (successCount > 0) showToast(`Uploaded ${successCount} consent form(s)!`, 'success');
        else showToast('Failed to upload', 'error');
        renderSchoolDetail(schoolId, 'consent');
      });

      // View / Delete consent
      document.querySelectorAll('.view-consent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.index;
          const f = school.consentForm[idx];
          if (f.name && f.name.toLowerCase().endsWith('.pdf')) openPdfViewer(f.data, f.name);
          else openPdfViewer(f.data, f.name); // we can reuse openPdfViewer for images too, since it renders an iframe, but let's do a simple popup
        });
      });
      document.querySelectorAll('.delete-consent-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api('/schools/' + schoolId + '/consent?index=' + btn.dataset.index, { method: 'DELETE' });
            showToast('Consent form removed', 'success');
            renderSchoolDetail(schoolId, 'consent');
          } catch (err) {
            showToast('Failed to remove', 'error');
          }
        });
      });

      // Attendance Sheet Upload
      setupFileUpload('attendance-upload-zone', 'attendance-file-input', async (files) => {
        showLoading();
        let successCount = 0;
        for (const file of files) {
          try {
            await api('/schools/' + schoolId + '/attendance', { method: 'PUT', body: { files: [file] } });
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        hideLoading();
        if (successCount > 0) showToast(`Uploaded ${successCount} attendance sheet(s)!`, 'success');
        else showToast('Failed to upload', 'error');
        renderSchoolDetail(schoolId, 'attendance');
      });

      // View / Delete attendance
      document.querySelectorAll('.view-attendance-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.index;
          const f = school.attendanceSheet[idx];
          openPdfViewer(f.data, f.name);
        });
      });
      document.querySelectorAll('.delete-attendance-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api('/schools/' + schoolId + '/attendance?index=' + btn.dataset.index, { method: 'DELETE' });
            showToast('Attendance sheet removed', 'success');
            renderSchoolDetail(schoolId, 'attendance');
          } catch (err) {
            showToast('Failed to remove', 'error');
          }
        });
      });

      // Group Photo Upload
      setupFileUpload('photo-upload-zone', 'photo-file-input', async (files) => {
        showLoading();
        let successCount = 0;
        for (const file of files) {
          try {
            await api('/schools/' + schoolId + '/photo', { method: 'PUT', body: { files: [file] } });
            successCount++;
          } catch (err) {
            console.error(err);
          }
        }
        hideLoading();
        if (successCount > 0) showToast(`Uploaded ${successCount} group photo(s)!`, 'success');
        else showToast('Failed to upload', 'error');
        renderSchoolDetail(schoolId, 'photo');
      });

      // View / Delete Photo
      document.querySelectorAll('.view-photo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.index;
          const f = school.groupPhoto[idx];
          if (f.name && f.name.toLowerCase().endsWith('.pdf')) {
            openPdfViewer(f.data, f.name);
          } else {
            window.open('/api/schools/' + schoolId + '/photo-image?index=' + idx, '_blank');
          }
        });
      });
      document.querySelectorAll('.delete-photo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api('/schools/' + schoolId + '/photo?index=' + btn.dataset.index, { method: 'DELETE' });
            showToast('Group photo removed', 'success');
            renderSchoolDetail(schoolId, 'photo');
          } catch (err) {
            showToast('Failed to remove', 'error');
          }
        });
      });

      // Student Count Save
      const savePresentBtn = document.getElementById('btn-save-present');
      if (savePresentBtn) {
        savePresentBtn.addEventListener('click', async () => {
          const presentVal = parseInt(document.getElementById('input-present').value) || 0;
          try {
            await api('/schools/' + schoolId + '/counts', {
              method: 'PUT',
              body: { presentCount: presentVal, absentCount: 0 },
            });
            showToast(`Student count updated to ${presentVal}`, 'success');
            renderSchoolDetail(schoolId, 'stats');
          } catch (err) {
            showToast('Failed to save', 'error');
          }
        });
      }
    } catch (err) {
      pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function setupFileUpload(zoneId, inputId, onUpload) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        await processFiles(e.dataTransfer.files, onUpload);
      }
    });

    input.addEventListener('change', async () => {
      if (input.files.length > 0) {
        await processFiles(input.files, onUpload);
      }
      input.value = ''; // reset so same files can be chosen again
    });
  }

  async function processFiles(fileList, onUpload) {
    const files = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
        showToast(`Skipped ${file.name}: Only PDF or Image allowed`, 'warning');
        continue;
      }
      if (file.size > 4 * 1024 * 1024) {
        showToast(`Skipped ${file.name}: File is too large (max 4MB for Vercel)`, 'warning');
        continue;
      }
      files.push(file);
    }
    
    if (files.length === 0) return;
    
    showToast(`Processing ${files.length} file(s)...`, 'info');
    
    const results = await Promise.all(files.map(f => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ fileData: reader.result, fileName: f.name });
        reader.readAsDataURL(f);
      });
    }));
    
    onUpload(results);
  }

  function openPdfViewer(dataUrl, fileName) {
    if (!dataUrl) return;
    const win = window.open();
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>${escapeHtml(fileName || 'Document')}</title></head>
        <body style="margin:0;">
          <iframe src="${dataUrl}" style="width:100%;height:100vh;border:none;"></iframe>
        </body>
        </html>
      `);
    } else {
      showToast('Please allow popups to view the document', 'warning');
    }
  }

  // ============================================================
  //  INLINE BATCH ROWS (Add School Modal)
  // ============================================================
  let inlineBatchCounter = 0;

  function addInlineBatchRow() {
    inlineBatchCounter++;
    const container = document.getElementById('inline-batch-rows');
    const emptyMsg = document.getElementById('inline-batch-empty');

    if (emptyMsg) emptyMsg.classList.add('hidden');

    const row = document.createElement('div');
    row.className = 'inline-batch-row';
    row.dataset.batchIndex = inlineBatchCounter;
    row.innerHTML = `
      <input type="text" placeholder="Batch name" class="ib-name" required />
      <input type="time" class="ib-start" required />
      <input type="time" class="ib-end" required />
      <button type="button" class="inline-batch-remove" title="Remove batch">🗑️</button>
    `;

    // Remove button
    row.querySelector('.inline-batch-remove').addEventListener('click', () => {
      row.remove();
      // Show empty message if no rows left
      if (container.children.length === 0 && emptyMsg) {
        emptyMsg.classList.remove('hidden');
      }
    });

    container.appendChild(row);
  }

  function getInlineBatches() {
    const rows = document.querySelectorAll('.inline-batch-row');
    const batches = [];
    rows.forEach((row) => {
      const name = row.querySelector('.ib-name').value.trim();
      const startTime = row.querySelector('.ib-start').value;
      const endTime = row.querySelector('.ib-end').value;
      if (name && startTime && endTime) {
        batches.push({ name, startTime, endTime });
      }
    });
    return batches;
  }

  function clearInlineBatches() {
    const container = document.getElementById('inline-batch-rows');
    const emptyMsg = document.getElementById('inline-batch-empty');
    if (container) container.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    inlineBatchCounter = 0;
  }

  // ============================================================
  //  MODALS
  // ============================================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      const form = modal.querySelector('form');
      if (form) form.reset();
      if (modalId === 'modal-add-school') {
        clearInlineBatches();
      }
    }
  }

  // ============================================================
  //  LIVE TRANSIT TRACKING & MENTOR VIEW
  // ============================================================
  function startMentorTracking() {
    if (geolocationWatchId) navigator.geolocation.clearWatch(geolocationWatchId);

    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    showToast('📍 GPS tracking activated — high accuracy mode', 'success');

    let lastSendTime = 0;
    const SEND_INTERVAL = 5000; // Send update every 5 seconds max

    geolocationWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        mentorTrackingState.lat = position.coords.latitude;
        mentorTrackingState.lon = position.coords.longitude;

        // Update live coordinates display
        const latEl = document.getElementById('mentor-live-lat');
        const lonEl = document.getElementById('mentor-live-lon');
        if (latEl) latEl.textContent = position.coords.latitude.toFixed(6);
        if (lonEl) lonEl.textContent = position.coords.longitude.toFixed(6);

        // Show GPS accuracy
        const accEl = document.getElementById('mentor-live-accuracy');
        if (accEl && position.coords.accuracy) {
          accEl.textContent = '±' + Math.round(position.coords.accuracy) + ' m';
        }

        // Throttle server updates to every 5 seconds
        const now = Date.now();
        if (now - lastSendTime >= SEND_INTERVAL) {
          lastSendTime = now;
          await sendTransitUpdate();
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        const messages = {
          1: 'Location permission denied. Please allow location access.',
          2: 'Location unavailable. Check your GPS settings.',
          3: 'Location request timed out. Retrying...'
        };
        showToast(messages[error.code] || 'GPS error: ' + error.message, 'error');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  async function sendTransitUpdate() {
    try {
      const res = await api('/transit', {
        method: 'POST',
        body: {
          schoolId: mentorTrackingState.schoolId,
          tripName: mentorTrackingState.tripName,
          mentorName: mentorTrackingState.mentorName,
          status: mentorTrackingState.status,
          latitude: mentorTrackingState.lat,
          longitude: mentorTrackingState.lon
        }
      });

      const distEl = document.getElementById('mentor-live-distance');
      if (distEl && res.distance_km !== null) {
        distEl.textContent = res.distance_km + ' km';
      }

      // Update last sync time
      const syncEl = document.getElementById('mentor-live-sync');
      if (syncEl) {
        syncEl.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    } catch (err) {
      console.error('Failed to send transit status update:', err.message);
    }
  }

  async function renderMentorDashboard() {
    pageTitle.textContent = 'Mentor Tracking Console';
    pageContent.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="border-color: var(--border); border-top-color: var(--basf-blue); width: 40px; height: 40px; margin: 0 auto;"></div><p style="margin-top: 1rem;">Loading schools list...</p></div>';

    try {
      const schools = await api('/schools');

      pageContent.innerHTML = `
        <div class="mentor-dashboard">
          <div class="mentor-card">
            <div class="mentor-header-title">🚌 Bus Transit Tracker</div>
            <p class="mentor-header-desc">Start student collection transit tracking. Your location will be updated live for the admin.</p>

            <form id="mentor-tracking-form">
              <div class="mentor-form-group">
                <label for="mentor-select-school">Select School</label>
                <select id="mentor-select-school" class="mentor-select" required>
                  <option value="" disabled selected>-- Choose School --</option>
                  ${schools.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
                </select>
              </div>

              <div class="mentor-form-group">
                <label for="mentor-select-trip">Select Trip</label>
                <select id="mentor-select-trip" class="mentor-select" required>
                  <option value="" disabled selected>-- Choose Trip --</option>
                  <option value="Trip 1">Trip 1</option>
                  <option value="Trip 2">Trip 2</option>
                  <option value="Trip 3">Trip 3</option>
                  <option value="Trip 4">Trip 4</option>
                </select>
              </div>

              <div class="mentor-form-group">
                <label for="mentor-input-name">Your Name</label>
                <input type="text" id="mentor-input-name" class="mentor-input" placeholder="Enter mentor name" required />
              </div>

              <button type="submit" class="btn btn-primary" style="width: 100%; padding: var(--space-4); margin-top: var(--space-4);" id="btn-start-tracking-submit">
                🚀 Start Live Location Tracking
              </button>
            </form>

            <div id="mentor-active-tracking-panel" style="display: none; margin-top: var(--space-6);">
              <hr style="border: 0; border-top: 1px solid var(--border); margin: var(--space-6) 0;" />
              <div class="mentor-header-title" style="color: var(--success);"><span class="live-dot"></span> Tracking Active</div>
              <p class="mentor-header-desc">Tap to update current status as you proceed with the transit:</p>

              <div class="status-options-grid">
                <button class="status-option-btn active" data-status="Departed">
                  <span class="status-option-icon">🚌</span>
                  <div>
                    <div>Departed from Lab</div>
                    <span style="font-size:0.75rem; font-weight:normal; color:var(--text-secondary);">On the way to school</span>
                  </div>
                </button>
                <button class="status-option-btn" data-status="Arrived at School">
                  <span class="status-option-icon">🏫</span>
                  <div>
                    <div>Arrived at School</div>
                    <span style="font-size:0.75rem; font-weight:normal; color:var(--text-secondary);">Boarding students</span>
                  </div>
                </button>
                <button class="status-option-btn" data-status="Returning">
                  <span class="status-option-icon">🔄</span>
                  <div>
                    <div>Returning with Students</div>
                    <span style="font-size:0.75rem; font-weight:normal; color:var(--text-secondary);">En route back to Kapse Foundation</span>
                  </div>
                </button>
              </div>

              <div class="location-info-panel" style="grid-template-columns: repeat(2, 1fr);">
                <div class="location-info-item">
                  <span class="location-info-label">📍 Live Location</span>
                  <span class="location-info-value" id="mentor-live-coordinates"><span id="mentor-live-lat">--</span>, <span id="mentor-live-lon">--</span></span>
                </div>
                <div class="location-info-item">
                  <span class="location-info-label">📏 Distance to Lab</span>
                  <span class="location-info-value" style="color: var(--basf-blue);" id="mentor-live-distance">-- km</span>
                </div>
                <div class="location-info-item">
                  <span class="location-info-label">🎯 GPS Accuracy</span>
                  <span class="location-info-value" id="mentor-live-accuracy">Acquiring...</span>
                </div>
                <div class="location-info-item">
                  <span class="location-info-label">🔄 Last Synced</span>
                  <span class="location-info-value" id="mentor-live-sync">--</span>
                </div>
              </div>

              <button class="btn btn-danger" style="width: 100%; padding: var(--space-4); margin-top: var(--space-6);" id="btn-complete-tracking">
                🏁 End Transit (Arrived at Lab)
              </button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('mentor-tracking-form').addEventListener('submit', (e) => {
        e.preventDefault();
        mentorTrackingState.schoolId = parseInt(document.getElementById('mentor-select-school').value);
        mentorTrackingState.tripName = document.getElementById('mentor-select-trip').value;
        mentorTrackingState.mentorName = document.getElementById('mentor-input-name').value.trim();
        mentorTrackingState.status = 'Departed';

        document.getElementById('mentor-select-school').disabled = true;
        document.getElementById('mentor-select-trip').disabled = true;
        document.getElementById('mentor-input-name').disabled = true;
        document.getElementById('btn-start-tracking-submit').style.display = 'none';

        document.getElementById('mentor-active-tracking-panel').style.display = 'block';

        startMentorTracking();
      });

      document.querySelectorAll('.status-option-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          document.querySelectorAll('.status-option-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          mentorTrackingState.status = btn.dataset.status;

          showLoading();
          await sendTransitUpdate();
          hideLoading();
          showToast(`Status updated to: ${btn.dataset.status}`, 'success');
        });
      });

      document.getElementById('btn-complete-tracking').addEventListener('click', async () => {
        if (confirm('Are you sure you want to end tracking for this transit?')) {
          showLoading();
          try {
            mentorTrackingState.status = 'Completed';
            await sendTransitUpdate();

            if (geolocationWatchId) {
              navigator.geolocation.clearWatch(geolocationWatchId);
              geolocationWatchId = null;
            }

            mentorTrackingState = { active: false, schoolId: null, tripName: '', mentorName: '', status: 'Departed', lat: null, lon: null, distance: null };
            showToast('Transit completed successfully! Thank you.', 'success');
            renderMentorDashboard();
          } catch (err) {
            showToast('Error ending transit', 'error');
          } finally {
            hideLoading();
          }
        }
      });

    } catch (err) {
      pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading dashboard</h3><p>${err.message}</p></div>`;
    }
  }

  async function renderTracking() {
    if (trackingIntervalId) clearInterval(trackingIntervalId);

    pageContent.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="border-color: var(--border); border-top-color: var(--basf-blue); width: 40px; height: 40px; margin: 0 auto;"></div><p style="margin-top: 1rem;">Loading live tracking data...</p></div>';

    let isDeleting = false;

    async function fetchAndRender() {
      // Don't refresh while a delete is in progress
      if (isDeleting) return;

      try {
        const logs = await api('/transit/active');
        const activeLogs = logs.filter(l => l.status !== 'Completed');

        if (activeLogs.length === 0) {
          pageContent.innerHTML = `
            <div class="section-header">
              <h2>Live Transit Tracking</h2>
              <button class="btn btn-secondary btn-sm" id="btn-refresh-tracking">🔄 Refresh</button>
            </div>
            <div class="empty-state">
              <div class="empty-icon" style="animation: none;">🚌</div>
              <h3>No Buses in Transit</h3>
              <p>Active tracking updates from mentors will appear here in real time.</p>
            </div>
          `;
        } else {
          pageContent.innerHTML = `
            <div class="section-header">
              <h2>Live Transit Tracking (${activeLogs.length} active)</h2>
              <button class="btn btn-secondary btn-sm" id="btn-refresh-tracking">🔄 Refresh</button>
            </div>
            <div class="tracking-list-grid">
              ${activeLogs.map(log => {
                let statusClass = 'departed';
                if (log.status === 'Arrived at School') statusClass = 'arrived_school';
                if (log.status === 'Returning') statusClass = 'returning';

                const mapsLink = (log.latitude && log.longitude)
                  ? `https://www.google.com/maps/search/?api=1&query=${log.latitude},${log.longitude}`
                  : '#';

                return `
                  <div class="tracking-card">
                    <div class="tracking-card-header">
                      <span class="tracking-card-title">${escapeHtml(log.school_name)}</span>
                      <span class="live-badge"><span class="live-dot"></span> Live</span>
                    </div>
                    <div class="tracking-card-body">
                      <div class="tracking-info-row">
                        <span class="tracking-info-label">Mentor Name</span>
                        <span class="tracking-info-value">${escapeHtml(log.mentor_name)}</span>
                      </div>
                      <div class="tracking-info-row">
                        <span class="tracking-info-label">Trip / Route</span>
                        <span class="tracking-info-value">${escapeHtml(log.trip_name)}</span>
                      </div>
                      <div class="tracking-info-row">
                        <span class="tracking-info-label">Current Status</span>
                        <span class="tracking-status-badge ${statusClass}">${escapeHtml(log.status)}</span>
                      </div>
                      <div class="tracking-info-row">
                        <span class="tracking-info-label">Distance to Lab</span>
                        <span class="tracking-info-value" style="color: var(--basf-blue);">${log.distance_km !== null ? log.distance_km + ' km' : '--'}</span>
                      </div>
                      <div class="tracking-info-row">
                        <span class="tracking-info-label">Last Updated</span>
                        <span class="tracking-info-value">${new Date(log.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                    </div>
                    <div class="tracking-card-footer">
                      ${log.latitude ? `
                        <a href="${mapsLink}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none; text-align:center; flex:1;">
                          📍 View Live Map
                        </a>
                      ` : '<span style="color:var(--text-muted); font-size:var(--font-size-xs); flex:1; text-align:center;">GPS Signal Waiting...</span>'}
                      <button class="btn btn-danger btn-sm end-admin-tracking-btn" data-log-id="${log.id}">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      } catch (err) {
        pageContent.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load tracking updates</h3><p>${err.message}</p></div>`;
      }
    }

    // Use event delegation on pageContent so buttons always work even after DOM re-render
    pageContent.addEventListener('click', async (e) => {
      // Handle "Delete" button
      const deleteBtn = e.target.closest('.end-admin-tracking-btn');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const logId = deleteBtn.dataset.logId;
        if (!logId) return;

        if (confirm('Are you sure you want to delete this tracking session?')) {
          isDeleting = true;
          showLoading();
          try {
            await api('/transit/' + logId, { method: 'DELETE' });
            showToast('Tracking session deleted successfully', 'success');
            isDeleting = false;
            await fetchAndRender();
          } catch (err) {
            showToast('Failed to delete tracking: ' + err.message, 'error');
            isDeleting = false;
          } finally {
            hideLoading();
          }
        }
        return;
      }

      // Handle "Refresh" button
      const refreshBtn = e.target.closest('#btn-refresh-tracking');
      if (refreshBtn) {
        e.preventDefault();
        await fetchAndRender();
        return;
      }
    });

    await fetchAndRender();
    trackingIntervalId = setInterval(fetchAndRender, 10000);
  }

  // ============================================================
  //  EVENT LISTENERS
  // ============================================================
  function setupEventListeners() {
    // Login Form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      const role = login(username, password);
      if (role) {
        showDashboard();
        showToast(`Welcome, ${role === 'admin' ? 'Admin' : 'Mentor'}! 🎉`, 'success');
      } else {
        document.getElementById('login-error').classList.add('show');
        setTimeout(() => {
          document.getElementById('login-error').classList.remove('show');
        }, 3000);
      }
    });

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
      item.addEventListener('click', () => {
        navigateTo(item.dataset.page);
        // On mobile, close sidebar after clicking nav item
        if (window.innerWidth <= 1024) {
          document.querySelector('.sidebar').classList.remove('open');
        }
      });
    });

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
      });
    }

    document.getElementById('nav-add-school').addEventListener('click', () => openModal('modal-add-school'));
    document.getElementById('btn-logout').addEventListener('click', logout);

    // Modal close buttons
    document.querySelectorAll('[data-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.modal));
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // ── Inline Batch: Add Row ──
    document.getElementById('btn-add-inline-batch').addEventListener('click', addInlineBatchRow);

    // ── Save School (with inline batches) ──
    document.getElementById('btn-save-school').addEventListener('click', async () => {
      const name = document.getElementById('school-name').value.trim();
      const date = document.getElementById('school-date').value;
      const principal = document.getElementById('school-principal').value.trim();
      const email = document.getElementById('school-email').value.trim();

      if (!name) { showToast('Please enter school name', 'error'); return; }
      if (!date) { showToast('Please select a date', 'error'); return; }

      const batches = getInlineBatches();

      showLoading();
      try {
        const school = await api('/schools', {
          method: 'POST',
          body: { name, date, principal, email, batches },
        });
        hideLoading();
        closeModal('modal-add-school');
        showToast(`${name} added successfully! 🎉`, 'success');
        navigateTo('school-detail', school.id);
      } catch (err) {
        hideLoading();
        showToast('Failed to save school: ' + err.message, 'error');
      }
    });

    // ── Save Batch (from school detail view) ──
    document.getElementById('btn-save-batch').addEventListener('click', async () => {
      if (!currentSchoolId) return;

      const name = document.getElementById('batch-name').value.trim();
      const startTime = document.getElementById('batch-start').value;
      const endTime = document.getElementById('batch-end').value;

      if (!name) { showToast('Please enter batch name', 'error'); return; }
      if (!startTime || !endTime) { showToast('Please set start and end times', 'error'); return; }

      try {
        await api('/schools/' + currentSchoolId + '/batches', {
          method: 'POST',
          body: { name, startTime, endTime },
        });
        closeModal('modal-add-batch');
        showToast(`${name} added! 📦`, 'success');
        renderSchoolDetail(currentSchoolId, 'batches');
      } catch (err) {
        showToast('Failed to add batch', 'error');
      }
    });
  }

  // ============================================================
  //  HELPERS
  // ============================================================
  function updateDate() {
    const dateEl = document.querySelector('#header-date span');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    }
  }

  function updateBadge(count) {
    const badge = document.getElementById('school-count-badge');
    if (badge) badge.textContent = count;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0]);
    const min = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${min} ${ampm}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  //  TOAST NOTIFICATIONS
  // ============================================================
  function showToast(message, type = 'info') {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── Start the app ──
  document.addEventListener('DOMContentLoaded', init);
})();
