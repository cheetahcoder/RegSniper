/**
 * --- Sharif RegSniper Extension v7.4 ---
 * Features:
 *  - Priority Queue (Ordered Execution)
 *  - Auto-Save Settings & Course Selections (LocalStorage Persistence)
 *  - High-Fidelity Synthesized Audio Alerts (Web Audio API)
 *  - Non-Overlapping Stacked Toast Notification System
 *  - Millisecond Start Offset & Quick NO_REGISTRATION_TIME Recovery
 *  - Manifest V3 & SPA Client-side Route Monitor
 */

(function() {
    'use strict';

    if (window.__REG_SNIPER_INITIALIZED__) {
        return;
    }
    window.__REG_SNIPER_INITIALIZED__ = true;

    const STORAGE_KEY = '__SHARIF_REG_SNIPER_V2__';

    // --- Configuration State ---
    let sniperState = {
        isRunning: false,
        isStandby: false,
        standbyTimeout: null,
        priorityQueue: [], // Array of fullIds in order of priority (e.g. ["52103-1", "52104-2"])
        selectedCourses: new Set(), // Set for O(1) membership check
        courseNames: {}, // Mapping: "52103-1" -> "Course Title"
        courseUnits: {}, // Mapping: "52103-1" -> units (e.g. 3)
        courseActions: {}, // Mapping: "52103-1" -> "add" | "remove" (defaults to "add")
        targetTime: null,
        startOffset: 800,
        globalDelay: 1500,
        retryDelay: 16000,
        lastAttempt: {},
        logs: [],
        showLogs: false,
        soundEnabled: true
    };

    const p2e = s => (s ? s.toString().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : '');
    const e2p = s => (s ? s.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]) : '');

    // --- Persistence (Local Storage) ---
    const saveSettings = () => {
        try {
            const h = document.getElementById('s-h')?.value || "08";
            const m = document.getElementById('s-m')?.value || "00";
            const s = document.getElementById('s-s')?.value || "00";
            const offset = parseInt(document.getElementById('s-offset')?.value) ?? 800;
            const delay = sniperState.globalDelay || 1500;
            const sound = sniperState.soundEnabled;

            const data = {
                priorityQueue: sniperState.priorityQueue,
                courseNames: sniperState.courseNames,
                courseActions: sniperState.courseActions,
                h, m, s, offset, delay, sound
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch(e) {}
    };

    const loadSettings = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Array.isArray(data.priorityQueue)) {
                sniperState.priorityQueue = data.priorityQueue;
                sniperState.selectedCourses = new Set(data.priorityQueue);
            }
            if (data.courseNames && typeof data.courseNames === 'object') {
                sniperState.courseNames = { ...data.courseNames };
            }
            if (data.courseActions && typeof data.courseActions === 'object') {
                sniperState.courseActions = { ...data.courseActions };
            }
            if (data.delay) sniperState.globalDelay = parseInt(data.delay);
            if (data.offset !== undefined) sniperState.startOffset = parseInt(data.offset);
            if (typeof data.sound === 'boolean') sniperState.soundEnabled = data.sound;
            return data;
        } catch(e) {
            return null;
        }
    };

    // Load saved settings immediately
    const savedData = loadSettings();

    // --- Audio Synthesizer (Web Audio API) ---
    let audioCtx = null;

    // Unlock AudioContext on first user gesture (Chrome Autoplay Policy)
    const unlockAudio = () => {
        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) audioCtx = new AudioContextClass();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
        } catch(e) {}
    };

    ['click', 'keydown', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, unlockAudio, { once: true, capture: true });
    });

    const playSound = (type) => {
        if (!sniperState.soundEnabled) return;
        if (type !== 'success' && type !== 'warn' && type !== 'error') return;

        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) audioCtx = new AudioContextClass();
            }
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
                if (audioCtx.state === 'suspended') return;
            }

            const now = audioCtx.currentTime;

            if (type === 'success') {
                // Joyful ascending chime: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz) -> C6 (1046Hz)
                const freqs = [523.25, 659.25, 783.99, 1046.50];
                freqs.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                    gain.gain.setValueAtTime(0.25, now + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(now + idx * 0.08);
                    osc.stop(now + idx * 0.08 + 0.22);
                });
            } else if (type === 'warn') {
                // Alert ping: 480Hz
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(480, now);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === 'error') {
                // Low warning buzz: 220Hz -> 180Hz
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.linearRampToValueAtTime(180, now + 0.25);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.25);
            }
        } catch(e) {}
    };

    // --- Inject Styles ---
    const style = document.createElement('style');
    style.id = 'sniper-styles';
    style.innerHTML = `
        .sniper-force-en {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
            font-variant-numeric: tabular-nums !important;
            direction: ltr !important;
            unicode-bidi: isolate !important;
            text-align: left !important;
        }
        #sniper-settings-area {
            direction: rtl !important;
            text-align: right !important;
            box-sizing: border-box !important;
        }
        #sniper-settings-area * {
            box-sizing: border-box !important;
        }
        #sniper-settings-area input[type="number"] {
            font-family: 'Consolas', monospace !important;
            font-size: 14px !important;
            font-weight: bold !important;
            color: #111 !important;
            text-align: center !important;
            border: 1px solid #ccc !important;
            border-radius: 4px !important;
            padding: 4px 2px !important;
        }
        #sniper-toast-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 9999999;
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
            pointer-events: none;
            max-height: 80vh;
            overflow: hidden;
        }
        .sniper-toast {
            pointer-events: auto;
            position: relative;
            color: #ffffff;
            padding: 12px 18px;
            border-radius: 8px;
            font-weight: bold;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            font-family: inherit;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-width: 280px;
            max-width: 440px;
            direction: rtl !important;
            text-align: right !important;
            opacity: 1;
            transform: translateX(0);
            cursor: pointer;
            user-select: none;
            animation: sniperToastSlideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes sniperToastSlideIn {
            from {
                opacity: 0;
                transform: translateX(50px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        .sniper-q-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 10px;
            margin-bottom: 5px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            transition: 0.2s;
        }
        .sniper-q-item:hover {
            border-color: #2185d0;
            background: #f8fafc;
        }
        .sniper-badge {
            background: #2185d0;
            color: #ffffff;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 7px;
            border-radius: 10px;
            margin-right: 6px;
        }
        .sniper-btn-mini {
            cursor: pointer;
            border: 1px solid #cbd5e1;
            background: #f1f5f9;
            color: #334155;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 7px;
            transition: 0.15s;
        }
        .sniper-btn-mini:hover {
            background: #e2e8f0;
            color: #0f172a;
        }
        .sniper-btn-del {
            cursor: pointer;
            border: 1px solid #fecaca;
            background: #fee2e2;
            color: #dc2626;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 7px;
            transition: 0.15s;
        }
        .sniper-btn-del:hover {
            background: #fca5a5;
            color: #991b1b;
        }
    `;
    if (!document.getElementById('sniper-styles')) {
        document.head.appendChild(style);
    }

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
        return (document.cookie && document.cookie.match(jwtRegex)?.[0]) || null;
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

    const getToastContainer = () => {
        let container = document.getElementById('sniper-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sniper-toast-container';
            document.body.appendChild(container);
        }
        return container;
    };

    const notify = (msg, type = "info") => {
        const colors = { success: "#21ba45", error: "#db2828", info: "#2185d0", warn: "#fbbd08" };
        const container = getToastContainer();

        // Limit visible toasts to prevent vertical overflow
        while (container.children.length >= 5) {
            container.firstElementChild.remove();
        }

        const toast = document.createElement('div');
        toast.className = "sniper-toast";
        toast.style.background = colors[type] || colors.info;
        toast.title = "برای بستن کلیک کنید";
        toast.innerHTML = `
            <span style="margin-left: 12px; word-break: break-word; font-family: inherit;">${msg}</span>
            <span style="font-size: 13px; opacity: 0.8; padding: 2px 4px; line-height: 1; margin-right: auto;" title="بستن">✕</span>
        `;

        const dismissToast = () => {
            if (toast._dismissed) return;
            toast._dismissed = true;
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        };

        toast.onclick = dismissToast;

        container.appendChild(toast);
        playSound(type);

        setTimeout(dismissToast, 4000);
    };

    const getFriendlyMessage = (code) => {
        const messages = {
            "OK": "عملیات با موفقیت انجام شد!",
            "COURSE_DUPLICATE": "این درس جزو دروس ثبت‌نامی شما است (اخذ شده).",
            "COURSE_TAKEN_BEFORE": "شما قبلاً این درس را اخذ کرده‌اید.",
            "CAPACITY_FULL": "ظرفیت این درس تکمیل است!",
            "CAPACITY_EXCEEDED": "ظرفیت این درس تکمیل است!",
            "UNITS_LIMIT": "سقف اخذ واحد شما اجازه ثبت‌نام نمی‌دهد.",
            "CLASS_OVERLAP": "تداخل ساعت کلاس با دروس ثبت‌نامی شما.",
            "EXAM_OVERLAP": "تداخل تاریخ امتحان با دروس ثبت‌نامی شما.",
            "MAAREF_COURSES_LIMIT": "امکان ثبت‌نام بیش از یک درس معارف وجود ندارد.",
            "NO_PERMISSION": "مجوز ثبت‌نام برای شما صادر نشده است.",
            "REGISTRATION_TIME_LIMIT": "اکنون زمان انتخاب واحد / حذف و اضافه نیست.",
            "NO_REGISTRATION_TIME": "اکنون زمان انتخاب واحد / حذف و اضافه نیست.",
            "REPEATED_REQUEST": "درخواست تکراری در ۱۵ ثانیه اخیر.",
            "AUTHORIZATION": "نشست کاربری منقضی شده (خروج و ورود مجدد لازم است).",
            "REGISTER_IN_EDU": "ثبت‌نام این درس باید در سامانه آموزش انجام شود.",
            "ALREADY_IN_QUEUE": "درخواست قبلی برای این درس در صف بررسی سرور است.",
            "COURSE_NOT_FOUND": "درس در سامانه یافت نشد.",
            "CANNOT_REMOVE": "امکان حذف این درس وجود ندارد.",
            "MIN_UNITS_LIMIT": "به دلیل کف تعداد واحد مجاز، امکان حذف این درس وجود ندارد."
        };
        return messages[code] || `پاسخ سرور: ${code}`;
    };

    const knownJobIds = new Set();

    const getReduxStore = () => {
        try {
            const root = document.getElementById('root');
            if (!root) return null;

            const fiberKey = Object.keys(root).find(k => k.startsWith('__reactContainer$') || k.startsWith('_reactRootContainer') || k.startsWith('__reactFiber$'));
            if (fiberKey) {
                let node = root[fiberKey];
                if (node._internalRoot) node = node._internalRoot.current;

                let queue = [node];
                let visited = 0;

                while (queue.length > 0 && visited < 50) {
                    const curr = queue.shift();
                    visited++;
                    if (!curr) continue;

                    if (curr.memoizedProps?.store?.dispatch) return curr.memoizedProps.store;
                    if (curr.stateNode?.store?.dispatch) return curr.stateNode.store;

                    if (curr.child) queue.push(curr.child);
                    if (curr.sibling) queue.push(curr.sibling);
                }
            }
            if (window.store && typeof window.store.dispatch === 'function') return window.store;
            if (window.__REDUX_STORE__ && typeof window.__REDUX_STORE__.dispatch === 'function') return window.__REDUX_STORE__;
        } catch (e) {}
        return null;
    };

    // Pre-populate known jobs to prevent stale job notifications
    const initKnownJobs = () => {
        try {
            const store = getReduxStore();
            const state = store?.getState?.();
            const jobs = state?.jobs || state?.user?.jobs;
            if (Array.isArray(jobs)) {
                jobs.forEach(j => {
                    if (j?.id) knownJobIds.add(j.id);
                });
            }
        } catch(e) {}
    };

    // Live capacity hunter: watches Redux/WebSocket updates for immediate course sniping
    let reduxCapacitySubscribed = false;
    const setupCapacityWatcher = () => {
        if (reduxCapacitySubscribed) return;
        try {
            const store = getReduxStore();
            if (!store || typeof store.subscribe !== 'function') return;

            reduxCapacitySubscribed = true;
            let lastCoursesMap = {};

            store.subscribe(() => {
                if (!sniperState.isRunning || sniperState.priorityQueue.length === 0) return;
                // STRICT CHECK: Do NOT fire during standby or before scheduled start time
                if (sniperState.isStandby) return;
                if (sniperState.targetTime && Date.now() < sniperState.targetTime.getTime()) return;

                const state = store.getState?.();
                const offered = state?.offeredCourses;
                if (!Array.isArray(offered)) return;

                for (const fullId of Array.from(sniperState.priorityQueue)) {
                    const action = sniperState.courseActions[fullId] || "add";
                    if (action === "remove") continue; // Live capacity hunter is strictly for adding courses!
                    const code = fullId.split('-')[0];
                    const match = offered.find(c => c.id === fullId || `${c.number}-${c.group}` === fullId || c.number == code);
                    
                    if (match && match.capacity > 0) {
                        const prev = lastCoursesMap[fullId];
                        lastCoursesMap[fullId] = { count: match.count, capacity: match.capacity };

                        // Capacity opened up if:
                        // 1. Course was full (prev.count >= prev.capacity) and now has open space (match.count < match.capacity)
                        // 2. Department increased total capacity (match.capacity > prev.capacity && match.count < match.capacity)
                        // 3. Someone dropped the course (match.count < prev.count && match.count < match.capacity)
                        const capacityJustOpened = prev && (
                            (prev.count >= prev.capacity && match.count < match.capacity) ||
                            (match.capacity > prev.capacity && match.count < match.capacity) ||
                            (match.count < prev.count && match.count < match.capacity)
                        );

                        if (capacityJustOpened) {
                            const now = Date.now();
                            const lastFired = sniperState.lastAttempt[fullId] || 0;

                            // Immediate trigger if 3.5s passed since last shot to avoid spam limit
                            if (now - lastFired >= 3500) {
                                const freeSlots = match.capacity - match.count;
                                const courseName = sniperState.courseNames[fullId] || fullId;
                                notify(`⚡ ظرفیت باز شد: ${courseName} (${freeSlots} جای خالی) - شلیک فوری!`, "success");
                                addLog(`⚡ شکار ظرفیت: ظرفیت درس ${courseName} باز شد (${match.count}/${match.capacity}). در حال شلیک فوری...`);
                                
                                sniperState.lastAttempt[fullId] = now;
                                const units = parseInt(match.units) || sniperState.courseUnits[fullId] || 3;
                                fireRequest(fullId, units);
                                break;
                            }
                        }
                    }
                }
            });
            console.log("%c[Sniper] Live WebSocket/Redux Capacity Hunter Active.", "color: #2185d0; font-weight: bold;");
        } catch(e) {}
    };

    // Synchronize response state directly into Sharif EDU's React/Redux store
    const syncWithSiteState = (userState) => {
        if (!userState || typeof userState !== 'object') return;
        try {
            const store = getReduxStore();
            if (store && typeof store.dispatch === 'function') {
                store.dispatch({
                    type: 'GOT_USER_STATE',
                    userState: userState
                });
            }
        } catch(e) {}
    };

    async function fireRequest(courseFullId, units, action = "add") {
        const token = getAuthToken();
        const courseName = sniperState.courseNames[courseFullId] || courseFullId;
        const isRemove = action === "remove";
        
        if (!token) {
            notify("توکن احراز هویت یافت نشد! لطفاً وارد حساب شوید.", "error");
            return;
        }

        const payload = {
            id: crypto.randomUUID(),
            action: action, // "add" or "remove"
            course: courseFullId, 
            units: parseInt(units) || 1
        };

        const actVerb = isRemove ? "حذف" : "شلیک";
        notify(`در حال ${actVerb}: ${courseName}`, "info");
        addLog(`ارسال درخواست ${actVerb} برای ${courseName}...`);

        try {
            const response = await fetch('https://my.edu.sharif.edu/api/reg', {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });

            // 1. Check HTTP Status codes first (before reading body)
            if (response.status === 429) {
                notify(`${courseName}: محدودیت سرعت سرور (ارور ۴۲۹) - مکث برای خنک شدن سرور...`, "warn");
                addLog(`${courseName}: محدودیت سرعت سرور Nginx (ارور ۴۲۹). رعایت فاصله زمانی برای رفع بلاک...`, true);
                sniperState.lastAttempt[courseFullId] = Date.now(); // Wait full cooldown (16s) to let server reset
                await new Promise(r => setTimeout(r, 2500)); // Pause loop 2.5s for global rate limit cooldown
                return;
            }

            if (response.status === 401 || response.status === 403) {
                notify("خطای نشست (AUTHORIZATION): توکن منقضی شده، خروج و ورود مجدد لازم است!", "error");
                addLog("خطای بحرانی: توکن منقضی شده است (۴۰۱/۴۰۳). لطفاً مجدداً وارد سامانه شوید.", true);
                sniperState.isRunning = false;
                updateUIAfterStop();
                return;
            }

            // 2. Read body safely as text first (prevents body stream already read error)
            const rawText = await response.text();
            let data = null;
            try {
                data = JSON.parse(rawText);
            } catch (err) {
                data = rawText;
            }

            // 3. Handle non-JSON string responses from server (such as "REPEATED_REQUEST ...")
            if (typeof data === 'string') {
                if (data.includes('REPEATED_REQUEST') || data.includes('429') || data.includes('Too Many')) {
                    notify(`${courseName}: محدودیت زمانی سرور (۱۵ ثانیه بین هر درخواست تکراری)`, "warn");
                    addLog(`${courseName}: خطای درخواست تکراری. انتظار تا انقضای پنجره ۱۵ ثانیه‌ای سرور...`, true);
                    sniperState.lastAttempt[courseFullId] = Date.now(); // Wait full cooldown (16s)
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    addLog(`${courseName}: پاسخ متنی: ${data.slice(0, 40)}`);
                }
                return;
            }

            if (!data || typeof data !== 'object') return;
            
            // Sync server response into Sharif EDU's native React/Redux store
            syncWithSiteState(data);
            
            // 1. Primary check: Is course enrolled in data.courses or Redux store?
            const courseCode = courseFullId.split('-')[0];
            const reduxEnrolled = getReduxStore()?.getState()?.enrolledCourses;
            const isEnrolled = (Array.isArray(data.courses) && data.courses.some(c => {
                if (typeof c === 'string') return c === courseFullId || c === courseCode;
                if (typeof c === 'object' && c !== null) {
                    return c.id === courseFullId || c.id === courseCode || c.courseId === courseFullId || c.course === courseFullId;
                }
                return false;
            })) || (Array.isArray(reduxEnrolled) && reduxEnrolled.some(c => {
                return c?.id === courseFullId || c?.id === courseCode || c?.courseId === courseFullId;
            }));

            // 2. Job history resolution
            // In Sharif EDU, the newest job is always prepended at index 0 (allJobs[0])
            const allJobs = Array.isArray(data.jobs) ? data.jobs : [];
            let latestJobForCourse = null;
            if (allJobs.length > 0 && (allJobs[0].courseId === courseFullId || allJobs[0].course === courseFullId)) {
                latestJobForCourse = allJobs[0];
            } else {
                latestJobForCourse = allJobs.find(j => !knownJobIds.has(j.id) && (j.courseId === courseFullId || j.course === courseFullId))
                                  || allJobs.find(j => j.courseId === courseFullId || j.course === courseFullId);
            }

            // Mark all current jobs as known for future requests
            allJobs.forEach(j => knownJobIds.add(j.id));

            const jobResult = latestJobForCourse?.result || data.result;
            
            let isSuccess = false;
            if (isRemove) {
                isSuccess = (!isEnrolled && (Array.isArray(data.courses) || Array.isArray(reduxEnrolled))) ||
                            jobResult === "OK" ||
                            data.result === "OK";
            } else {
                isSuccess = isEnrolled || 
                            data.result === "OK" || 
                            jobResult === "OK" || 
                            jobResult === "COURSE_DUPLICATE" ||
                            jobResult === "COURSE_TAKEN_BEFORE";
            }

            const rawErrorCode = data.error || jobResult || data.result;
            const isAuthError = response.status === 401 || 
                                response.status === 403 || 
                                rawErrorCode === "AUTHORIZATION" ||
                                (typeof data.error === 'string' && data.error.includes("AUTH"));

            if (isAuthError) {
                notify("خطای نشست (AUTHORIZATION): توکن منقضی شده، خروج و ورود مجدد لازم است!", "error");
                addLog("خطای بحرانی: نشست کاربری منقضی شد (AUTHORIZATION).", true);
                sniperState.isRunning = false;
                updateUIAfterStop();
                return;
            }

            if (isSuccess) {
                if (isRemove) {
                    notify(`موفقیت: درس ${courseName} با موفقیت حذف شد! 🗑️`, "success");
                    addLog(`🗑️ حذف قطعی: درس ${courseName} با موفقیت حذف شد.`);
                } else {
                    notify(`موفقیت: ${courseName} اخذ شد! 🎉`, "success");
                    addLog(`🎉 ثبت قطعی: درس ${courseName} با موفقیت اخذ شد.`);
                }
                removeCourseFromQueue(courseFullId);
                if (typeof renderEnrolledCoursesList === 'function') {
                    renderEnrolledCoursesList();
                }
            } else if (rawErrorCode) {
                const msg = getFriendlyMessage(rawErrorCode);
                const isCapacity = rawErrorCode === "CAPACITY_FULL" || rawErrorCode === "CAPACITY_EXCEEDED";
                notify(`${courseName}: ${msg}`, rawErrorCode.includes("LIMIT") || isCapacity ? "warn" : "error");
                addLog(`${courseName}: ${msg}`, true);
                
                // Retry pacing: 5s for capacity, 4.5s for time limit (prevents Nginx 429 rate limit)
                if (isCapacity) {
                    sniperState.lastAttempt[courseFullId] = Date.now() - (sniperState.retryDelay - 5000);
                } else if (rawErrorCode === "REGISTRATION_TIME_LIMIT" || rawErrorCode === "NO_REGISTRATION_TIME") {
                    sniperState.lastAttempt[courseFullId] = Date.now() - (sniperState.retryDelay - 4500);
                }
            } else {
                addLog(`پذیرش اولیه توسط سرور: ${courseName} (در حال بررسی)`);
            }
        } catch (e) {
            addLog(`خطای شبکه در ارتباط با سرور برای ${courseName}`, true);
        }
    }

    const movePriority = (fullId, direction) => {
        const idx = sniperState.priorityQueue.indexOf(fullId);
        if (idx < 0) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= sniperState.priorityQueue.length) return;

        const temp = sniperState.priorityQueue[idx];
        sniperState.priorityQueue[idx] = sniperState.priorityQueue[targetIdx];
        sniperState.priorityQueue[targetIdx] = temp;
        updateStatus();
    };

    const removeCourseFromQueue = (fullId) => {
        sniperState.selectedCourses.delete(fullId);
        sniperState.priorityQueue = sniperState.priorityQueue.filter(id => id !== fullId);
        delete sniperState.courseActions[fullId];
        
        const cb = document.querySelector(`.sniper-select[data-full-id="${fullId}"]`);
        if (cb) {
            cb.checked = false;
            const row = cb.closest('tr');
            if (row) row.style.background = "none";
        }
        updateStatus();
    };

    const updateStatus = () => {
        const listDiv = document.getElementById('sniper-course-list');
        if (!listDiv) return;

        if (sniperState.priorityQueue.length === 0) {
            listDiv.innerHTML = '<span style="color: #94a3b8; font-size: 11px;">درسی در صف نیست. برای افزودن، از جدول پایین تیک بزنید یا از بخش «دروس اخذ شده»، دکمه «+ صف» را بزنید.</span>';
            saveSettings();
            return;
        }

        listDiv.innerHTML = sniperState.priorityQueue.map((id, index) => {
            const name = sniperState.courseNames[id] || id;
            const isFirst = index === 0;
            const isLast = index === sniperState.priorityQueue.length - 1;
            const action = sniperState.courseActions[id] || "add";
            const isRemove = action === "remove";

            return `
                <div class="sniper-q-item" style="direction: rtl; ${isRemove ? 'border-right: 3px solid #ef4444; background: #fff5f5;' : ''}">
                    <div style="display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 8px; flex: 1;">
                        <span class="sniper-badge" style="${isRemove ? 'background: #fee2e2; color: #dc2626;' : ''}">#${index + 1}</span>
                        <span style="font-size: 11px; color: #1e293b;" title="${name} (${id})">
                            <b style="color: #0f172a;">${id}</b> <span style="color: #64748b;">— ${name}</span>
                        </span>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0; direction: ltr; align-items: center;">
                        <button class="sniper-btn-mini btn-toggle-act" data-id="${id}" title="تغییر عملیات بین اخذ و حذف" style="background: ${isRemove ? '#fee2e2' : '#dcfce7'}; color: ${isRemove ? '#b91c1c' : '#15803d'}; border: 1px solid ${isRemove ? '#fca5a5' : '#86efac'}; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 4px; cursor: pointer;">
                            ${isRemove ? '🗑️ حذف' : '➕ اخذ'}
                        </button>
                        ${!isFirst ? `<button class="sniper-btn-mini btn-move-up" data-id="${id}" title="افزایش اولویت (انتقال به بالا)">▲</button>` : ''}
                        ${!isLast ? `<button class="sniper-btn-mini btn-move-down" data-id="${id}" title="کاهش اولویت (انتقال به پایین)">▼</button>` : ''}
                        <button class="sniper-btn-del btn-remove-q" data-id="${id}" title="حذف از صف">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach button event handlers
        listDiv.querySelectorAll('.btn-toggle-act').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                sniperState.courseActions[id] = (sniperState.courseActions[id] === 'remove') ? 'add' : 'remove';
                const cb = document.querySelector(`.sniper-select[data-full-id="${id}"]`);
                if (cb && cb.checked) {
                    const row = cb.closest('tr');
                    if (row) {
                        row.style.background = sniperState.courseActions[id] === 'remove' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(33, 133, 208, 0.1)';
                    }
                }
                updateStatus();
            };
        });
        listDiv.querySelectorAll('.btn-move-up').forEach(btn => {
            btn.onclick = () => movePriority(btn.dataset.id, -1);
        });
        listDiv.querySelectorAll('.btn-move-down').forEach(btn => {
            btn.onclick = () => movePriority(btn.dataset.id, 1);
        });
        listDiv.querySelectorAll('.btn-remove-q').forEach(btn => {
            btn.onclick = () => removeCourseFromQueue(btn.dataset.id);
        });

        saveSettings();
    };

    const injectCheckboxes = () => {
        const rows = document.querySelectorAll('tr');
        let injectedCount = 0;
        
        rows.forEach(row => {
            if (row.querySelector('.sniper-select')) return;

            const cells = Array.from(row.querySelectorAll('td'));
            let foundCode = "", foundGroup = "", foundUnits = 3, foundName = "";

            for (let i = 0; i < cells.length; i++) {
                const cellText = cells[i].innerText.trim();
                const codeOnlyMatch = cellText.match(/^[0-9۰-۹]{5}$/);
                if (codeOnlyMatch) {
                    foundCode = p2e(codeOnlyMatch[0]);
                    if (cells[i + 1]) foundGroup = p2e(cells[i + 1].innerText.trim());
                    if (cells[i + 2]) {
                        const parsedU = parseInt(p2e(cells[i + 2].innerText.trim()));
                        if (parsedU >= 1 && parsedU <= 6) foundUnits = parsedU;
                    }
                    for (let j = i + 3; j < cells.length; j++) {
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
                sniperState.courseUnits[fullId] = foundUnits;

                const td = document.createElement('td');
                td.style = "text-align: center; padding: 6px 4px; border-right: 1px solid #eee; width: 68px; white-space: nowrap;";
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'sniper-select';
                cb.style = "width: 17px; height: 17px; cursor: pointer; vertical-align: middle;";
                cb.dataset.fullId = fullId;
                cb.title = "افزودن به صف اسنایپر";

                td.onclick = (e) => e.stopPropagation();
                cb.onclick = (e) => e.stopPropagation();

                // Auto-restore state if previously selected
                if (sniperState.selectedCourses.has(fullId)) {
                    cb.checked = true;
                    const act = sniperState.courseActions[fullId] || "add";
                    row.style.background = act === "remove" ? "rgba(239, 68, 68, 0.1)" : "rgba(33, 133, 208, 0.1)";
                }

                cb.onchange = () => {
                    if (cb.checked) {
                        if (!sniperState.selectedCourses.has(fullId)) {
                            sniperState.selectedCourses.add(fullId);
                            sniperState.priorityQueue.push(fullId);
                        }
                        const act = sniperState.courseActions[fullId] || "add";
                        row.style.background = act === "remove" ? "rgba(239, 68, 68, 0.1)" : "rgba(33, 133, 208, 0.1)";
                    } else {
                        sniperState.selectedCourses.delete(fullId);
                        sniperState.priorityQueue = sniperState.priorityQueue.filter(id => id !== fullId);
                        delete sniperState.courseActions[fullId];
                        row.style.background = "none";
                    }
                    updateStatus();
                };

                td.appendChild(cb);

                // Quick drop button right in table row
                const btnDropRow = document.createElement('button');
                btnDropRow.type = 'button';
                btnDropRow.title = `حذف سریع درس ${foundName || fullId}`;
                btnDropRow.innerHTML = '🗑️';
                btnDropRow.style = "background: none; border: none; cursor: pointer; font-size: 13px; padding: 0 3px; margin-right: 3px; vertical-align: middle; opacity: 0.65; transition: 0.2s;";
                btnDropRow.onmouseover = () => { btnDropRow.style.opacity = '1'; btnDropRow.style.transform = 'scale(1.2)'; };
                btnDropRow.onmouseout = () => { btnDropRow.style.opacity = '0.65'; btnDropRow.style.transform = 'scale(1)'; };
                btnDropRow.onclick = (e) => {
                    e.stopPropagation();
                    const cName = sniperState.courseNames[fullId] || fullId;
                    const cUnits = sniperState.courseUnits[fullId] || foundUnits || 3;
                    if (confirm(`آیا از ارسال درخواست حذف برای درس «${cName} (${fullId})» مطمئن هستید؟`)) {
                        fireRequest(fullId, cUnits, "remove");
                    }
                };
                td.appendChild(btnDropRow);

                row.prepend(td);
                injectedCount++;
            }
        });

        document.querySelectorAll('table').forEach(table => {
            const firstRow = table.querySelector('tr');
            if (firstRow && !table.querySelector('.sniper-h-cell')) {
                const th = document.createElement('th');
                th.className = 'sniper-h-cell';
                th.innerText = 'عملیات';
                th.style = "color: #2185d0; text-align: center; padding: 10px; width: 68px;";
                firstRow.prepend(th);
            }
        });

        if (injectedCount > 0) {
            updateStatus();
        }
    };

    // Automatic live calibration of network latency and server clock drift
    let isCalibratingOffset = false;
    const autoCalibrateOffset = async (notifyUser = false) => {
        if (isCalibratingOffset) return;
        isCalibratingOffset = true;

        const offsetInput = document.getElementById('s-offset');
        const btnCalib = document.getElementById('btn-auto-offset');
        if (btnCalib) {
            btnCalib.disabled = true;
            btnCalib.innerText = "⏳ در حال سنجش...";
        }

        try {
            // 1. Warmup & Ping measurement (5 samples)
            const pings = [];
            for (let i = 0; i < 5; i++) {
                const t0 = Date.now();
                const res = await fetch('/favicon.ico?_r=' + Math.random(), { method: 'HEAD', cache: 'no-store' });
                const t1 = Date.now();
                pings.push(t1 - t0);
                await new Promise(r => setTimeout(r, 60));
            }
            pings.sort((a, b) => a - b);
            const medianPing = pings[Math.floor(pings.length / 2)];
            const oneWayLatency = Math.round(medianPing / 2);

            // 2. Multi-pass second rollover detection
            let lastSec = null;
            let drift = null;
            for (let i = 0; i < 35; i++) {
                const t0 = Date.now();
                const res = await fetch('/favicon.ico?_r=' + Math.random(), { method: 'HEAD', cache: 'no-store' });
                const t1 = Date.now();
                const mid = (t0 + t1) / 2;
                const dateHdr = res.headers.get('date');
                if (dateHdr) {
                    const sec = new Date(dateHdr).getTime();
                    if (lastSec !== null && sec > lastSec) {
                        drift = mid - sec;
                        break;
                    }
                    lastSec = sec;
                }
                await new Promise(r => setTimeout(r, 50));
            }

            if (drift === null) {
                // Fallback: estimate from last response date header
                const t0 = Date.now();
                const res = await fetch('/favicon.ico?_r=' + Math.random(), { method: 'HEAD', cache: 'no-store' });
                const t1 = Date.now();
                const dateHdr = res.headers.get('date');
                if (dateHdr) {
                    drift = ((t0 + t1) / 2) - new Date(dateHdr).getTime();
                } else {
                    drift = 850;
                }
            }

            // Calculate stable recommended offset (drift - oneWayLatency + 110ms sweet spot)
            const rawRecommended = drift - oneWayLatency + 110;
            const recommendedOffset = Math.round(rawRecommended / 10) * 10;

            if (offsetInput) {
                offsetInput.value = recommendedOffset;
                sniperState.startOffset = recommendedOffset;
                saveSettings();
            }

            const sign = recommendedOffset >= 0 ? '+' : '';
            const msg = `آفست بهینه: ${sign}${recommendedOffset}ms (پینگ: ${medianPing}ms | اختلاف ساعت: ${Math.round(drift)}ms)`;
            addLog(`⚡ کالیبراسیون خودکار آفست: ${msg}`);

            if (notifyUser) {
                notify(`آفست بهینه روی ${sign}${recommendedOffset}ms تنظیم شد! 🎯 (پینگ: ${medianPing}ms)`, "success");
            }
        } catch (e) {
            if (notifyUser) {
                notify("خطا در محاسبه خودکار آفست", "warn");
            }
        } finally {
            isCalibratingOffset = false;
            if (btnCalib) {
                btnCalib.disabled = false;
                btnCalib.innerText = "⚡ محاسبه مجدد";
            }
        }
    };

    // Render and manage student's enrolled courses with instant 1-click drop or add-to-drop-queue
    const renderEnrolledCoursesList = () => {
        const listDiv = document.getElementById('sniper-enrolled-list');
        const unitsSpan = document.getElementById('sniper-enrolled-units');
        if (!listDiv) return;

        let enrolled = [];
        try {
            const store = getReduxStore();
            const state = store?.getState?.();
            const reduxList = state?.enrolledCourses || state?.user?.courses || state?.courses || state?.userState?.courses;
            if (Array.isArray(reduxList) && reduxList.length > 0) {
                enrolled = [...reduxList];
            }
        } catch(e) {}

        // Fallback: check visually secured rows from DOM
        const allRows = Array.from(document.querySelectorAll('tr'));
        allRows.forEach(row => {
            const isSecured = row.querySelector('.checkmark.icon') || 
                              row.innerText.includes('ویرایش ثبت‌نام') ||
                              row.classList.contains('positive') || 
                              (row.style.backgroundColor && row.style.backgroundColor.includes('rgb(209, 250, 229)'));
            if (isSecured) {
                const cells = Array.from(row.querySelectorAll('td'));
                for (let i = 0; i < cells.length; i++) {
                    const cellText = cells[i].innerText.trim();
                    const codeMatch = cellText.match(/^[0-9۰-۹]{5}$/);
                    if (codeMatch) {
                        const code = p2e(codeMatch[0]);
                        const group = cells[i + 1] ? p2e(cells[i + 1].innerText.trim()) : "1";
                        let units = 3;
                        if (cells[i + 2]) {
                            const u = parseInt(p2e(cells[i + 2].innerText.trim()));
                            if (u >= 1 && u <= 6) units = u;
                        }
                        let title = code;
                        for (let j = i + 3; j < cells.length; j++) {
                            const pt = cells[j].innerText.trim();
                            if (pt && !/^[0-9۰-۹]$/.test(pt)) {
                                title = pt;
                                break;
                            }
                        }
                        const id = `${code}-${group}`;
                        if (!enrolled.some(c => (c.id || `${c.number}-${c.group}`) === id)) {
                            enrolled.push({ id, number: code, group, title, units });
                        }
                        break;
                    }
                }
            }
        });

        if (enrolled.length === 0) {
            listDiv.innerHTML = '<span style="color: #94a3b8; font-size: 11px; grid-column: 1 / -1; padding: 6px 0;">درسی در وضعیت اخذ شده یافت نشد (یا هنوز وارد سامانه نشده‌اید).</span>';
            if (unitsSpan) unitsSpan.innerText = '';
            return;
        }

        let totalUnits = 0;
        listDiv.innerHTML = enrolled.map(c => {
            const id = c.id || `${c.number}-${c.group}`;
            const name = c.title || c.name || sniperState.courseNames[id] || id;
            const u = parseInt(c.units) || sniperState.courseUnits[id] || 3;
            totalUnits += u;
            sniperState.courseNames[id] = name;
            sniperState.courseUnits[id] = u;

            return `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 11px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 6px;" title="${name} (${id})">
                        <b style="color: #0f172a;">${id}</b> <span style="color: #334155;">— ${name}</span>
                        <span style="color: #64748b; font-size: 10px; margin-right: 4px;">(${u} واحد)</span>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0;">
                        <button class="btn-fast-drop" data-id="${id}" data-units="${u}" data-name="${name}" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: bold; cursor: pointer; transition: 0.15s;" title="ارسال فوری درخواست حذف برای این درس">🗑️ حذف</button>
                        <button class="btn-add-drop-q" data-id="${id}" data-units="${u}" data-name="${name}" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;" title="افزودن این درس به صف حذف اسنایپر">+ صف حذف</button>
                    </div>
                </div>
            `;
        }).join('');

        if (unitsSpan) unitsSpan.innerText = `(مجموع: ${totalUnits} واحد)`;

        // Event listeners for fast drop
        listDiv.querySelectorAll('.btn-fast-drop').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                const units = parseInt(btn.dataset.units) || 3;
                const name = btn.dataset.name;
                if (confirm(`آیا از ارسال درخواست حذف برای درس «${name} (${id})» اطمینان دارید؟`)) {
                    btn.disabled = true;
                    btn.innerText = "حذف...";
                    fireRequest(id, units, "remove").finally(() => {
                        btn.disabled = false;
                        btn.innerText = "🗑️ حذف";
                    });
                }
            };
        });

        // Event listeners for add to drop queue
        listDiv.querySelectorAll('.btn-add-drop-q').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                const units = parseInt(btn.dataset.units) || 3;
                const name = btn.dataset.name;
                sniperState.courseNames[id] = name;
                sniperState.courseUnits[id] = units;
                sniperState.courseActions[id] = "remove";
                if (!sniperState.selectedCourses.has(id)) {
                    sniperState.selectedCourses.add(id);
                    sniperState.priorityQueue.push(id);
                }
                updateStatus();
                notify(`درس «${name}» در حالت حذف به صف اسنایپر اضافه شد.`, "info");
            };
        });
    };

    const createIntegratedUI = () => {
        const menu = document.querySelector('.ui.menu');
        if (!menu || document.getElementById('sniper-menu-item')) return;

        const menuItem = document.createElement('a');
        menuItem.id = 'sniper-menu-item';
        menuItem.className = 'item';
        menuItem.style.color = '#2185d0';
        menuItem.style.fontWeight = 'bold';
        menuItem.innerHTML = `<i class="crosshairs icon"></i> اسنایپر انتخاب واحد`;
        menu.appendChild(menuItem);

        const settingsSection = document.createElement('div');
        settingsSection.id = 'sniper-settings-area';
        settingsSection.style = `display: none; background: #ffffff; border: 1px solid #d4d4d5; 
                                border-radius: 8px; margin-bottom: 1.5em; padding: 1.5em; 
                                position: relative; box-shadow: 0 2px 15px rgba(0,0,0,0.1);
                                direction: rtl; text-align: right; font-family: inherit;`;

        const initH = savedData?.h || "08";
        const initM = savedData?.m || "00";
        const initS = savedData?.s || "00";
        const initOffset = savedData?.offset !== undefined ? savedData.offset : 800;
        const initDelay = savedData?.delay || 1500;

        settingsSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 25px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 220px;">
                    <h4 style="color: #1b1c1d; margin-bottom: 15px;">کنترل ربات</h4>
                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
                         <button id="btn-start" style="background: #2185d0; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s;">شروع اسنایپر</button>
                         <button id="btn-inject" style="background: #f0f0f0; color: #333; border: 1px solid #ccc; padding: 10px 15px; border-radius: 6px; cursor: pointer;">اسکن مجدد صفحه</button>
                    </div>
                    <div style="font-size: 13px;">
                        وضعیت: <span id="sniper-status-text" style="color: #db2828; font-weight: bold;">● غیرفعال / آماده</span>
                    </div>
                </div>

                <div style="flex: 1; min-width: 230px;">
                    <h4 style="color: #1b1c1d; margin-bottom: 15px;">تنظیمات زمان‌بندی</h4>
                    <div style="display: flex; gap: 6px; margin-bottom: 8px; align-items: center; direction: ltr; justify-content: flex-end;">
                        <span style="font-size: 11px; color: #888; margin-right: 8px;">(ساعت شروع)</span>
                        <input type="number" id="s-h" value="${initH}" min="0" max="23" class="sniper-force-en" style="width: 44px; text-align: center;">
                        <span style="font-weight: bold;">:</span>
                        <input type="number" id="s-m" value="${initM}" min="0" max="59" class="sniper-force-en" style="width: 44px; text-align: center;">
                        <span style="font-weight: bold;">:</span>
                        <input type="number" id="s-s" value="${initS}" min="0" max="59" class="sniper-force-en" style="width: 44px; text-align: center;">
                    </div>
                    <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center; justify-content: flex-start; flex-wrap: wrap;">
                        <input type="number" id="s-offset" value="${initOffset}" min="-5000" max="10000" step="10" class="sniper-force-en" style="width: 72px; text-align: center;">
                        <span style="font-size: 11px; color: #888;">آفست شروع (ms)</span>
                        <button id="btn-auto-offset" type="button" style="background: #e0f2fe; color: #0284c7; border: 1px solid #7dd3fc; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: bold; cursor: pointer; transition: 0.15s;" title="محاسبه خودکار پینگ و اختلاف ساعت با سرور شریف">⚡ محاسبه آفست</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; direction: ltr;">
                        <input type="range" id="s-gd" min="800" max="3000" step="50" value="${initDelay}" style="flex: 1; cursor: pointer;">
                        <span class="sniper-force-en" style="font-size: 12px; white-space: nowrap; width: 95px;">Delay: <b id="val-gd">${initDelay}</b> ms</span>
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">فاصله بین درخواست‌ها (توصیه: ۱۱۵۰ الی ۱۵۰۰ میلی‌ثانیه)</div>
                </div>

                <div style="flex: 1.5; min-width: 320px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
                        <h4 style="color: #1b1c1d; margin: 0;">صف اولویت دروس (اخذ / حذف)</h4>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button id="btn-export-cfg" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: #334155; font-weight: bold;" title="کپی کردن تنظیمات و درس‌ها در کلیپ‌بورد برای ارسال به دیگران">📋 کپی تنظیمات</button>
                            <button id="btn-import-cfg" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: #334155; font-weight: bold;" title="وارد کردن تنظیمات و دروس از شخص دیگر">📥 بارگذاری</button>
                            <label style="font-size: 11px; cursor: pointer; color: #555; display: flex; align-items: center; gap: 4px; margin-right: 4px;">
                                <input type="checkbox" id="toggle-sound" ${sniperState.soundEnabled ? 'checked' : ''}> 🔊 صدا
                            </label>
                            <label style="font-size: 11px; cursor: pointer; color: #555; display: flex; align-items: center; gap: 4px;">
                                <input type="checkbox" id="toggle-logs"> 📋 گزارش‌ها
                            </label>
                        </div>
                    </div>
                    <div id="sniper-course-list" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; font-size: 12px; color: #334155; margin-bottom: 8px; min-height: 48px; max-height: 180px; overflow-y: auto;">
                        درسی انتخاب نشده است.
                    </div>
                    <div id="sniper-logs-container" style="display: none;">
                        <div id="sniper-logs" class="sniper-force-en" style="direction: ltr; text-align: left; background: #1b1c1d; color: #eee; padding: 12px; border-radius: 6px; height: 130px; overflow-y: auto;">
                            سیستم آماده به کار است.
                        </div>
                    </div>
                </div>
            </div>

            <!-- بخش مدیریت و حذف سریع دروس اخذ شده -->
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h4 style="color: #0f172a; margin: 0;">دروس اخذ شده شما (امکان حذف سریع)</h4>
                        <span id="sniper-enrolled-units" style="font-size: 12px; color: #64748b; font-weight: bold;"></span>
                    </div>
                    <button id="btn-refresh-enrolled" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer; color: #334155; font-weight: bold;">🔄 بروزرسانی لیست دروس اخذ شده</button>
                </div>
                <div id="sniper-enrolled-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px;">
                    <!-- لیست به صورت پویا ساخته می‌شود -->
                </div>
            </div>
        `;

        menu.parentNode.insertBefore(settingsSection, menu.nextSibling);

        menuItem.onclick = (e) => {
            e.preventDefault();
            const isVisible = settingsSection.style.display === 'block';
            settingsSection.style.display = isVisible ? 'none' : 'block';
            menuItem.classList.toggle('active', !isVisible);
            if (!isVisible) renderEnrolledCoursesList();
        };

        const btnRefEnrolled = document.getElementById('btn-refresh-enrolled');
        if (btnRefEnrolled) btnRefEnrolled.onclick = renderEnrolledCoursesList;

        const btnExport = document.getElementById('btn-export-cfg');
        if (btnExport) {
            btnExport.onclick = () => {
                saveSettings();
                const raw = localStorage.getItem(STORAGE_KEY);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(raw).then(() => {
                        notify("تنظیمات و لیست دروس با موفقیت کپی شد!", "success");
                    }).catch(() => {
                        prompt("کد زیر را کپی کنید:", raw);
                    });
                } else {
                    prompt("کد زیر را کپی کنید:", raw);
                }
            };
        }

        const btnImport = document.getElementById('btn-import-cfg');
        if (btnImport) {
            btnImport.onclick = () => {
                const text = prompt("کد دریافتی از دوستتان را در کادر زیر پیست کنید:");
                if (text && text.trim()) {
                    try {
                        const parsed = JSON.parse(text.trim());
                        if (parsed.priorityQueue) {
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                            notify("تنظیمات اعمال شد! در حال بارگذاری مجدد...", "success");
                            setTimeout(() => location.reload(), 500);
                        } else {
                            notify("فرمت کد نامعتبر است!", "error");
                        }
                    } catch {
                        notify("کد وارد شده معتبر نیست!", "error");
                    }
                }
            };
        }

        const logToggle = document.getElementById('toggle-logs');
        if (logToggle) {
            logToggle.onchange = (e) => {
                document.getElementById('sniper-logs-container').style.display = e.target.checked ? 'block' : 'none';
            };
        }

        const soundToggle = document.getElementById('toggle-sound');
        if (soundToggle) {
            soundToggle.onchange = (e) => {
                sniperState.soundEnabled = e.target.checked;
                saveSettings();
                if (e.target.checked) playSound('warn');
            };
        }

        const gdInput = document.getElementById('s-gd');
        if (gdInput) {
            gdInput.oninput = (e) => {
                document.getElementById('val-gd').innerText = e.target.value;
                sniperState.globalDelay = parseInt(e.target.value);
                saveSettings();
            };
        }

        ['s-h', 's-m', 's-s', 's-offset'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onchange = saveSettings;
        });

        const btnAutoOffset = document.getElementById('btn-auto-offset');
        if (btnAutoOffset) {
            btnAutoOffset.onclick = () => autoCalibrateOffset(true);
        }

        const btnInject = document.getElementById('btn-inject');
        if (btnInject) btnInject.onclick = injectCheckboxes;

        const btnStart = document.getElementById('btn-start');
        if (btnStart) btnStart.onclick = toggleSniper;

        updateStatus();
        renderEnrolledCoursesList();
    };

    const updateUIAfterStop = () => {
        if (sniperState.standbyTimeout) {
            clearTimeout(sniperState.standbyTimeout);
            sniperState.standbyTimeout = null;
        }
        sniperState.isStandby = false;
        sniperState.targetTime = null;
        const btn = document.getElementById('btn-start');
        const statusText = document.getElementById('sniper-status-text');
        if (!btn) return;
        btn.innerText = "شروع اسنایپر";
        btn.style.background = "#2185d0";
        if (statusText) {
            statusText.style.color = "#db2828";
            statusText.innerText = "● غیرفعال / آماده";
        }
    };

    const toggleSniper = () => {
        const btn = document.getElementById('btn-start');
        const statusText = document.getElementById('sniper-status-text');
        if (sniperState.isRunning) {
            sniperState.isRunning = false;
            updateUIAfterStop();
            addLog("اسنایپر متوقف شد.");
            notify("اسنایپر متوقف شد.", "info");
        } else {
            if (sniperState.priorityQueue.length === 0) {
                notify("ابتدا درس‌های مورد نظر را انتخاب کنید!", "error");
                return;
            }
            initKnownJobs();
            setupCapacityWatcher();
            let h = parseInt(document.getElementById('s-h').value) || 0;
            const m = parseInt(document.getElementById('s-m').value) || 0;
            const s = parseInt(document.getElementById('s-s').value) || 0;
            const offset = parseInt(document.getElementById('s-offset')?.value) || 0;
            
            // Smart 12h -> 24h conversion: if user entered 1..11 in afternoon/evening (e.g. 4 for 16:00)
            const currentHour = new Date().getHours();
            if (h >= 1 && h <= 11 && currentHour >= 12) {
                const testPast = new Date();
                testPast.setHours(h, m, s, 0);
                if (testPast.getTime() + offset < Date.now()) {
                    const testPm = new Date();
                    testPm.setHours(h + 12, m, s, 0);
                    if (testPm.getTime() + offset > Date.now()) {
                        h += 12;
                        const hInput = document.getElementById('s-h');
                        if (hInput) hInput.value = h.toString().padStart(2, '0');
                        notify(`ساعت شروع به صورت خودکار به فرمت ۲۴ ساعته (${h}:${m.toString().padStart(2, '0')}) تنظیم شد.`, "info");
                    }
                }
            }

            const t = new Date();
            t.setHours(h, m, s, 0);
            const targetTimestamp = t.getTime() + offset;
            sniperState.targetTime = new Date(targetTimestamp);
            sniperState.isRunning = true;
            btn.innerText = "توقف اسنایپر";
            btn.style.background = "#db2828";
            
            const diff = targetTimestamp - Date.now();
            if (diff > 0) {
                sniperState.isStandby = true;
                if (statusText) {
                    statusText.style.color = "#f59e0b";
                    statusText.innerText = `● آماده‌باش (شروع در ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')})`;
                }
                const offsetSign = offset >= 0 ? `+${offset}` : `${offset}`;
                notify(`آماده‌باش: شروع شلیک در ساعت ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} (آفست: ${offsetSign}ms)`, "info");
                addLog(`⏳ حالت آماده‌باش فعال شد. اسنایپر تا رسیدن به ساعت ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} کاملاً غیرفعال خواهد بود.`);
                
                if (sniperState.standbyTimeout) clearTimeout(sniperState.standbyTimeout);
                sniperState.standbyTimeout = setTimeout(() => {
                    sniperState.isStandby = false;
                    sniperState.standbyTimeout = null;
                    if (statusText) {
                        statusText.style.color = "#2185d0";
                        statusText.innerText = "● در حال شلیک...";
                    }
                    notify(`🚀 ساعت شروع فرا رسید! آغاز عملیات اسنایپ...`, "success");
                    addLog(`🚀 زمان هدف فرا رسید. شروع اجرای عملیات...`);
                    engineLoop();
                }, diff);
            } else { 
                sniperState.isStandby = false;
                if (statusText) {
                    statusText.style.color = "#2185d0";
                    statusText.innerText = "● در حال شلیک...";
                }
                engineLoop(); 
            }
        }
    };

    async function engineLoop() {
        if (!sniperState.isRunning) return;
        if (sniperState.isStandby || (sniperState.targetTime && Date.now() < sniperState.targetTime.getTime())) return;
        console.log("%c[Sniper] Loop Started.", "color: #2185d0; font-weight: bold;");
        const statusText = document.getElementById('sniper-status-text');
        if (statusText) {
            statusText.style.color = "#2185d0";
            statusText.innerText = "● در حال شلیک...";
        }

        while (sniperState.isRunning && sniperState.priorityQueue.length > 0) {
            const allRows = Array.from(document.querySelectorAll('tr'));
            const now = Date.now();

            // Iterate strictly in order of Priority Queue
            for (const courseFullId of Array.from(sniperState.priorityQueue)) {
                if (!sniperState.isRunning) break;
                
                const action = sniperState.courseActions[courseFullId] || "add";
                const isRemove = action === "remove";
                const courseName = sniperState.courseNames[courseFullId] || courseFullId;
                const code = courseFullId.split('-')[0];
                const group = courseFullId.split('-')[1];
                
                const row = allRows.find(r => 
                    (r.innerText.includes(courseFullId) || r.innerText.includes(e2p(courseFullId))) ||
                    (r.innerText.includes(e2p(code)) && r.innerText.includes(e2p(group)))
                );

                // Visual & State Check (Sync)
                const reduxCourses = getReduxStore()?.getState()?.enrolledCourses;
                const isSecured = (row && (
                                    row.querySelector('.checkmark.icon') || 
                                    row.innerText.includes('ویرایش ثبت‌نام') ||
                                    row.classList.contains('positive') || 
                                    (row.style.backgroundColor && row.style.backgroundColor.includes('rgb(209, 250, 229)'))
                                  )) ||
                                  (Array.isArray(reduxCourses) && reduxCourses.some(c => c?.id === courseFullId || c?.id === code));

                // If adding and already enrolled -> complete
                if (!isRemove && isSecured) {
                    notify(`تأیید شد: ${courseName} اخذ شد! 🎉`, "success");
                    addLog(`تأیید شد: درس ${courseName} قبلاً در لیست دروس قرار دارد.`);
                    removeCourseFromQueue(courseFullId);
                    continue;
                }

                // If removing and already NOT enrolled -> complete
                if (isRemove && !isSecured && (!row || (!row.querySelector('.checkmark.icon') && !row.classList.contains('positive')))) {
                    notify(`تأیید شد: درس ${courseName} حذف شده است.`, "info");
                    addLog(`تأیید شد: درس ${courseName} در لیست دروس شما قرار ندارد (حذف شده).`);
                    removeCourseFromQueue(courseFullId);
                    continue;
                }

                if (!sniperState.lastAttempt[courseFullId] || (now - sniperState.lastAttempt[courseFullId] > sniperState.retryDelay)) {
                    
                    // 1. Get exact units and live capacity from Redux
                    let units = sniperState.courseUnits[courseFullId];
                    let isCourseFull = false;
                    let capStatus = "";
                    try {
                        const store = getReduxStore();
                        const offered = store?.getState()?.offeredCourses;
                        if (Array.isArray(offered)) {
                            const match = offered.find(c => c.id === courseFullId || `${c.number}-${c.group}` === courseFullId || c.number == code);
                            if (match) {
                                if (match.units) units = parseInt(match.units);
                                if (!isRemove && match.capacity > 0 && match.count >= match.capacity) {
                                    isCourseFull = true;
                                    capStatus = `(${match.count}/${match.capacity})`;
                                }
                            }
                        }
                    } catch(e) {}

                    // 2. Fallback: Parse from table row cells (cell after group is units)
                    if (!units && row) {
                        const cellList = Array.from(row.querySelectorAll('td'));
                        for (let i = 0; i < cellList.length; i++) {
                            const val = p2e(cellList[i].innerText.trim());
                            if (/^[0-9]{5}$/.test(val) && cellList[i + 2]) {
                                const u = parseInt(p2e(cellList[i + 2].innerText.trim()));
                                if (u >= 1 && u <= 6) { units = u; break; }
                            }
                        }
                    }
                    units = units || 3;

                    // If adding and course is full according to real-time Redux, log and watch with fast 4s cycle
                    if (!isRemove && isCourseFull) {
                        addLog(`در حال رصد ظرفیت: ${courseName} تکمیل است ${capStatus}. گوش‌به‌زنگ باز شدن...`);
                        sniperState.lastAttempt[courseFullId] = now - (sniperState.retryDelay - 4000);
                        continue;
                    }

                    sniperState.lastAttempt[courseFullId] = Date.now();
                    
                    // Fire request with appropriate action ('add' or 'remove')
                    fireRequest(courseFullId, units, action); 

                    // Mandatory delay after firing
                    await new Promise(r => setTimeout(r, sniperState.globalDelay)); 
                }
            }
            
            // Small gap between rounds
            await new Promise(r => setTimeout(r, 500));
        }
        
        if (sniperState.priorityQueue.length === 0 && sniperState.isRunning) {
            notify("تمامی عملیات دروس انتخابی به پایان رسید! 🎉", "success");
            sniperState.isRunning = false;
            updateUIAfterStop();
        }
    }

    // Auto-detect and hook UI on SPA DOM changes
    const autoSetup = () => {
        createIntegratedUI();
        injectCheckboxes();
        initKnownJobs();
        setupCapacityWatcher();
        renderEnrolledCoursesList();
        autoCalibrateOffset(false);
    };

    // Initial setup
    autoSetup();
    notify("اسنایپر شریف آماده به کار است.", "info");

    // Keyboard shortcut for quick emergency stop (Escape key)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sniperState.isRunning) {
            toggleSniper();
            notify("توقف اضطراری (کلید Esc فشرده شد).", "warn");
        }
    });

    // Periodic check to handle client-side SPA route/page changes
    setInterval(() => {
        if (!document.getElementById('sniper-menu-item') && document.querySelector('.ui.menu')) {
            createIntegratedUI();
        }
        if (document.querySelector('tr') && !document.querySelector('.sniper-select')) {
            injectCheckboxes();
        }
    }, 1500);

})();
