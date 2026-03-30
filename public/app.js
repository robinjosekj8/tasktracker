document.addEventListener('DOMContentLoaded', () => {
    let allTasks = [];
    let currentAssigneeFilter = 'all';
    let currentStatusFilters = new Set();
    let searchQuery = '';

    const taskContainer = document.getElementById('task-container');
    const searchInput = document.getElementById('search-input');
    const totalTasksEl = document.getElementById('total-tasks');
    const doneTasksEl = document.getElementById('done-tasks');
    const statusFiltersContainer = document.getElementById('status-filters');

    let hasInitializedFilters = false;

    async function fetchTasks() {
        try {
            const response = await fetch('/api/tasks');
            const data = await response.json();
            
            allTasks = data.filter(t => t['Task Description'] || t['Odoo ID'] || t['Assigned Tech']);
            
            
            initStatusFilters();
            hasInitializedFilters = true;
            
            // We should regenerate worker filters every fetch to update the live efficiency!
            initWorkerFilters();
            
            renderTasks();
            updateStats();
        } catch (error) {
            console.error('Error fetching tasks:', error);
            taskContainer.innerHTML = '<div class="loading">Failed to load tasks. Verify server is running.</div>';
        }
    }

    function initStatusFilters() {
        const statusCounts = {};
        allTasks.forEach(t => {
            const status = t['Status']?.trim();
            if (status) {
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            }
        });

        const statuses = Object.keys(statusCounts);

        if (!hasInitializedFilters) {
            statuses.forEach(status => currentStatusFilters.add(status));
        }

        statusFiltersContainer.innerHTML = statuses.map(status => {
            const isChecked = currentStatusFilters.has(status) ? 'checked' : '';
            return `
                <label class="filter-label" style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <span style="display: flex; align-items: center; gap: 0.8rem;">
                        <input type="checkbox" ${isChecked} value="${status}" class="status-cb">
                        ${status}
                    </span>
                    <span class="status-badge-count" data-status="${status}" style="background: rgba(255,255,255,0.1); padding: 0.1rem 0.5rem; border-radius: 1rem; font-size: 0.75rem; cursor: pointer;">${statusCounts[status]}</span>
                </label>
            `;
        }).join('');

        document.querySelectorAll('.status-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    currentStatusFilters.add(e.target.value);
                } else {
                    currentStatusFilters.delete(e.target.value);
                }
                renderTasks();
            });
        });

        document.querySelectorAll('.status-badge-count').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent label click from toggling checkbox
                const targetStatus = e.currentTarget.getAttribute('data-status');
                
                currentStatusFilters.clear();
                currentStatusFilters.add(targetStatus);
                
                document.querySelectorAll('.status-cb').forEach(cb => {
                    cb.checked = (cb.value === targetStatus);
                });
                
                renderTasks();
            });
        });
    }

    function initModalEvents() {
        const modal = document.getElementById('task-modal');
        const closeBtn = document.querySelector('.close-modal');
        
        closeBtn.onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if(e.target === modal) modal.style.display = 'none'; };
        
        // Add click events to tasks
        document.querySelectorAll('.task-card').forEach(card => {
            card.onclick = () => {
                const taskId = card.dataset.id;
                const task = allTasks.find(t => t['Odoo ID'] == taskId);
                if (task) openTaskModal(task);
            };
            card.style.cursor = 'pointer';
        });
    }

    async function openTaskModal(task) {
        const modal = document.getElementById('task-modal');
        const title = document.getElementById('modal-title');
        const desc = document.getElementById('modal-description');
        const logs = document.getElementById('modal-logs');
        
        title.innerHTML = `[${task['Odoo ID']}] ${task['Task Description']}`;
        desc.innerHTML = task['Full Description'] || '<p style="opacity: 0.5;">No detailed description available for this task.</p>';
        logs.innerHTML = '<div class="loading-logs">Loading live Odoo messages...</div>';
        
        modal.style.display = 'block';
        
        // Fetch logs
        try {
            const res = await fetch(`/api/task-logs/${task['Odoo ID']}`);
            const data = await res.json();
            
            if (!data.length) {
                logs.innerHTML = '<div class="loading-logs">No logs found for this task.</div>';
                return;
            }
            
            logs.innerHTML = data.map(log => {
                const date = new Date(log.date).toLocaleString();
                const author = log.author_id ? log.author_id[1] : 'System';
                // Remove HTML tags from Odoo body if needed or keep them
                return `
                    <div class="log-item">
                        <div class="log-header">
                            <span style="font-weight: 600; color: #fff;">${author}</span>
                            <span>${date}</span>
                        </div>
                        <div class="log-body">${log.body}</div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            logs.innerHTML = '<div class="loading-logs" style="color: #fca5a5;">Failed to load live logs from Odoo.</div>';
        }
    }

    function renderTasks() {
        let filteredTasks = allTasks.filter(task => {
            const assignedTech = task['Assigned Tech'] || '';
            const passAssignee = currentAssigneeFilter === 'all' || assignedTech.includes(currentAssigneeFilter);
            
            const status = task['Status']?.trim();
            const passStatus = !status || currentStatusFilters.has(status);

            const searchTerms = Object.values(task).join(' ').toLowerCase();
            const passSearch = searchTerms.includes(searchQuery.toLowerCase());

            return passAssignee && passStatus && passSearch;
        });

        if (filteredTasks.length === 0) {
            taskContainer.innerHTML = '<div class="loading">No tasks found matching your filters.</div>';
            return;
        }

        taskContainer.innerHTML = filteredTasks.map(task => createTaskCard(task)).join('');
        document.querySelectorAll('.task-card').forEach((card, i) => {
            card.style.animation = `fadeInUp 0.4s ease forwards ${i * 0.05}s`;
            card.style.opacity = '0';
        });
    }

    function createTaskCard(task) {
        const id = task['Odoo ID'] || 'N/A';
        const title = task['Task Description'] || 'Untitled Task';
        const site = task['Site '] || task['Site'] || 'N/A';
        const rawStatus = task['Status']?.trim() || 'Unknown';
        const actionDate = task['Date'] || 'N/A';
        const plannedDate = task['planned Date'] || 'N/A';
        const assignee = task['Assigned Tech'] || 'Unassigned';
        const priority = task['Priority'] || 'Normal';
        
        let statusClass = 'status-planned';
        let badgeClass = 'status-badge-planned';
        
        switch(rawStatus.toLowerCase()) {
            case 'done': statusClass = 'status-done'; badgeClass = 'status-badge-done'; break;
            case 'in progress': statusClass = 'status-in-progress'; badgeClass = 'status-badge-in-progress'; break;
            case 'warranty': statusClass = 'status-warranty'; badgeClass = 'status-badge-warranty'; break;
            case 'waiting spare parts':
            case 'pending': statusClass = 'status-waiting'; badgeClass = 'status-badge-waiting'; break;
        }

        const assigneeNames = assignee.split(/[, ]+/).filter(Boolean);
        let initials = assigneeNames[0]?.[0] || 'U';
        if (assigneeNames[1]) initials += assigneeNames[1][0];
        initials = initials.substring(0, 2).toUpperCase();

        return `
            <div class="task-card ${statusClass}" data-id="${id}">
                <div class="task-header">
                    <span class="task-id">${id}</span>
                    <span class="task-status ${badgeClass}">${rawStatus}</span>
                </div>
                <h3 class="task-title">${title}</h3>
                <div class="task-meta" style="flex-wrap: wrap;">
                    <div class="meta-item" style="width: 100%; margin-bottom: 0.2rem;">
                        <span class="meta-icon">📍</span> ${site}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                        <div class="meta-item">
                            <span class="meta-icon">📅</span> <strong>Date:</strong>&nbsp;${actionDate}
                        </div>
                        <div class="meta-item">
                            <span class="meta-icon">🗓️</span> <strong>Planned:</strong>&nbsp;${plannedDate}
                        </div>
                    </div>
                </div>
                <div class="task-footer">
                    <div class="assignee">
                        <div class="avatar">${initials}</div>
                        <span class="assignee-name">${assignee}</span>
                    </div>
                    <span class="priority ${priority.toLowerCase()}">${priority}</span>
                </div>
            </div>
        `;
    }

    function updateStats() {
        totalTasksEl.textContent = allTasks.length;
        doneTasksEl.textContent = allTasks.filter(t => {
            const status = t['Status']?.trim().toLowerCase();
            return status === 'done' || status === 'warranty' || status === 'waiting spare parts';
        }).length;
    }

    function initWorkerFilters() {
        const workerNav = document.getElementById('worker-nav');
        if (!workerNav) return;

        const workersMap = new Map();
        
        allTasks.forEach(task => {
            const rawAssignees = task['Assigned Tech'];
            if (!rawAssignees || rawAssignees.trim() === '') return;
            const status = (task['Status'] || '').trim().toLowerCase();
            const isDone = status === 'done' || status === 'warranty' || status === 'waiting spare parts';
            
            const assignees = rawAssignees.split(/[,&]+/).map(a => a.trim()).filter(Boolean);
            
            assignees.forEach(workerName => {
                if (!workersMap.has(workerName)) {
                    workersMap.set(workerName, { name: workerName, assigned: 0, done: 0 });
                }
                const w = workersMap.get(workerName);
                w.assigned += 1;
                if (isDone) w.done += 1;
            });
        });
        
        const workers = Array.from(workersMap.values()).map(w => {
            w.eff = w.assigned ? Math.round((w.done / w.assigned) * 100) : 0;
            return w;
        }).sort((a,b) => b.assigned - a.assigned);

        workerNav.innerHTML = `
            <a href="#" class="${currentAssigneeFilter === 'all' ? 'active' : ''}" data-filter="all">All Tasks</a>
        ` + workers.map(w => `
            <a href="#" class="${currentAssigneeFilter === w.name ? 'active' : ''}" data-filter="${w.name}">
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <span>${w.name}</span>
                    <span style="color: ${w.eff >= 80 ? 'var(--status-done)' : (w.eff >= 50 ? 'var(--status-progress)' : 'var(--status-waiting)')}; font-size: 0.75rem; font-weight: 700;">${w.eff}%</span>
                </div>
            </a>
        `).join('');

        const newNavLinks = workerNav.querySelectorAll('a');
        newNavLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                newNavLinks.forEach(l => l.classList.remove('active'));
                
                // e.currentTarget handles clicks on child elements like the inner <div>
                e.currentTarget.classList.add('active');
                currentAssigneeFilter = e.currentTarget.getAttribute('data-filter');
                renderTasks();
            });
        });
    }

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTasks();
    });

    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    fetchTasks();

    // Auto-refresh tasks every 5 minutes
    setInterval(fetchTasks, 5 * 60 * 1000);
});
