// Helper function to get status chip HTML
function getStatusChip(status) {
  const statusLower = (status || '').toLowerCase();
  if (statusLower === 'completed') {
    return '<span class="status-chip status-success">✓ Completed</span>';
  } else if (statusLower === 'failed') {
    return '<span class="status-chip status-error">✗ Failed</span>';
  } else if (statusLower === 'processing') {
    return '<span class="status-chip status-warning">⟳ Processing</span>';
  }
  return `<span class="status-chip">${status || 'Unknown'}</span>`;
}

// Helper to format milliseconds to "Xm Ys"
function formatMs(ms) {
  if (!ms || ms < 1000) return `< 1s`;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// NEW HELPER for formatting total time
function formatTotalMs(ms) {
  if (!ms || ms < 1000) return `0m`;
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);

  const hours = totalHours;
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Helper to format date and time accurately - uses browser's local timezone
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    // Parse the date string - handles ISO strings, SQLite DATETIME, and Unix timestamps
    let date;
    
    // If it's a number (Unix timestamp in seconds or milliseconds)
    if (typeof dateString === 'number') {
      date = new Date(dateString > 1000000000000 ? dateString : dateString * 1000);
    } else {
      // SQLite DATETIME format is typically "YYYY-MM-DD HH:MM:SS" (stored as UTC but without timezone marker)
      // Check if it matches SQLite DATETIME format
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateString)) {
        // SQLite DATETIME format - treat as UTC by adding 'Z', then browser will convert to local time
        // This ensures accurate display regardless of server timezone
        const sqliteDate = dateString.replace(' ', 'T') + 'Z';
        date = new Date(sqliteDate);
      } else if (typeof dateString === 'string' && dateString.includes('T')) {
        // ISO format - if it doesn't have timezone, treat as UTC
        if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
          date = new Date(dateString + 'Z');
        } else {
          date = new Date(dateString);
        }
      } else {
        // Try parsing as-is (handles ISO strings with or without timezone)
        date = new Date(dateString);
      }
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return 'Invalid Date';
    }
    
    // Format using browser's local timezone automatically
    // toLocaleString uses the browser's local timezone by default
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
      // Removed timeZoneName to hide timezone abbreviation
    };
    
    // Use browser's locale to get local timezone
    return date.toLocaleString(navigator.language || 'en-US', options);
  } catch (err) {
    console.error('Error formatting date:', err, dateString);
    return 'Invalid Date';
  }
}

// Helper to format date with relative time for recent dates - uses browser's local timezone
function formatDateWithRelative(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    let date;
    
    // Parse the date string - same logic as formatDate
    if (typeof dateString === 'number') {
      date = new Date(dateString > 1000000000000 ? dateString : dateString * 1000);
    } else if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateString)) {
      // SQLite DATETIME format - treat as UTC, browser converts to local
      const sqliteDate = dateString.replace(' ', 'T') + 'Z';
      date = new Date(sqliteDate);
    } else if (typeof dateString === 'string' && dateString.includes('T')) {
      // ISO format - if it doesn't have timezone, treat as UTC
      if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
        date = new Date(dateString + 'Z');
      } else {
        date = new Date(dateString);
      }
    } else {
      // Try parsing as-is
      date = new Date(dateString);
    }
    
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return 'Invalid Date';
    }
    
    // Use browser's current time for comparison (local timezone)
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // Handle negative differences (future dates) - should not happen but handle gracefully
    if (diffMs < 0) {
      return formatDate(dateString);
    }
    
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    // Show relative time for dates within the last 24 hours
    if (diffSeconds < 60) {
      return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    
    // For older dates, show full formatted date using browser's local timezone
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
      // Removed timeZoneName to hide timezone abbreviation
    };
    
    return date.toLocaleString(navigator.language || 'en-US', options);
  } catch (err) {
    console.error('Error formatting date:', err, dateString);
    return 'Invalid Date';
  }
}

// Helper function to safely set text content
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  } else {
    // Log an error if the element isn't found
    console.error(`Admin script could not find element with ID: #${id}`);
  }
}

// Wait for the entire page to load before running any code
document.addEventListener('DOMContentLoaded', () => {

  // --- ALL ELEMENTS ARE NOW DEFINED *INSIDE* THE LISTENER ---
  const historyModal = document.getElementById('historyModal');
  const closeHistoryModalBtn = document.getElementById('closeHistoryModal');
  const historyModalTitle = document.getElementById('historyModalTitle');
  const historyModalUser = document.getElementById('historyModalUser');
  const historyModalTableBody = document.getElementById('historyModalTableBody');
  const loginsTableBody = document.getElementById('table-recent-logins');
  const jobsTable = document.getElementById('table-recent-jobs');
  const refreshBtn = document.getElementById('refresh-btn');

  // --- LOAD STATS FUNCTION ---
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) {
        throw new Error(`Failed to load stats (${res.status}). Are you an admin?`);
      }
      const data = await res.json();

      // 1. Populate Stat Cards (using the new "null-safe" helper)
      safeSetText('stat-total-users', data.users?.total ?? 0);
      safeSetText('stat-total-logins', data.logins?.total ?? 0);
      safeSetText('stat-completed-jobs', data.jobs?.completed ?? 0);
      safeSetText('stat-failed-jobs', data.jobs?.failed ?? 0);
      safeSetText('stat-processing-jobs', data.jobs?.processing ?? 0);
      safeSetText('stat-avg-time', formatMs(data.jobs?.avg_time_ms ?? 0));
      safeSetText('stat-total-time', formatTotalMs(data.jobs?.total_time_ms ?? 0));

      // 2. Populate Recent Jobs Table
      if (jobsTable) {
        const jobs = data.jobs?.recent || [];
        if (jobs.length === 0) {
          jobsTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 24px;">No jobs found</td></tr>';
        } else {
          jobsTable.innerHTML = jobs.map(job => {
            const jobId = (job.job_id || '').replace(/"/g, '&quot;');
            const analyzedByName = (job.analyzed_by_name || 'Unknown').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const jobName = (job.job_name || 'Untitled').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const errorMsg = (job.error_message || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const statusChip = getStatusChip(job.status);
            const timeDisplay = job.status === 'processing' ? 'In Progress' : formatMs(job.time_taken_ms);
            
            return `
              <tr data-job-id="${jobId}" data-status="${(job.status || '').toLowerCase()}" class="${job.status === 'processing' ? 'processing-row' : ''}">
                <td>${analyzedByName}</td>
                <td>${jobName}</td>
                <td>${statusChip}</td>
                <td>${timeDisplay}</td>
                <td>${errorMsg}</td>
                <td class="action-col">
                  <div class="admin-table-menu">
                    <button class="action-menu-btn" data-job-id="${jobId}" title="Actions">⋮</button>
                    <div class="admin-menu-dropdown hidden" data-job-id="${jobId}">
                      <button class="admin-menu-item delete delete-job-btn" data-job-id="${jobId}">
                        <span>🗑️</span> Delete Job
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      } else {
        console.error('Admin script could not find element with ID: #table-recent-jobs');
      }

      // 3. Populate Recent Logins Table
      if (loginsTableBody) {
        const logins = data.logins?.recent || [];
        if (logins.length === 0) {
          loginsTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--muted); padding: 24px;">No logins found</td></tr>';
        } else {
          loginsTableBody.innerHTML = logins.map(login => {
            // Escape HTML and prepare data attributes
            const googleId = (login.google_id || '').replace(/"/g, '&quot;');
            const email = (login.email || '').replace(/"/g, '&quot;');
            const displayName = (login.display_name || 'Unknown').replace(/"/g, '&quot;');
            // Parse and format timestamp - ensure we're handling the date correctly
            let timestamp = 'N/A';
            if (login.timestamp) {
              timestamp = formatDateWithRelative(login.timestamp);
            }
            
            return `
              <tr class="clickable-user-row" data-user-id="${googleId}" data-user-email="${email}" data-user-name="${displayName}" title="Click to view all logins for ${email}">
                <td>${displayName}</td>
                <td>${email}</td>
                <td>${timestamp}</td>
              </tr>
            `;
          }).join('');
        }
      } else {
        console.error('Admin script could not find element with ID: #table-recent-logins');
      }

    } catch (err) {
      // This is the error message you are seeing.
      console.error("Error in loadStats:", err);
      // We check if document.body exists before trying to modify it
      if (document.body) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'panel glass error-panel';
        errorDiv.style.marginTop = '24px';
        errorDiv.innerHTML = `
          <h3 style="color: var(--err); margin: 0 0 12px;">⚠️ Error Loading Dashboard</h3>
          <p style="color: var(--muted); margin: 0 0 16px;">${err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <button class="btn primary" onclick="location.reload()">Retry</button>
          <a class="btn ghost" href="/" style="margin-left: 8px;">Go Home</a>
        `;
        const container = document.querySelector('.admin-container');
        if (container) {
          container.appendChild(errorDiv);
        }
      }
    }
  }

  // --- MODAL LOGIC ---

  // Show the modal
  async function showHistoryModal(google_id, userName, userEmail) {
    if (!historyModal || !historyModalTitle || !historyModalUser || !historyModalTableBody) {
      console.error('Could not find history modal elements.');
      return;
    }
    
    historyModalTitle.textContent = `Login History for ${userName}`;
    historyModalUser.textContent = userEmail;
    historyModalTableBody.innerHTML = '<tr><td>Loading...</td></tr>';
    historyModal.classList.remove('hidden');

    try {
      const res = await fetch(`/api/admin/logins/${google_id}`);
      if (!res.ok) {
        throw new Error(`Failed to load login history: ${res.status}`);
      }
      const logins = await res.json();

      if (logins.length > 0) {
        historyModalTableBody.innerHTML = logins.map(login => {
          // Ensure timestamp is properly formatted
          const formattedDate = login.timestamp ? formatDate(login.timestamp) : 'N/A';
          return `<tr><td>${formattedDate}</td></tr>`;
        }).join('');
      } else {
        historyModalTableBody.innerHTML = '<tr><td>No login history found.</td></tr>';
      }
    } catch (err) {
      historyModalTableBody.innerHTML = `<tr><td>Error: ${err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>`;
    }
  }

  // Hide the modal
  function hideHistoryModal() {
    if (historyModal) {
      historyModal.classList.add('hidden');
    }
  }

  // --- INITIALIZE ---

  // Call loadStats now that we are inside the listener
  loadStats();

  // Auto-refresh every 10 seconds to show live updates
  setInterval(() => {
    loadStats();
  }, 10000); // Refresh every 10 seconds

  // Refresh button handler
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadStats();
    });
  }

  // Attach listener to the table body for delegation
  if (loginsTableBody) {
    loginsTableBody.addEventListener('click', (e) => {
      const row = e.target.closest('.clickable-user-row');
      if (row) {
        const userId = row.dataset.userId;
        const userName = row.dataset.userName;
        const userEmail = row.dataset.userEmail;
        if (userId) {
          showHistoryModal(userId, userName, userEmail);
        } else {
          console.error('No google_id found for user:', userEmail);
        }
      }
    });
  }

  // Add close listeners for the modal
  if (closeHistoryModalBtn) {
    closeHistoryModalBtn.addEventListener('click', hideHistoryModal);
  }
  if (historyModal) {
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) {
        hideHistoryModal();
      }
    });
  }
  
  // --- CSS INJECTION ---
  const style = document.createElement('style');
  style.textContent = `
    .clickable-user-row {
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    .clickable-user-row:hover {
      background-color: var(--panel-2, rgba(12, 17, 28, 0.9));
    }
  `;
  document.head.appendChild(style);

  // --- DELETE FUNCTIONALITY ---
  
  // Toast notification function
  function showToast(msg, type = 'success') {
    let toast = document.createElement('div');
    toast.textContent = msg;
    toast.className = 'toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '12px 18px';
    toast.style.background = type === 'error' ? 'var(--err)' : 'var(--ok)';
    toast.style.color = '#06080f';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '2000';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // Event listeners for action menus and delete buttons
  if (jobsTable) {
    jobsTable.addEventListener('click', async (e) => {
      const menuBtn = e.target.closest('.action-menu-btn');
      const deleteBtn = e.target.closest('.delete-job-btn');

      // Handle opening the 3-dot menu
      if (menuBtn) {
        e.stopPropagation();
        const jobId = menuBtn.dataset.jobId;
        const dropdown = document.querySelector(`.admin-menu-dropdown[data-job-id="${jobId}"]`);
        
        if (dropdown) {
          // Close all other dropdowns
          document.querySelectorAll('.admin-menu-dropdown').forEach(d => {
            if (d !== dropdown) {
              d.classList.add('hidden');
              d.classList.remove('opens-up'); // Clear upward class from others
            }
          });

          // --- NEW DYNAMIC POSITION LOGIC (FIXED) ---
          const isOpening = dropdown.classList.contains('hidden');
          if (isOpening) {
            // Find the row and the scrolling container
            const itemRow = menuBtn.closest('tr');
            const listContainer = menuBtn.closest('.table-container');

            if (itemRow && listContainer) {
              const itemRect = itemRow.getBoundingClientRect();
              const listRect = listContainer.getBoundingClientRect();

              // Calculate space from item bottom to container bottom
              const spaceRemaining = listRect.bottom - itemRect.bottom;
              
              // Estimate dropdown height (1 item * ~36px + padding)
              const dropdownHeightEstimate = 60; // A safe estimate for one button

              if (spaceRemaining < dropdownHeightEstimate) {
                dropdown.classList.add('opens-up');
              } else {
                dropdown.classList.remove('opens-up');
              }
            } else {
              // Fallback, just remove the class
              dropdown.classList.remove('opens-up');
            }
          } else {
            // It's about to be closed, just remove the class
            dropdown.classList.remove('opens-up');
          }
          // --- END NEW LOGIC ---

          // Toggle this one
          dropdown.classList.toggle('hidden');
        }
      }

      // Handle clicking the "Delete Job" button
      if (deleteBtn) {
        e.stopPropagation();
        const jobId = deleteBtn.dataset.jobId;
        const row = deleteBtn.closest('tr');
        
        if (confirm(`Are you sure you want to permanently delete this analysis job?\n\n(Job ID: ${jobId})`)) {
          try {
            const res = await fetch(`/api/history/${jobId}`, {
              method: 'DELETE'
            });

            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.message || 'Failed to delete');
            }

            // Success
            showToast('Job deleted successfully.');
            if (row) {
              row.style.transition = 'opacity 0.3s ease';
              row.style.opacity = '0';
            }
            setTimeout(() => {
              if (row) row.remove();
              loadStats(); // Reload stats to update counts
            }, 300);

          } catch (err) {
            console.error('Delete error:', err);
            showToast(`Error: ${err.message}`, 'error');
          }
        }
        // Close the menu
        const dropdown = deleteBtn.closest('.admin-menu-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
      }
    });
  }

  // Global click to close menus
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.admin-table-menu')) {
      document.querySelectorAll('.admin-menu-dropdown').forEach(d => {
        d.classList.add('hidden');
      });
    }
  });
});
