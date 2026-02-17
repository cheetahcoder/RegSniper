/**
 * --- RegSniper Ultra Console v7.3 (Verified Stable Edition) ---
 * Created by CheetahCoder
 * Strategy: Async Firing with Mandatory Inter-request Delay (Global Delay).
 * Features: Smart Group Detection, Non-Blocking Pacing, Visual & API Success Tracking.
 */

(function() {
    'use strict';

    // --- Configuration State ---
    let sniperState = {
        isRunning: false,
        selectedCourses: new Set(), // Full IDs like "52103-3"
        courseNames: {}, // Mapping: "52103-3" -> "Course Title"
        targetTime: null,
        globalDelay: 1800,
        retryDelay: 16000,
        lastAttempt: {},
        logs: [],
        showLogs: false
    };

    const p2e = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    const e2p = s => s.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

    // Force English numbers and clear layout via CSS injection
    const style = document.createElement('style');
    style.innerHTML = `
        .sniper-force-en {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
            font-variant-numeric: tabular-nums !important;
            direction: ltr !important;
            unicode-bidi: isolate !important;
            text-align: left !important;
        }
        #sniper-settings-area, #sniper-settings-area * {
            direction: ltr !important;
            text-align: left !important;
        }
        #sniper-settings-area input[type="number"] {
            font-family: 'Consolas', monospace !important;
            font-size: 15px !important;
            font-weight: bold !important;
            color: #111 !important;
            text-align: center !important;
        }
        .sniper-toast {
            position: fixed;
            top: 20px;
            left: 20px;
            color: #ffffff;
            padding: 14px 22px;
            border-radius: 8px;
            z-index: 1000002;
            font-weight: bold;
            box-shadow: 0 6px 18px rgba(0,0,0,0.3);
            font-family: 'Segoe UI', Arial, sans-serif;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            min-width: 320px;
            direction: ltr !important;
            text-align: left !important;
        }
    `;
    document.head.appendChild(style);

    const getAuthToken = () => {
        const jwtRegex = /eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/;
        const priorityKeys = ['token', 'persist:root', 'auth'];
        for (const key of priorityKeys) {
            try {
                const val = localStorage.getItem(key);
                if (val) {
                    const match = val.match(jwtRegex);
                    if (match) return match[0];
                }
            } catch(e) {}
        }
        const storages = [localStorage, sessionStorage];
        for (const storage of storages) {
            for (let i = 0; i < storage.length; i++) {
                try {
                    const key = storage.key(i);
                    const val = storage.getItem(key);
                    if (!val) continue;
                    const match = val.match(jwtRegex);
                    if (match) return match[0];
                } catch(e) {}
            }
        }
        return document.cookie.match(jwtRegex)?.[0] || null;
    };

    const addLog = (msg, isError = false) => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        sniperState.logs.unshift({ time, msg, isError });
        if (sniperState.logs.length > 40) sniperState.logs.pop();
        const logDiv = document.getElementById('sniper-logs');
        if (logDiv) {
            logDiv.innerHTML = sniperState.logs.map(l => 
                `<div style="color: ${l.isError ? '#ff4d4f' : '#a6e3a1'}; margin-bottom: 4px; font-size: 11px; border-bottom: 1px solid #222; padding-bottom: 2px;">
                    <span style="color: #666; font-size: 9px;">[${l.time}]</span> ${l.msg}
                </div>`
            ).join('');
        }
    };

    const notify = (msg, type = "info") => {
        const colors = { success: "#21ba45", error: "#db2828", info: "#2185d0", warn: "#fbbd08" };
        const toast = document.createElement('div');
        toast.className = "sniper-toast";
        toast.style.background = colors[type] || colors.info;
        toast.innerHTML = `<span class="sniper-force-en">${msg}</span>`;
        const existingToasts = document.querySelectorAll('.sniper-toast');
        toast.style.top = (20 + (existingToasts.length * 75)) + "px";
        document.body.appendChild(toast);
        setTimeout(() => { 
            toast.style.opacity = '0'; 
            toast.style.transform = 'translateX(-30px)'; 
            setTimeout(() => toast.remove(), 500); 
        }, 5000);
    };

    const getFriendlyMessage = (code) => {
        const messages = {
            "REGISTER_IN_EDU": "Required: Register via EDU panel!",
            "NO_REGISTRATION_TIME": "Registration window closed.",
            "REGISTRATION_TIME_LIMIT": "Rate limit: Slow down!",
            "AUTHORIZATION": "Auth Failed: Login again!",
            "UNITS_LIMIT": "Unit limit reached.",
            "COURSE_DUPLICATE": "Already secured.",
            "NO_PERMISSION": "No permission.",
            "CAPACITY_FULL": "Course is full!",
            "OK": "Success!"
        };
        return messages[code] || `Server: ${code}`;
    };

    async function fireRequest(courseFullId, units) {
        const token = getAuthToken();
        const courseName = sniperState.courseNames[courseFullId] || courseFullId;
        
        if (!token) {
            notify("AUTH TOKEN MISSING!", "error");
            return;
        }

        const payload = {
            id: crypto.randomUUID(),
            action: "add",
            course: courseFullId, 
            units: parseInt(units) || 1
        };

        notify(`Firing: ${courseName}`, "info");
        addLog(`Sent request for ${courseName}...`);

        try {
            const response = await fetch('https://my.edu.sharif.edu/api/reg', {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            // Analyze response for success
            const isEnrolled = data.courses && data.courses.some(c => c.id === courseFullId);
            const resultStatus = data.result === "OK" || isEnrolled ? "OK" : (data.jobs?.filter(j => j.courseId === courseFullId).pop()?.result || data.result || "FAILED");

            if (resultStatus === "OK") {
                notify(`SUCCESS: ${courseName}`, "success");
                addLog(`SECURED: ${courseName}`);
            } else if (resultStatus === "AUTHORIZATION") {
                notify("Auth Error: Re-login!", "error");
                sniperState.isRunning = false;
                updateUIAfterStop();
            } else {
                const msg = getFriendlyMessage(resultStatus);
                notify(`${courseName}: ${msg}`, resultStatus.includes("LIMIT") ? "warn" : "error");
                addLog(`${courseName}: ${resultStatus}`, true);
                
                if (resultStatus === "REGISTRATION_TIME_LIMIT") {
                    sniperState.lastAttempt[courseFullId] = Date.now() - (sniperState.retryDelay - 1000);
                }
            }
        } catch (e) {
            addLog(`Network failed for ${courseName}`, true);
        }
    }

    const injectCheckboxes = () => {
        const rows = document.querySelectorAll('tr');
        let injectedCount = 0;
        
        rows.forEach(row => {
            if (row.querySelector('.sniper-select')) return;

            const cells = Array.from(row.querySelectorAll('td'));
            let foundCode = "", foundGroup = "", foundName = "";

            for (let i = 0; i < cells.length; i++) {
                const cellText = cells[i].innerText.trim();
                const codeOnlyMatch = cellText.match(/^[0-9۰-۹]{5}$/);
                if (codeOnlyMatch) {
                    foundCode = p2e(codeOnlyMatch[0]);
                    if (cells[i + 1]) foundGroup = p2e(cells[i + 1].innerText.trim());
                    for (let j = i + 2; j < cells.length; j++) {
                        const potentialName = cells[j].innerText.trim();
                        if (potentialName && !/^[0-9۰-۹]$/.test(potentialName)) {
                            foundName = potentialName;
                            break;
                        }
                    }
                    break;
                }
            }

            if (foundCode) {
                const group = foundGroup || "1";
                const fullId = foundCode + "-" + group;
                if (foundCode.length > 6) return;

                sniperState.courseNames[fullId] = foundName || foundCode;

                const td = document.createElement('td');
                td.style = "text-align: center; padding: 10px; border-right: 1px solid #eee; width: 50px;";
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'sniper-select';
                cb.style = "width: 18px; height: 18px; cursor: pointer;";
                cb.dataset.fullId = fullId;

                cb.onchange = () => {
                    if (cb.checked) {
                        sniperState.selectedCourses.add(fullId);
                        row.style.background = "rgba(33, 133, 208, 0.1)";
                    } else {
                        sniperState.selectedCourses.delete(fullId);
                        row.style.background = "none";
                    }
                    updateStatus();
                };

                td.appendChild(cb);
                row.prepend(td);
                injectedCount++;
            }
        });

        document.querySelectorAll('table').forEach(table => {
            const firstRow = table.querySelector('tr');
            if (firstRow && !table.querySelector('.sniper-h-cell')) {
                const th = document.createElement('th');
                th.className = 'sniper-h-cell';
                th.innerText = 'Snipe';
                th.style = "color: #2185d0; text-align: center; padding: 10px; width: 60px;";
                firstRow.prepend(th);
            }
        });
        if (injectedCount > 0) notify(`${injectedCount} courses detected.`, "info");
    };

    const createIntegratedUI = () => {
        const menu = document.querySelector('.ui.menu');
        if (!menu || document.getElementById('sniper-menu-item')) return;

        const menuItem = document.createElement('a');
        menuItem.id = 'sniper-menu-item';
        menuItem.className = 'item';
        menuItem.style.color = '#2185d0';
        menuItem.style.fontWeight = 'bold';
        menuItem.innerHTML = `<i class="crosshairs icon"></i> Sniper`;
        menu.appendChild(menuItem);

        const settingsSection = document.createElement('div');
        settingsSection.id = 'sniper-settings-area';
        settingsSection.style = `display: none; background: #ffffff; border: 1px solid #d4d4d5; 
                                border-radius: 8px; margin-bottom: 1.5em; padding: 1.5em; 
                                position: relative; box-shadow: 0 2px 15px rgba(0,0,0,0.1);`;

        settingsSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 25px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 220px;">
                    <h4 style="color: #1b1c1d; margin-bottom: 15px;">Smart Targeting</h4>
                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
                         <button id="btn-start" style="background: #2185d0; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s;">START SNIPER</button>
                         <button id="btn-inject" style="background: #f0f0f0; color: #333; border: 1px solid #ccc; padding: 10px 15px; border-radius: 6px; cursor: pointer;">Rescan</button>
                    </div>
                    <div class="sniper-force-en" style="font-size: 13px;">
                        Status: <span id="sniper-status-text" style="color: #db2828; font-weight: bold;">● IDLE</span>
                    </div>
                </div>

                <div style="flex: 1; min-width: 220px;">
                    <h4 style="color: #1b1c1d; margin-bottom: 15px;">Configuration</h4>
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <input type="number" id="s-h" value="08" min="0" max="23" class="sniper-force-en">
                        <input type="number" id="s-m" value="00" min="0" max="59" class="sniper-force-en">
                        <input type="number" id="s-s" value="00" min="0" max="59" class="sniper-force-en">
                        <span style="font-size: 11px; align-self: center; color: #888;">(Start Time)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <input type="range" id="s-gd" min="1000" max="5000" value="1800" style="flex: 1; cursor: pointer;">
                        <span class="sniper-force-en" style="font-size: 12px; white-space: nowrap; width: 85px;">Delay: <b id="val-gd">1800</b>ms</span>
                    </div>
                </div>

                <div style="flex: 1.5; min-width: 300px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="color: #1b1c1d; margin: 0;">Queue & Paced Activity</h4>
                        <label style="font-size: 11px; cursor: pointer; color: #666;">
                            <input type="checkbox" id="toggle-logs"> Show Logs
                        </label>
                    </div>
                    <div id="sniper-course-list" class="sniper-force-en" style="background: #f9f9f9; border: 1px solid #eee; padding: 10px; border-radius: 6px; font-size: 12px; color: #555; margin-bottom: 8px; min-height: 30px; line-height: 1.4;">
                        No courses selected.
                    </div>
                    <div id="sniper-logs-container" style="display: none;">
                        <div id="sniper-logs" class="sniper-force-en" style="background: #1b1c1d; color: #eee; padding: 12px; border-radius: 6px; height: 140px; overflow-y: auto;">
                            System ready.
                        </div>
                    </div>
                </div>
            </div>
        `;

        menu.parentNode.insertBefore(settingsSection, menu.nextSibling);

        menuItem.onclick = (e) => {
            e.preventDefault();
            const isVisible = settingsSection.style.display === 'block';
            settingsSection.style.display = isVisible ? 'none' : 'block';
            menuItem.classList.toggle('active', !isVisible);
        };

        const logToggle = document.getElementById('toggle-logs');
        logToggle.onchange = (e) => {
            document.getElementById('sniper-logs-container').style.display = e.target.checked ? 'block' : 'none';
        };

        document.getElementById('s-gd').oninput = (e) => {
            document.getElementById('val-gd').innerText = e.target.value;
            sniperState.globalDelay = parseInt(e.target.value);
        };
        document.getElementById('btn-inject').onclick = injectCheckboxes;
        document.getElementById('btn-start').onclick = toggleSniper;
    };

    const updateStatus = () => {
        const listDiv = document.getElementById('sniper-course-list');
        if (!listDiv) return;
        if (sniperState.selectedCourses.size === 0) {
            listDiv.innerText = "Empty Queue";
        } else {
            const list = Array.from(sniperState.selectedCourses).map(id => {
                const name = sniperState.courseNames[id] || id;
                return `${name} (${id})`;
            }).join(', ');
            listDiv.innerText = "Targeting: " + list;
        }
    };

    const updateUIAfterStop = () => {
        const btn = document.getElementById('btn-start');
        const statusText = document.getElementById('sniper-status-text');
        if (!btn) return;
        btn.innerText = "START SNIPER";
        btn.style.background = "#2185d0";
        statusText.style.color = "#db2828";
        statusText.innerText = "● IDLE";
    };

    const toggleSniper = () => {
        const btn = document.getElementById('btn-start');
        const statusText = document.getElementById('sniper-status-text');
        if (sniperState.isRunning) {
            sniperState.isRunning = false;
            updateUIAfterStop();
            addLog("Sniper Stopped.");
            notify("Stopped.");
        } else {
            if (sniperState.selectedCourses.size === 0) {
                notify("Select courses first!", "error");
                return;
            }
            const h = parseInt(document.getElementById('s-h').value);
            const m = parseInt(document.getElementById('s-m').value);
            const s = parseInt(document.getElementById('s-s').value);
            const t = new Date();
            t.setHours(h, m, s, 0);
            sniperState.targetTime = t;
            sniperState.isRunning = true;
            btn.innerText = "STOP SNIPER";
            btn.style.background = "#db2828";
            statusText.style.color = "#21ba45";
            statusText.innerText = "● ARMED";
            
            const diff = t.getTime() - Date.now();
            if (diff > 0) {
                notify(`Armed for launch at ${h}:${m}:${s}`, "info");
                setTimeout(engineLoop, diff);
            } else { engineLoop(); }
        }
    };

    async function engineLoop() {
        if (!sniperState.isRunning) return;
        console.log("%c[Sniper] Loop Started.", "color: #2185d0; font-weight: bold;");

        while (sniperState.isRunning && sniperState.selectedCourses.size > 0) {
            const allRows = Array.from(document.querySelectorAll('tr'));
            const now = Date.now();

            for (const courseFullId of Array.from(sniperState.selectedCourses)) {
                if (!sniperState.isRunning) break;
                
                const courseName = sniperState.courseNames[courseFullId] || courseFullId;
                const code = courseFullId.split('-')[0];
                const group = courseFullId.split('-')[1];
                
                const row = allRows.find(r => 
                    (r.innerText.includes(courseFullId) || r.innerText.includes(e2p(courseFullId))) ||
                    (r.innerText.includes(e2p(code)) && r.innerText.includes(e2p(group)))
                );
                
                if (!row) continue;

                // Visual Check (Sync)
                const isSecured = row.querySelector('.checkmark.icon') || row.classList.contains('positive') || row.style.backgroundColor.includes('rgb(209, 250, 229)');
                if (isSecured) {
                    notify(`Confirmed: ${courseName} secured!`, "success");
                    sniperState.selectedCourses.delete(courseFullId);
                    updateStatus();
                    continue;
                }

                if (!sniperState.lastAttempt[courseFullId] || (now - sniperState.lastAttempt[courseFullId] > sniperState.retryDelay)) {
                    
                    let units = 1;
                    const cellList = Array.from(row.querySelectorAll('td'));
                    for (const cell of cellList) {
                        const val = p2e(cell.innerText.trim());
                        if (/^[1-4]$/.test(val)) { units = parseInt(val); break; }
                    }

                    sniperState.lastAttempt[courseFullId] = Date.now();
                    
                    // Fire without await
                    fireRequest(courseFullId, units); 

                    // Mandatory delay after firing
                    await new Promise(r => setTimeout(r, sniperState.globalDelay)); 
                }
            }
            
            // Small gap between rounds
            await new Promise(r => setTimeout(r, 600));
        }
        
        if (sniperState.selectedCourses.size === 0 && sniperState.isRunning) {
            notify("All clear! Mission complete.", "success");
            sniperState.isRunning = false;
            updateUIAfterStop();
        }
    }

    createIntegratedUI();
    setTimeout(injectCheckboxes, 1000);
    notify("Sniper v7.3 Verified Stable.", "info");

})();