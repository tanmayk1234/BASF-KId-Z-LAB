/* ============================================================
   BASF Kids' Lab Dashboard — Application Logic
   Now powered by Neon Postgres via Express API
   ============================================================ */

(function () {
  'use strict';

  // ── Constants ──
  const API_BASE = '/api';
  const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin123' };
  const SESSION_KEY = 'basf_kidslab_session';

  // ── State ──
  let currentPage = 'overview';
  let currentSchoolId = null;

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
    createBubbles();

    setTimeout(() => {
      document.getElementById('splash-basf').classList.add('animate-in');
    }, 300);
    setTimeout(() => {
      document.getElementById('splash-divider').classList.add('animate-in');
    }, 600);
    setTimeout(() => {
      document.getElementById('splash-kapse').classList.add('animate-in');
    }, 800);
    setTimeout(() => {
      document.getElementById('splash-divider2').classList.add('animate-in');
    }, 1000);
    setTimeout(() => {
      document.getElementById('splash-mvp').classList.add('animate-in');
    }, 1200);
    setTimeout(() => {
      document.getElementById('splash-title').classList.add('animate-in');
    }, 1500);
    setTimeout(() => {
      document.getElementById('splash-loading').classList.add('animate-in');
    }, 1800);

    setTimeout(() => {
      splashScreen.classList.add('fade-out');
      setTimeout(() => {
        splashScreen.style.display = 'none';
        if (isLoggedIn()) {
          showDashboard();
        } else {
          showLogin();
        }
      }, 800);
    }, 4000);
  }

  function createBubbles() {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const bubble = document.createElement('div');
      bubble.classList.add('bubble');
      const size = Math.random() * 60 + 20;
      bubble.style.width = size + 'px';
      bubble.style.height = size + 'px';
      bubble.style.left = Math.random() * 100 + '%';
      bubble.style.animationDuration = Math.random() * 10 + 8 + 's';
      bubble.style.animationDelay = Math.random() * 5 + 's';
      splashScreen.appendChild(bubble);
    }
  }

  // ============================================================
  //  AUTHENTICATION
  // ============================================================
  function isLoggedIn() {
    return localStorage.getItem(SESSION_KEY) === 'true';
  }

  function login(username, password) {
    if (
      username === ADMIN_CREDENTIALS.username &&
      password === ADMIN_CREDENTIALS.password
    ) {
      localStorage.setItem(SESSION_KEY, 'true');
      return true;
    }
    return false;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
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
    navigateTo('overview');
  }

  // ============================================================
  //  NAVIGATION
  // ============================================================
  function navigateTo(page, schoolId) {
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
          <div class="stat-card red">
            <div class="stat-icon red">❌</div>
            <div class="stat-info">
              <div class="stat-value animate-count">${stats.totalAbsent}</div>
              <div class="stat-label">Students Absent</div>
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
    const absent = school.absentCount || 0;
    const batchCount = school.batchCount || 0;
    const hasConsent = school.hasConsentForm;
    const hasAttendance = school.hasAttendanceSheet;

    return `
      <div class="school-card" data-school-id="${school.id}">
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
                <span class="mini-value">${present + absent}</span>
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
            <div class="school-mini-stat">
              <span class="mini-icon">❌</span>
              <div class="mini-info">
                <span class="mini-value" style="color: var(--danger);">${absent}</span>
                <span class="mini-label">Absent</span>
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
      const absent = school.absentCount || 0;

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
          ${school.consentForm ? `
            <div class="uploaded-file">
              <span class="file-icon">📄</span>
              <div class="file-info">
                <div class="file-name">${escapeHtml(school.consentFormName || 'consent_form.pdf')}</div>
                <div class="file-size">Uploaded successfully</div>
              </div>
              <div class="file-actions">
                <button class="btn btn-secondary btn-sm" id="btn-view-consent">👁️ View</button>
                <button class="btn btn-danger btn-sm" id="btn-delete-consent">🗑️ Remove</button>
              </div>
            </div>
          ` : ''}
          <div class="upload-zone" id="consent-upload-zone" ${school.consentForm ? 'style="margin-top: 1.5rem;"' : ''}>
            <div class="upload-icon">📤</div>
            <h4>${school.consentForm ? 'Replace Consent Form' : 'Upload Consent Form'}</h4>
            <p>Drag & drop your scanned consent form PDF here, or <span class="browse-link">browse files</span></p>
            <input type="file" id="consent-file-input" accept=".pdf" style="display: none;" />
          </div>
        </div>

        <!-- Tab: Attendance -->
        <div class="tab-content ${activeTab === 'attendance' ? 'active' : ''}" id="tab-attendance">
          <div class="section-header"><h2>Attendance Sheet</h2></div>
          ${school.attendanceSheet ? `
            <div class="uploaded-file">
              <span class="file-icon">📋</span>
              <div class="file-info">
                <div class="file-name">${escapeHtml(school.attendanceSheetName || 'attendance.pdf')}</div>
                <div class="file-size">Uploaded successfully</div>
              </div>
              <div class="file-actions">
                <button class="btn btn-secondary btn-sm" id="btn-view-attendance">👁️ View</button>
                <button class="btn btn-danger btn-sm" id="btn-delete-attendance">🗑️ Remove</button>
              </div>
            </div>
          ` : ''}
          <div class="upload-zone" id="attendance-upload-zone" ${school.attendanceSheet ? 'style="margin-top: 1.5rem;"' : ''}>
            <div class="upload-icon">📤</div>
            <h4>${school.attendanceSheet ? 'Replace Attendance Sheet' : 'Upload Attendance Sheet'}</h4>
            <p>Drag & drop your scanned attendance sheet PDF here, or <span class="browse-link">browse files</span></p>
            <input type="file" id="attendance-file-input" accept=".pdf" style="display: none;" />
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
            <div class="count-card absent">
              <div class="count-icon">❌</div>
              <div class="count-value">${absent}</div>
              <div class="count-label">Students Absent</div>
              <div class="count-input-group">
                <input type="number" class="count-input" id="input-absent" value="${absent}" min="0" placeholder="0" />
                <button class="btn btn-danger btn-sm" id="btn-save-absent">Save</button>
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
      setupFileUpload('consent-upload-zone', 'consent-file-input', async (fileData, fileName) => {
        showLoading();
        try {
          await api('/schools/' + schoolId + '/consent', {
            method: 'PUT',
            body: { fileData, fileName },
          });
          hideLoading();
          showToast('Consent form uploaded!', 'success');
          renderSchoolDetail(schoolId, 'consent');
        } catch (err) {
          hideLoading();
          showToast('Failed to upload', 'error');
        }
      });

      // View / Delete consent
      const viewConsentBtn = document.getElementById('btn-view-consent');
      if (viewConsentBtn) {
        viewConsentBtn.addEventListener('click', () => openPdfViewer(school.consentForm, school.consentFormName));
      }
      const deleteConsentBtn = document.getElementById('btn-delete-consent');
      if (deleteConsentBtn) {
        deleteConsentBtn.addEventListener('click', async () => {
          try {
            await api('/schools/' + schoolId + '/consent', { method: 'DELETE' });
            showToast('Consent form removed', 'success');
            renderSchoolDetail(schoolId, 'consent');
          } catch (err) {
            showToast('Failed to remove', 'error');
          }
        });
      }

      // Attendance Sheet Upload
      setupFileUpload('attendance-upload-zone', 'attendance-file-input', async (fileData, fileName) => {
        showLoading();
        try {
          await api('/schools/' + schoolId + '/attendance', {
            method: 'PUT',
            body: { fileData, fileName },
          });
          hideLoading();
          showToast('Attendance sheet uploaded!', 'success');
          renderSchoolDetail(schoolId, 'attendance');
        } catch (err) {
          hideLoading();
          showToast('Failed to upload', 'error');
        }
      });

      // View / Delete attendance
      const viewAttBtn = document.getElementById('btn-view-attendance');
      if (viewAttBtn) {
        viewAttBtn.addEventListener('click', () => openPdfViewer(school.attendanceSheet, school.attendanceSheetName));
      }
      const deleteAttBtn = document.getElementById('btn-delete-attendance');
      if (deleteAttBtn) {
        deleteAttBtn.addEventListener('click', async () => {
          try {
            await api('/schools/' + schoolId + '/attendance', { method: 'DELETE' });
            showToast('Attendance sheet removed', 'success');
            renderSchoolDetail(schoolId, 'attendance');
          } catch (err) {
            showToast('Failed to remove', 'error');
          }
        });
      }

      // Student Count Save
      const savePresentBtn = document.getElementById('btn-save-present');
      if (savePresentBtn) {
        savePresentBtn.addEventListener('click', async () => {
          const presentVal = parseInt(document.getElementById('input-present').value) || 0;
          const absentVal = parseInt(document.getElementById('input-absent').value) || 0;
          try {
            await api('/schools/' + schoolId + '/counts', {
              method: 'PUT',
              body: { presentCount: presentVal, absentCount: absentVal },
            });
            showToast(`Present count updated to ${presentVal}`, 'success');
            renderSchoolDetail(schoolId, 'stats');
          } catch (err) {
            showToast('Failed to save', 'error');
          }
        });
      }

      const saveAbsentBtn = document.getElementById('btn-save-absent');
      if (saveAbsentBtn) {
        saveAbsentBtn.addEventListener('click', async () => {
          const presentVal = parseInt(document.getElementById('input-present').value) || 0;
          const absentVal = parseInt(document.getElementById('input-absent').value) || 0;
          try {
            await api('/schools/' + schoolId + '/counts', {
              method: 'PUT',
              body: { presentCount: presentVal, absentCount: absentVal },
            });
            showToast(`Absent count updated to ${absentVal}`, 'success');
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

  // ============================================================
  //  FILE UPLOAD HANDLER
  // ============================================================
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
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file, onUpload);
    });

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) processFile(file, onUpload);
    });
  }

  function processFile(file, onUpload) {
    if (file.type !== 'application/pdf') {
      showToast('Please upload a PDF file only', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be less than 10MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUpload(reader.result, file.name);
    reader.readAsDataURL(file);
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
  //  EVENT LISTENERS
  // ============================================================
  function setupEventListeners() {
    // Login Form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      if (login(username, password)) {
        showDashboard();
        showToast('Welcome, Admin! 🎉', 'success');
      } else {
        document.getElementById('login-error').classList.add('show');
        setTimeout(() => {
          document.getElementById('login-error').classList.remove('show');
        }, 3000);
      }
    });

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
      item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

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
