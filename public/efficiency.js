document.addEventListener('DOMContentLoaded', () => {
    let allTasks = [];
    
    const workersContainer = document.getElementById('workers-container');
    const globalEffEl = document.getElementById('global-eff');

    async function fetchTasks() {
        try {
            const response = await fetch('/api/tasks');
            const data = await response.json();
            
            allTasks = data.filter(t => t['Task Description'] || t['Odoo ID'] || t['Assigned Tech']);
            
            calculateEfficiencies();
        } catch (error) {
            console.error('Error fetching tasks:', error);
            workersContainer.innerHTML = '<div class="loading">Failed to load tasks. Verify server is running.</div>';
            globalEffEl.textContent = 'Error';
        }
    }

    function calculateEfficiencies() {
        if (!allTasks.length) {
            workersContainer.innerHTML = '<div class="loading">No tasks found.</div>';
            return;
        }

        const workersMap = new Map();
        let totalAssigned = 0;
        let totalCompleted = 0;

        // Process all tasks
        allTasks.forEach(task => {
            const rawAssignees = task['Assigned Tech'];
            if (!rawAssignees || rawAssignees.trim() === '') return;
            
            const status = (task['Status'] || '').trim().toLowerCase();
            const isDone = status === 'done' || status === 'warranty' || status === 'waiting spare parts';
            
            const hoursStr = task['Estimated Hours'];
            const hours = parseFloat(hoursStr) || 0;
            
            const assignees = rawAssignees.split(/[,&]+/).map(a => a.trim()).filter(Boolean);
            
            assignees.forEach(workerName => {
                if (!workersMap.has(workerName)) {
                    workersMap.set(workerName, {
                        name: workerName,
                        tasksAssigned: 0,
                        tasksCompleted: 0,
                        hoursAssigned: 0,
                        hoursCompleted: 0
                    });
                }
                
                const w = workersMap.get(workerName);
                w.tasksAssigned += 1;
                w.hoursAssigned += hours;
                totalAssigned += 1;
                
                if (isDone) {
                    w.tasksCompleted += 1;
                    w.hoursCompleted += hours;
                    totalCompleted += 1;
                }
            });
        });

        // Convert to array and calculate rates
        const workers = Array.from(workersMap.values()).map(w => {
            w.taskEff = w.tasksAssigned ? Math.round((w.tasksCompleted / w.tasksAssigned) * 100) : 0;
            w.hoursEff = w.hoursAssigned ? Math.round((w.hoursCompleted / w.hoursAssigned) * 100) : 0;
            return w;
        });

        // Sort by most tasks assigned first
        workers.sort((a, b) => b.tasksAssigned - a.tasksAssigned);

        // Update Global Stats
        const globalEff = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
        globalEffEl.textContent = `${globalEff}%`;

        // Generate Insights
        const statusBreakdown = {};
        let realTotalTasks = 0;
        let realTotalDone = 0;

        allTasks.forEach(task => {
            const status = (task['Status'] || '').trim().toLowerCase();
            const originalStatus = (task['Status'] || 'Unknown').trim();
            const isDone = status === 'done' || status === 'warranty' || status === 'waiting spare parts';
            
            realTotalTasks++;
            if (!isDone) {
                statusBreakdown[originalStatus] = (statusBreakdown[originalStatus] || 0) + 1;
            } else {
                realTotalDone++;
            }
        });
        
        const insightsPanel = document.getElementById('insights-content');
        if (insightsPanel) {
            let insightsHTML = '';
            if (realTotalDone === realTotalTasks && realTotalTasks > 0) {
                insightsHTML = `<div style="color: var(--status-done); font-weight: 600;">All tasks are completed! Outstanding efficiency!</div>`;
            } else if (realTotalTasks > 0) {
                insightsHTML += `
                    <div style="margin-bottom: 1rem;">
                        <div style="font-weight: 600; color: #fff; margin-bottom: 0.5rem;">Why is the work not completed?</div>
                        <div>Currently, there are <strong style="color: #fca5a5;">${realTotalTasks - realTotalDone}</strong> tasks pending completion out of ${realTotalTasks}. The main blockers are:</div>
                        <ul style="margin-top: 0.8rem; padding-left: 1.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
                            ${Object.entries(statusBreakdown).sort((a,b) => b[1] - a[1]).map(([st, count]) => `<li><strong>${count}</strong> task(s) marked as <span style="color: #cbd5e1; font-weight: 600;">"${st}"</span></li>`).join('')}
                        </ul>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #fff; margin-bottom: 0.5rem;">What needs to improve to get better work completion rate?</div>
                        <ul style="padding-left: 1.5rem; display: flex; flex-direction: column; gap: 0.6rem; color: #cbd5e1;">
                `;
                
                let hasRec = false;
                const breakdownLower = Object.keys(statusBreakdown).map(s => s.toLowerCase());
                
                if (breakdownLower.includes('planned')) {
                    insightsHTML += `<li><strong>Accelerate Planning:</strong> Many tasks are stuck in the "Planned" phase. Improve scheduling and resource allocation to push these to the "In Progress" stage faster.</li>`;
                    hasRec = true;
                }
                if (breakdownLower.includes('in progress')) {
                    insightsHTML += `<li><strong>Finish Ongoing Work:</strong> Technicians currently have tasks "In Progress". Focus on closing out active troubleshooting and repairs before taking on new tickets.</li>`;
                    hasRec = true;
                }
                if (breakdownLower.includes('pending')) {
                    insightsHTML += `<li><strong>Clear Pending Blockers:</strong> Investigate what is causing tasks to be "Pending" (e.g., client availability, missing info) and actively resolve them.</li>`;
                    hasRec = true;
                }
                if (!hasRec) {
                    insightsHTML += `<li><strong>Review Workflows:</strong> Inspect the specific bottlenecks causing tasks to be stuck in their current open status and streamline technician turn-around time.</li>`;
                }
                insightsHTML += `</ul></div>`;
            } else {
                insightsHTML = `<div>No work data available yet to generate insights.</div>`;
            }
            insightsPanel.innerHTML = insightsHTML;
        }

        // Render worker cards
        renderWorkers(workers);
    }

    function renderWorkers(workers) {
        if (workers.length === 0) {
            workersContainer.innerHTML = '<div class="loading">No assigned workers found.</div>';
            return;
        }

        workersContainer.innerHTML = workers.map(w => {
            const names = w.name.split(' ');
            let initials = names[0][0] || 'U';
            if (names.length > 1) {
                initials += names[names.length - 1][0];
            }
            initials = initials.substring(0, 2).toUpperCase();
            
            return `
                <div class="efficiency-card">
                    <div class="worker-header">
                        <div class="worker-avatar">${initials}</div>
                        <div class="worker-name">${w.name}</div>
                    </div>
                    
                    <div class="eff-stats">
                        <div class="eff-stat-box">
                            <span class="val">${w.tasksAssigned}</span>
                            <span class="lbl">Tasks Assigned</span>
                        </div>
                        <div class="eff-stat-box">
                            <span class="val" style="color: var(--status-done);">${w.tasksCompleted}</span>
                            <span class="lbl">Tasks Done</span>
                        </div>
                    </div>
                    
                    <div style="margin-top: 0.5rem;">
                        <span class="lbl" style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Completion Rate (<span style="color:#e2e8f0; font-weight:600;">${w.taskEff}%</span>)</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${w.taskEff}%;"></div>
                        </div>
                        <div class="eff-meta">
                            <span>Total Estimated: ${w.hoursAssigned} hrs</span>
                            <span>Completed: ${w.hoursCompleted} hrs</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add animation
        document.querySelectorAll('.efficiency-card').forEach((card, i) => {
            card.style.animation = `fadeInUp 0.4s ease forwards ${i * 0.05}s`;
            card.style.opacity = '0';
        });
    }

    fetchTasks();
    setInterval(fetchTasks, 5 * 60 * 1000);
});
