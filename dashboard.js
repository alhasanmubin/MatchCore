// ==========================================
// DATA STORAGE & DATABASE CONFIG
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    push,
    get,
    onValue,
    remove,
    update
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app); 

const CLOUD_NAME = "smocyqdq";
const UPLOAD_PRESET = "csfootball";

// আধুনিক মডার্ন টোস্ট নোটিফিকেশন ইঞ্জিন
function showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px;";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.style.cssText = `
        padding: 12px 24px;
        border-radius: 8px;
        color: #fff;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 10);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(20px)";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
const UPLOAD_PRESET = "csfootball";

let homeGoal = 0;
let awayGoal = 0;
let matches=[];
let teams = [];
window.teams = teams;
let editingTeamId = null;
let editingScheduleId = null; // রিশিডিউল ট্র্যাক করার জন্য
let currentSettings = {}; // সিজন, ব্যানার ও ব্যাকগ্রাউন্ড ট্র্যাকার

let points={};

// ==========================
// MATCH EVENTS STATE
// ==========================
let goals = [];
let cards = [];
let penalties = [];

async function syncTimelineToFirebase() {
    await update(ref(db, "liveMatch"), {
        goals,
        cards,
        penalties
    });
}

// ==========================
// MATCH TIMER STATE
// ==========================
let timerInterval = null;
let matchSeconds = 0;
let timerRunning = false;
let autoHalfDone = false;
let autoFullDone = false;

// ==========================
// HELPERS (YOUTUBE, TEAM LABELS, ETC.)
// ==========================

// ইউটিউব আইডি এক্সট্রাকশন হেল্পার
function getYouTubeId(url) {
    if (!url) return "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}

// হোম এবং অ্যাওয়ে টিমের আসল নাম পাওয়ার হেল্পার
function getTeamNameLabels() {
    const teamAEl = document.getElementById("teamA");
    const teamBEl = document.getElementById("teamB");
    const teamA = teamAEl ? teamAEl.value.trim() : "Home Team";
    const teamB = teamBEl ? teamBEl.value.trim() : "Away Team";
    return { teamA, teamB };
}

// ড্রপডাউন অপশনগুলোতে "Home/Away" এর জায়গায় আসল টিমের নাম সিঙ্ক করা
function updateDropdownLabels() {
    const { teamA, teamB } = getTeamNameLabels();
    
    const goalTeam = document.getElementById("goalTeam");
    if (goalTeam && goalTeam.options && goalTeam.options.length >= 2) {
        goalTeam.options[0].text = teamA;
        goalTeam.options[1].text = teamB;
    }
    const cardTeam = document.getElementById("cardTeam");
    if (cardTeam && cardTeam.options && cardTeam.options.length >= 2) {
        cardTeam.options[0].text = teamA;
        cardTeam.options[1].text = teamB;
    }
    const penaltyTeam = document.getElementById("penaltyTeam");
    if (penaltyTeam && penaltyTeam.options && penaltyTeam.options.length >= 2) {
        penaltyTeam.options[0].text = teamA;
        penaltyTeam.options[1].text = teamB;
    }
}

// ==========================
// SCORE CONTROL CENTER
// ==========================
const homeScore = document.getElementById("homeScore");
const awayScore = document.getElementById("awayScore");

document.getElementById("homePlus").onclick = async () => {
    homeGoal++;
    homeScore.innerText = homeGoal;
    await update(ref(db, "liveMatch"), { homeGoal, awayGoal });
};

document.getElementById("homeMinus").onclick = async () => {
    if (homeGoal > 0) {
        homeGoal--;
        homeScore.innerText = homeGoal;
        await update(ref(db, "liveMatch"), { homeGoal, awayGoal });
    }
};

document.getElementById("awayPlus").onclick = async () => {
    awayGoal++;
    awayScore.innerText = awayGoal;
    await update(ref(db, "liveMatch"), { homeGoal, awayGoal });
};

document.getElementById("awayMinus").onclick = async () => {
    if (awayGoal > 0) {
        awayGoal--;
        awayScore.innerText = awayGoal;
        await update(ref(db, "liveMatch"), { homeGoal, awayGoal });
    }
};

document.getElementById("plusExtra").onclick = async () => {
    document.getElementById("extraTime").value++;
    await update(ref(db, "liveMatch"), {
        extraTime: Number(document.getElementById("extraTime").value)
    });
};

document.getElementById("minusExtra").onclick = async () => {
    let t = Number(document.getElementById("extraTime").value);
    if (t > 0) {
        document.getElementById("extraTime").value = t - 1;
        await update(ref(db, "liveMatch"), {
            extraTime: Number(document.getElementById("extraTime").value)
        });
    }
};

// ==========================
// MATCH CONTROLS & STATUS CHANGED
// ==========================
document.getElementById("status").addEventListener("change", async () => {
    const statusVal = document.getElementById("status").value;
    
    if (statusVal === "HALF_TIME" || statusVal === "FULL_TIME" || statusVal === "PAUSED") {
        stopMatchTimer();
    } else if (statusVal === "LIVE") {
        startMatchTimer();
    }

    await update(ref(db, "liveMatch"), {
        status: statusVal,
        timerRunning: timerRunning,
        timerBaseSeconds: matchSeconds,
        timerStartedAt: timerRunning ? Date.now() - (matchSeconds * 1000) : 0,
        matchTime: document.getElementById("matchTime").value
    });
});

const updateMatchBtn = document.getElementById("updateMatch");
if (updateMatchBtn) {
    updateMatchBtn.addEventListener("click", async () => {
        const teamAEl = document.getElementById("teamA");
        const teamBEl = document.getElementById("teamB");
        if (!teamAEl || !teamBEl) return;
        
        const teamA = teamAEl.value.trim();
        const teamB = teamBEl.value.trim();

        if (!teamA || !teamB) {
            alert("Please select both teams.");
            return;
        }

        if (teamA === teamB) {
            alert("Home Team and Away Team cannot be the same.");
            return;
        }

        const timeStr = document.getElementById("matchTime").value.trim();
        const parts = timeStr.split(":");
        if (parts.length === 2) {
            const min = parseInt(parts[0], 10) || 0;
            const sec = parseInt(parts[1], 10) || 0;
            matchSeconds = (min * 60) + sec;
        } else if (parts.length === 1 && !isNaN(parts[0])) {
            matchSeconds = (parseInt(parts[0], 10) || 0) * 60;
        }
        updateTimerDisplay();

        if (!timerRunning) {
            startMatchTimer();
        }

        const rawYoutube = document.getElementById("youtubeUrl").value.trim();
        const cleanYoutubeId = getYouTubeId(rawYoutube);

        const liveData = {
            goals,
            cards,
            penalties,
            timerRunning,
            timerBaseSeconds: matchSeconds,
            timerStartedAt: timerRunning ? Date.now() - (matchSeconds * 1000) : 0,
            teamA,
            teamB,
            homeGoal,
            awayGoal,
            status: document.getElementById("status").value,
            matchTime: document.getElementById("matchTime").value,
            duration: document.getElementById("matchDuration").value === "custom"
                ? document.getElementById("customDuration").value
                : document.getElementById("matchDuration").value,
            extraTime: Number(document.getElementById("extraTime").value),
            commentary: document.getElementById("commentary").value,
            youtube: cleanYoutubeId,
            youtubeUrl: cleanYoutubeId, 
            updatedAt: Date.now()
        };

        updateMatchBtn.disabled = true;
        updateMatchBtn.innerText = "⏳ Updating Match...";
        try {
            await set(ref(db, "liveMatch"), liveData);
            showToast("Live Match Updated 🚀", "success");
        } catch (err) {
            showToast("Update Failed: " + err.message, "danger");
        } finally {
            updateMatchBtn.disabled = false;
            updateMatchBtn.innerText = "🚀 Update Match";
        }
    });
}

// ==========================
// ADD SCHEDULE MATCH
// ==========================
document.getElementById("addSchedule").addEventListener("click", async () => {
    const teamA = document.getElementById("s_teamA").value.trim();
    const teamB = document.getElementById("s_teamB").value.trim();
    const date = document.getElementById("s_date").value;
    const time = document.getElementById("s_time").value;
    const stage = document.getElementById("s_stage").value;
    const venue = document.getElementById("s_venue").value;

    if (!teamA || !teamB || !date || !time || teamA === teamB) {
        alert("Please fill all fields correctly.");
        return;
    }

    const matchData = {
        teamA, teamB, date, time, venue, stage,
        status: editingScheduleId ? document.getElementById("s_status").value : "Upcoming"
    };

    if (editingScheduleId) {
        await update(ref(db, "matches/" + editingScheduleId), matchData);
        editingScheduleId = null;
        document.getElementById("addSchedule").innerText = "➕ Save Scheduled Match";
        document.getElementById("scheduleStatusCol").classList.add("hidden");
        alert("Schedule Updated Successfully! 🔄");
    } else {
        const duplicate = matches.find(m =>
            m.teamA.toLowerCase() === teamA.toLowerCase() &&
            m.teamB.toLowerCase() === teamB.toLowerCase() &&
            m.date === date &&
            m.time === time
        );
        if (duplicate) { alert("This match already exists."); return; }
        await push(ref(db, "matches"), matchData);
        alert("Match Added to Schedule 📅");
    }

    document.getElementById("s_teamA").value = "";
    document.getElementById("s_teamB").value = "";
    document.getElementById("s_date").value = "";
    document.getElementById("s_time").value = "";
    document.getElementById("s_venue").value = "";
    document.getElementById("s_stage").selectedIndex = 0;
});

// ==========================
// TIMER ENGINE LOGIC
// ==========================
function updateTimerDisplay() {
    const input = document.getElementById("matchTime");
    if (document.activeElement === input) return;

    const min = Math.floor(matchSeconds / 60);
    const sec = Math.floor(matchSeconds % 60);
    input.value = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function getMatchDurationMinutes() {
    const duration = document.getElementById("matchDuration").value;
    if (duration === "custom") {
        return Number(document.getElementById("customDuration").value) || 90;
    }
    return Number(duration);
}

function startMatchTimer() {
    if (timerRunning) return;
    timerRunning = true;

    timerInterval = setInterval(async () => {
        matchSeconds++;
        updateTimerDisplay();

        const totalMinutes = getMatchDurationMinutes();
        const halfMinutes = Math.floor(totalMinutes / 2);
        let status = document.getElementById("status").value;

        if (!autoHalfDone && Math.floor(matchSeconds / 60) >= halfMinutes) {
            autoHalfDone = true;
            status = "HALF_TIME";
            stopMatchTimer();
            document.getElementById("status").value = status;
            await update(ref(db, "liveMatch"), {
                status,
                matchTime: document.getElementById("matchTime").value
            });
            alert("⏸ Half Time\n\nTo start 2nd Half change to LIVE and click Update.");
            return;
        }

        if (!autoFullDone && Math.floor(matchSeconds / 60) >= totalMinutes) {
            autoFullDone = true;
            status = "FULL_TIME";
            document.getElementById("status").value = status;
            stopMatchTimer();
            await update(ref(db, "liveMatch"), {
                status,
                matchTime: document.getElementById("matchTime").value
            });
            alert("🏁 Full Time Completed!");
            return;
        }
    }, 1000);
}

function stopMatchTimer() {
    timerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    update(ref(db, "liveMatch"), {
        timerRunning: false,
        timerBaseSeconds: matchSeconds
    });
}

function resetMatchTimer() {
    stopMatchTimer();
    matchSeconds = 0;
    autoHalfDone = false;
    autoFullDone = false;
    updateTimerDisplay();
}

// ==========================
// POINT SYSTEM ENGINE
// ==========================
function resetLiveMatchForm() {
    homeGoal = 0;
    awayGoal = 0;
    document.getElementById("homeScore").innerText = "0";
    document.getElementById("awayScore").innerText = "0";
    
    // Unlocks selection inputs correctly
    document.getElementById("teamA").disabled = false;
    document.getElementById("teamB").disabled = false;
    document.getElementById("teamA").value = "";
    document.getElementById("teamB").value = "";
    document.getElementById("teamALogo").src = "https://placehold.co/100x100?text=HOME";
    document.getElementById("teamBLogo").src = "https://placehold.co/100x100?text=AWAY";
    document.getElementById("status").value = "LIVE";
    document.getElementById("matchTime").value = "";
    document.getElementById("extraTime").value = 0;
    document.getElementById("commentary").value = "";
    document.getElementById("youtubeUrl").value = "";

    goals = [];
    cards = [];
    penalties = [];
    document.getElementById("goalTimeline").innerHTML = "";
    document.getElementById("cardTimeline").innerHTML = "";
    document.getElementById("penaltyTimeline").innerHTML = "";
    document.getElementById("cardCounter").innerText = "0 Yellow • 0 Red";
    document.getElementById("penHomeIcons").innerHTML = "";
    document.getElementById("penAwayIcons").innerHTML = "";
    document.getElementById("penaltyWinnerNotice").innerText = "Winner: None";
    updateDropdownLabels();
}

async function updatePoints(teamA, teamB, score) {
    if (!teamA || !teamB || !score.includes("-")) return;

    const actualTeamA = teams.find(t => t.name.toLowerCase() === teamA.toLowerCase().trim())?.name || teamA.trim();
    const actualTeamB = teams.find(t => t.name.toLowerCase() === teamB.toLowerCase().trim())?.name || teamB.trim();

    let [a, b] = score.split("-").map(x => parseInt(x.trim()));

    const rulesSnapshot = await get(ref(db, "rules"));
    const rules = rulesSnapshot.val() || { winPoint: 3, drawPoint: 1, lossPoint: 0 };
    const winPoints = Number(rules.winPoint);
    const drawPoints = Number(rules.drawPoint);
    const lossPoints = Number(rules.lossPoint);

    if (!points[actualTeamA]) points[actualTeamA] = { MP: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 };
    if (!points[actualTeamB]) points[actualTeamB] = { MP: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 };

    points[actualTeamA].MP++;
    points[actualTeamB].MP++;
    points[actualTeamA].GF += a;
    points[actualTeamA].GA += b;
    points[actualTeamB].GF += b;
    points[actualTeamB].GA += a;

    points[actualTeamA].GD = points[actualTeamA].GF - points[actualTeamA].GA;
    points[actualTeamB].GD = points[actualTeamB].GF - points[actualTeamB].GA;

    if (a > b) {
        points[actualTeamA].W++;
        points[actualTeamA].PTS += winPoints;
        points[actualTeamB].L++;
        points[actualTeamB].PTS += lossPoints;
    } else if (b > a) {
        points[actualTeamB].W++;
        points[actualTeamB].PTS += winPoints;
        points[actualTeamA].L++;
        points[actualTeamA].PTS += lossPoints;
    } else {
        points[actualTeamA].D++;
        points[actualTeamB].D++;
        points[actualTeamA].PTS += drawPoints;
        points[actualTeamB].PTS += drawPoints;
    }

    await set(ref(db, "points"), points);
}

// ==========================
// MASTER STATE SAVER & HANDLERS
// ==========================
document.getElementById("unlockTeamsBtn").addEventListener("click", async () => {
    const confirmReset = confirm("WARNING: Reset active teams mid-match? It will clear current session.");
    if (confirmReset) {
        await set(ref(db, "liveMatch"), {});
        resetLiveMatchForm();
        resetMatchTimer();
        alert("Session Unlocked ✅");
    }
});

document.getElementById("saveMatch").addEventListener("click", async () => {
    const teamA = document.getElementById("teamA").value;
    const teamB = document.getElementById("teamB").value;
    const status = document.getElementById("status").value;

    if (status !== "FULL_TIME") {
        alert("Match must be FULL_TIME before saving.");
        return;
    }
    const score = `${homeGoal} - ${awayGoal}`;

    const currentMatch = matches.find(m =>
        m.teamA.trim().toLowerCase() === teamA.trim().toLowerCase() &&
        m.teamB.trim().toLowerCase() === teamB.trim().toLowerCase() &&
        m.status === "Upcoming"
    );

    if (!currentMatch) {
        alert("Active upcoming fixture not found in schedule.");
        return;
    }

    await updatePoints(teamA, teamB, score);

    await update(ref(db, "matches/" + currentMatch.id), {
        status: "Completed",
        score: score,
        homeGoal: homeGoal,
        awayGoal: awayGoal,
        goals: goals,
        cards: cards,
        penalties: penalties,
        penaltyShootout: document.getElementById("penaltyWinnerNotice") ? document.getElementById("penaltyWinnerNotice").innerText : ""
    });
    
    await set(ref(db, "liveMatch"), {});
    resetLiveMatchForm();
    resetMatchTimer();
    alert("Standings updated & Final Match Saved ✅");
});

function renderPoints() {
    const body = document.getElementById("table-body");
    if (!body) return;
    body.innerHTML = "";
    let teamNames = Object.keys(points);

    teamNames.sort((a, b) => {
        if (points[b].PTS !== points[a].PTS) return points[b].PTS - points[a].PTS;
        return points[b].GD - points[a].GD;
    });

    teamNames.forEach(t => {
        let p = points[t];
        const teamData = teams.find(x => x.name && x.name.toLowerCase().trim() === t.toLowerCase().trim());
        const logo = teamData?.logo || `https://placehold.co/100x100?text=${encodeURIComponent(t)}`;
        body.innerHTML += `
        <tr>
            <td>
                <div class="tableTeam">
                    <img src="${logo}" class="tableLogo" onerror="this.src='https://placehold.co/40x40?text=TEAM'">
                    <span>${t}</span>
                </div>
            </td>
            <td>${p.MP}</td>
            <td>${p.W}</td>
            <td>${p.D}</td>
            <td>${p.L}</td>
            <td>${p.GF}</td>
            <td>${p.GA}</td>
            <td>${p.GD}</td>
            <td><b>${p.PTS}</b></td>
        </tr>`;
    });
}

// ==========================
// NAVIGATION & SIDEBAR
// ==========================
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const menuItems = document.querySelectorAll(".sidebar li[data-page]");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("pageTitle");

menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("active");
});

menuItems.forEach(item => {
    item.addEventListener("click", () => {
        menuItems.forEach(i => i.classList.remove("active"));
        pages.forEach(p => p.classList.remove("active"));

        item.classList.add("active");

        const page = document.getElementById(item.dataset.page);
        if (page) page.classList.add("active");

        // টাইটেলে ক্যালেন্ডার নিয়নে ব্যাজ জেনারেটর সিঙ্ক
        if (item.dataset.page === "schedule") {
            pageTitle.innerHTML = `<span class="dynamic-calendar-target"></span> Schedule Manager`;
            initDynamicCalendar();
        } else {
            pageTitle.textContent = item.textContent;
        }

        if (window.innerWidth <= 768) {
            sidebar.classList.remove("active");
        }
    });
});

const duration = document.getElementById("matchDuration");
const custom = document.getElementById("customDuration");
duration.onchange = () => {
    custom.style.display = duration.value === "custom" ? "block" : "none";
};

// ==========================
// FIREBASE LIVE LISTENERS
// ==========================
onValue(ref(db, "points"), snapshot => {
    points = snapshot.val() || {};
    renderPoints();
});

onValue(ref(db, "matches"), snapshot => {
    matches = [];
    snapshot.forEach(item => {
        matches.push({
            id: item.key,
            ...item.val()
        });
    });
    renderSchedule();
});

onValue(ref(db, "liveMatch"), (snapshot) => {
    const data = snapshot.val();
    if (!data || Object.keys(data).length === 0) {
        resetLiveMatchForm();
        return;
    }

    homeGoal = data.homeGoal || 0;
    awayGoal = data.awayGoal || 0;
    document.getElementById("homeScore").innerText = homeGoal;
    document.getElementById("awayScore").innerText = awayGoal;

    goals = data.goals || [];
    cards = data.cards || [];
    penalties = data.penalties || [];

    document.getElementById("matchTime").value = data.matchTime || "00:00";
    document.getElementById("status").value = data.status || "LIVE";
    document.getElementById("extraTime").value = data.extraTime || 0;
    document.getElementById("commentary").value = data.commentary || "";
    document.getElementById("youtubeUrl").value = data.youtube || "";

    if (data.teamA && data.teamB) {
        document.getElementById("teamA").value = data.teamA;
        document.getElementById("teamB").value = data.teamB;
        document.getElementById("teamA").disabled = true;
        document.getElementById("teamB").disabled = true;
        document.getElementById("unlockTeamsBtn").classList.remove("hidden");
        updateTeamLogo("teamA", "teamALogo");
        updateTeamLogo("teamB", "teamBLogo");
    } else {
        document.getElementById("teamA").disabled = false;
        document.getElementById("teamB").disabled = false;
        document.getElementById("unlockTeamsBtn").classList.add("hidden");
    }

    updateDropdownLabels();
    renderGoals();
    renderCards();
    renderPenalties();

    if (data.timerRunning) {
        matchSeconds = Math.floor((Date.now() - (data.timerStartedAt || Date.now())) / 1000);
        updateTimerDisplay();
        if (!timerRunning) {
            startMatchTimer();
        }
    } else {
        matchSeconds = data.timerBaseSeconds || 0;
        updateTimerDisplay();
        if (timerRunning) {
            timerRunning = false;
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }
    }
});

onValue(ref(db, "teams"), snapshot => {
    teams = [];
    snapshot.forEach(item => {
        teams.push({
            id: item.key,
            ...item.val()
        });
    });
    window.teams = teams;
    renderTeams();
    loadTeamList();
    renderPoints();
    renderSchedule(); // Cured: Re-renders schedule to guarantee logos display on refresh
});

function loadTeamList() {
    const list = document.getElementById("teamList");
    if (!list) return;
    list.innerHTML = "";
    teams.forEach(team => {
        list.innerHTML += `<option value="${team.name}">`;
    });
}

function renderSchedule() {
    const body = document.getElementById("scheduleTable");
    if (!body) return;
    body.innerHTML = "";

    matches.forEach(match => {
        const teamAData = teams.find(t => t.name.toLowerCase() === match.teamA.toLowerCase().trim());
        const teamBData = teams.find(t => t.name.toLowerCase() === match.teamB.toLowerCase().trim());
        const logoA = teamAData?.logo || "https://placehold.co/40x40?text=?";
        const logoB = teamBData?.logo || "https://placehold.co/40x40?text=?";

        body.innerHTML += `
        <tr>
            <td><div class="tableTeam" style="justify-content: center;"><img src="${logoA}" class="tableLogo"><span>${match.teamA}</span></div></td>
            <td><div class="tableTeam" style="justify-content: center;"><img src="${logoB}" class="tableLogo"><span>${match.teamB}</span></div></td>
            <td>${match.date}</td>
            <td>${match.time}</td>
            <td>${match.stage}</td>
            <td>${match.status}</td>
            <td>
                <button onclick="editSchedule('${match.id}')" title="Edit Schedule">✏️</button>
                <button onclick="goLive('${match.id}')" title="Go Live">⚡</button>
                <button onclick="deleteMatch('${match.id}')" title="Delete">🗑</button>
            </td>
        </tr>`;
    });

    document.getElementById("totalMatches").innerText = matches.length;
    document.getElementById("completedMatches").innerText = matches.filter(m => m.status === "Completed").length;
    document.getElementById("remainingMatches").innerText = matches.filter(m => m.status !== "Completed").length;
}

// এডিটর ট্র্যাকার ফোকাস লজিক
window.editSchedule = function(id) {
    const match = matches.find(m => m.id === id);
    if (!match) return;
    editingScheduleId = id;
    document.getElementById("s_teamA").value = match.teamA;
    document.getElementById("s_teamB").value = match.teamB;
    document.getElementById("s_date").value = match.date;
    document.getElementById("s_time").value = match.time;
    document.getElementById("s_venue").value = match.venue || "";
    document.getElementById("s_stage").value = match.stage || "Group Stage";

    document.getElementById("scheduleStatusCol").classList.remove("hidden");
    document.getElementById("s_status").value = match.status || "Upcoming";

    document.getElementById("addSchedule").innerText = "🔄 Update Scheduled Match";
    document.getElementById("s_teamA").focus();
    document.getElementById("s_teamA").scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// সরাসরি শিডিউল থেকে লাইভ ম্যাচ চালু করা
window.goLive = async function(id) {
    const match = matches.find(m => m.id === id);
    if (!match) return;
    if (confirm(`Do you want to start a live session for ${match.teamA} vs ${match.teamB}?`)) {
        const liveData = {
            goals: [], cards: [], penalties: [],
            timerRunning: false, timerBaseSeconds: 0, timerStartedAt: 0,
            teamA: match.teamA, teamB: match.teamB,
            homeGoal: 0, awayGoal: 0, status: "LIVE",
            matchTime: "00:00", duration: "90", extraTime: 0, commentary: "Match Started!",
            youtube: "", youtubeUrl: "", updatedAt: Date.now(), scheduleId: id
        };
        await set(ref(db, "liveMatch"), liveData);
        await update(ref(db, "matches/" + id), { status: "LIVE" });

        // পেজ লাইভে রিডাইরেক্ট করা
        const liveTabBtn = document.querySelector(`.sidebar li[data-page="live"]`);
        if (liveTabBtn) liveTabBtn.click();
    }
};

function renderTeams() {
    const body = document.getElementById("teamTable");
    if (!body) return;
    const keyword = document.getElementById("searchTeam").value.toLowerCase();
    body.innerHTML = "";

    // Cured: টিম নেম ফাঁকা বা আনডিফাইনড থাকলেও পেজ ক্র্যাশ করবে না
    teams
    .filter(team => (team.name || "").toLowerCase().includes(keyword))
    .forEach(team => {
        body.innerHTML += `
        <tr>
            <td><img src="${team.logo}" class="teamLogo" onerror="this.src='https://placehold.co/40x40?text=TEAM'"></td>
            <td>${team.name}</td>
            <td>
                <button onclick="editTeam('${team.id}')">✏ Edit</button>
                <button onclick="deleteTeam('${team.id}')">🗑 Delete</button>
            </td>
        </tr>`;
    });

    document.getElementById("registeredTeams").innerText = teams.length;
    document.getElementById("completedTeamMatches").innerText = matches.filter(m => m.status === "Completed").length;
    document.getElementById("upcomingMatches").innerText = matches.filter(m => m.status !== "Completed").length;
}

// ==========================
// ACTIONS (EDIT, DELETE)
// ==========================
window.editTeam = function(id) {
    const team = teams.find(t => t.id === id);
    if (!team) return;
    editingTeamId = id;
    document.getElementById("teamName").value = team.name;
    document.getElementById("previewTeamName").innerText = team.name;
    document.getElementById("logoPreview").src = team.logo || "https://placehold.co/150x150?text=LOGO";
    document.getElementById("saveTeam").innerText = "🔄 Update Team";
    
    // টিম এডিট বাটনে ক্লিক করলে ফর্মটিতে স্ক্রল করবে এবং ইনপুটে ফোকাস হবে
    document.getElementById("teamName").focus();
    document.getElementById("teamName").scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.deleteTeam = async function(id) {
    const ok = confirm("Delete this team?");
    if (!ok) return;

    // টিম ডিলিট করার আগে তার আসল নাম সংগ্রহ করে পয়েন্ট টেবিল নোড ডিলিট করার লজিক
    const team = teams.find(t => t.id === id);
    const teamName = team ? team.name : null;

    // ১. টিম ম্যানেজার নোড থেকে মুছে ফেলা
    await remove(ref(db, "teams/" + id));

    // ২. পয়েন্ট টেবিল নোড থেকেও টিমটিকে মুছে ফেলা (Cascade Delete)
    if (teamName) {
        await remove(ref(db, "points/" + teamName));
    }

    if (editingTeamId === id) {
        editingTeamId = null;
        document.getElementById("teamName").value = "";
        document.getElementById("teamLogo").value = "";
        document.getElementById("logoPreview").src = "https://placehold.co/150x150?text=LOGO";
        document.getElementById("previewTeamName").innerText = "Team Name";
        document.getElementById("saveTeam").innerText = "💾 Save Team";
    }
    alert("Team Deleted & Standings Synced ✅");
};

document.getElementById("deleteTeam").addEventListener("click", () => {
    if (!editingTeamId) {
        alert("Select a team first from edit.");
        return;
    }
    deleteTeam(editingTeamId);
});

window.deleteMatch = async function(id) {
    const ok = confirm("Delete this match?");
    if (!ok) return;
    await remove(ref(db, "matches/" + id));
};

document.getElementById("searchTeam").addEventListener("input", renderTeams);

async function uploadLogo(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData
    });
    const data = await res.json();
    return data.secure_url;
}

document.getElementById("saveTeam").addEventListener("click", async () => {
    const saveBtn = document.getElementById("saveTeam");
    const nameInput = document.getElementById("teamName");
    // নামের মাঝে বা শেষে ভুল অতিরিক্ত স্পেস ডাবল স্পেস চেকার দিয়ে রিমুভ করা
    const name = nameInput.value.replace(/\s+/g, ' ').trim();
    const file = document.getElementById("teamLogo").files[0];

    if (name === "") {
        alert("Enter Team Name");
        return;
    }

    // ডুপ্লিকেট টিম নেম কেস-ইনসেনসিティブ চেক
    const duplicate = teams.find(t => t.name && t.name.toLowerCase().trim() === name.toLowerCase() && t.id !== editingTeamId);
    if (duplicate) {
        alert("Team already exists with this name!");
        return;
    }

    // ডাবল ক্লিক বা রিকোয়েস্ট ওভারলোড আটকাতে বাটন ডিজেবল
    saveBtn.disabled = true;
    saveBtn.innerText = "⏳ Saving...";

    try {
        const oldTeam = editingTeamId ? teams.find(t => t.id === editingTeamId) : null;
        let logo = oldTeam?.logo || "";
        if (file) {
            logo = await uploadLogo(file);
        }

        const team = {
            name: name,
            shortName: name.substring(0, 3).toUpperCase(),
            logo: logo,
            createdAt: oldTeam?.createdAt || Date.now()
        };

        if (editingTeamId) {
            await update(ref(db, "teams/" + editingTeamId), team);
            editingTeamId = null;
        } else {
            await push(ref(db, "teams"), team);
        }

        document.getElementById("logoPreview").src = "https://placehold.co/150x150?text=LOGO";
        document.getElementById("previewTeamName").innerText = "Team Name";
        document.getElementById("teamName").value = "";
        document.getElementById("teamLogo").value = "";
        alert("Team Saved ✅");
    } catch (err) {
        alert("Error saving team: " + err.message);
    } finally {
        // বাটন আবার সচল করা হলো
        saveBtn.disabled = false;
        saveBtn.innerText = "💾 Save Team";
    }
});

document.getElementById("teamLogo").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById("logoPreview").src = URL.createObjectURL(file);
    document.getElementById("previewTeamName").innerText = document.getElementById("teamName").value || "New Team";
});

function updateTeamLogo(inputId, logoId) {
    const name = document.getElementById(inputId).value;
    const team = teams.find(t => t.name.toLowerCase() === name.toLowerCase());
    const logo = document.getElementById(logoId);
    if (team && team.logo) {
        logo.src = team.logo;
    } else {
        logo.src = "https://placehold.co/100x100?text=TEAM";
    }
    updateDropdownLabels();
}

// ==========================
// DYNAMIC CALENDAR ENGINE
// ==========================
function initDynamicCalendar() {
    const today = new Date();
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[today.getMonth()];
    const day = String(today.getDate()).padStart(2, '0');
    const targets = document.querySelectorAll(".dynamic-calendar-target");
    targets.forEach(target => {
        target.innerHTML = `
            <div class="calendar-icon-dynamic">
                <span class="cal-month">${month}</span>
                <span class="cal-day">${day}</span>
            </div>
        `;
    });
}
initDynamicCalendar();
window.addEventListener("DOMContentLoaded", initDynamicCalendar);

document.getElementById("teamA").addEventListener("change", () => {
    const teamA = document.getElementById("teamA").value.trim();
    const teamB = document.getElementById("teamB").value.trim();
    if (teamA && teamB && teamA.toLowerCase() === teamB.toLowerCase()) {
        alert("🚨 Home and Away team name cannot be same!");
        document.getElementById("teamA").value = "";
        updateTeamLogo("teamA", "teamALogo");
    } else {
        updateTeamLogo("teamA", "teamALogo");
    }
});

document.getElementById("teamB").addEventListener("change", () => {
    const teamA = document.getElementById("teamA").value.trim();
    const teamB = document.getElementById("teamB").value.trim();
    if (teamA && teamB && teamA.toLowerCase() === teamB.toLowerCase()) {
        alert("🚨 Home and Away team name cannot be same!");
        document.getElementById("teamB").value = "";
        updateTeamLogo("teamB", "teamBLogo");
    } else {
        updateTeamLogo("teamB", "teamBLogo");
    }
});

document.getElementById("teamName").addEventListener("input", () => {
    document.getElementById("previewTeamName").innerText = document.getElementById("teamName").value || "New Team";
});

// ==========================
// TIMELINE RENDERERS (WITH TEAM NAMES)
// ==========================
function renderGoals() {
    const box = document.getElementById("goalTimeline");
    if (!box) return;
    box.innerHTML = "";

    const { teamA, teamB } = getTeamNameLabels();

    goals.forEach((g, index) => {
        const teamLabel = g.team === "home" ? teamA : teamB;
        box.innerHTML += `
        <div class="timelineItem">
            <div>
                <b>${g.player}</b> (${g.minute}') ⚽ ${teamLabel}
            </div>
            <button class="timelineDelete" onclick="deleteGoal(${index})">Delete</button>
        </div>`;
    });
}

function renderCards() {
    const box = document.getElementById("cardTimeline");
    if (!box) return;
    box.innerHTML = "";
    
    let yellowCount = 0;
    let redCount = 0;

    const { teamA, teamB } = getTeamNameLabels();

    cards.forEach((c, index) => {
        if (c.type === "Yellow") yellowCount++;
        if (c.type === "Red") redCount++;

        const cardEmoji = c.type === "Yellow" ? "🟨" : "🟥";
        const teamLabel = c.team === "home" ? teamA : teamB;

        box.innerHTML += `
        <div class="timelineItem">
            <div>
                <b>${c.player}</b> (${c.minute}') ${cardEmoji} ${c.type} - ${teamLabel}
            </div>
            <button class="timelineDelete" onclick="deleteCard(${index})">Delete</button>
        </div>`;
    });

    document.getElementById("cardCounter").innerText = `${yellowCount} Yellow • ${redCount} Red`;
}

function renderPenalties() {
    const timeline = document.getElementById("penaltyTimeline");
    const homeIcons = document.getElementById("penHomeIcons");
    const awayIcons = document.getElementById("penAwayIcons");

    if (!timeline || !homeIcons || !awayIcons) return;

    timeline.innerHTML = "";
    homeIcons.innerHTML = "";
    awayIcons.innerHTML = "";

    const { teamA, teamB } = getTeamNameLabels();

    const penHomeHeader = document.getElementById("penHomeHeader");
    const penAwayHeader = document.getElementById("penAwayHeader");
    if (penHomeHeader) penHomeHeader.innerText = teamA;
    if (penAwayHeader) penAwayHeader.innerText = teamB;

    let homeGoals = 0;
    let awayGoals = 0;
    let homeShots = 0;
    let awayShots = 0;

    penalties.forEach((p, index) => {
        const icon = p.outcome === "goal" ? "⚽" : "❌";
        
        if (p.team === "home") {
            homeShots++;
            if (p.outcome === "goal") homeGoals++;
            homeIcons.innerHTML += `<span style="font-size: 24px; margin: 0 5px;">${icon}</span>`;
        } else {
            awayShots++;
            if (p.outcome === "goal") awayGoals++;
            awayIcons.innerHTML += `<span style="font-size: 24px; margin: 0 5px;">${icon}</span>`;
        }

        const teamLabel = p.team === "home" ? teamA : teamB;

        timeline.innerHTML += `
        <div class="timelineItem">
            <div>
                <b>${p.player || "Taker " + (index + 1)}</b> (${teamLabel}) - ${p.outcome === "goal" ? "⚽ Goal" : "❌ Miss"}
            </div>
            <button class="timelineDelete" onclick="deletePenalty(${index})">
                Delete
            </button>
        </div>`;
    });

    let notice = `Score: ${homeGoals} - ${awayGoals}`;
    if (homeShots >= 5 && awayShots >= 5 && homeShots === awayShots) {
        if (homeGoals !== awayGoals) {
            notice += ` | Winner: ${homeGoals > awayGoals ? teamA : teamB}`;
        }
    } else if ((homeShots === 5 && awayShots === 5) && homeGoals !== awayGoals) {
        notice += ` | Winner: ${homeGoals > awayGoals ? teamA : teamB}`;
    }

    document.getElementById("penaltyWinnerNotice").innerText = notice;
}

window.deleteGoal = function(index) {
    goals.splice(index, 1);
    renderGoals();
    syncTimelineToFirebase();
};

document.getElementById("addGoal").addEventListener("click", async () => {
    const player = document.getElementById("goalPlayer").value.trim();
    let minute = document.getElementById("goalMinute").value.trim();
    const team = document.getElementById("goalTeam").value;

    if (!player) {
        alert("Please enter player name.");
        return;
    }
    if (minute === "") {
        minute = String(Math.ceil(matchSeconds / 60) || 1);
    }

    goals.push({ player, minute: Number(minute), team });
    renderGoals();
    await syncTimelineToFirebase();

    document.getElementById("goalPlayer").value = "";
    document.getElementById("goalMinute").value = "";
});

document.getElementById("resetGoals").addEventListener("click", () => {
    if (confirm("⚠️ Are you sure you want to reset the entire Goal Timeline? This action cannot be undone.")) {
        goals = [];
        renderGoals();
        syncTimelineToFirebase();
    }
});

window.deleteCard = function(index) {
    cards.splice(index, 1);
    renderCards();
    syncTimelineToFirebase();
};

document.getElementById("addCard").addEventListener("click", async () => {
    const player = document.getElementById("cardPlayer").value.trim();
    let minute = document.getElementById("cardMinute").value.trim();
    const type = document.getElementById("cardType").value;
    const team = document.getElementById("cardTeam").value;

    if (!player) {
        alert("Please enter player name.");
        return;
    }
    if (minute === "") {
        minute = String(Math.ceil(matchSeconds / 60) || 1);
    }

    cards.push({ player, minute: Number(minute), type, team });
    renderCards();
    await syncTimelineToFirebase();

    document.getElementById("cardPlayer").value = "";
    document.getElementById("cardMinute").value = "";
});

document.getElementById("resetCards").addEventListener("click", () => {
    if (confirm("⚠️ Are you sure you want to reset the entire Card Timeline? This action cannot be undone.")) {
        cards = [];
        renderCards();
        syncTimelineToFirebase();
    }
});

window.deletePenalty = function(index) {
    penalties.splice(index, 1);
    renderPenalties();
    syncTimelineToFirebase();
};

document.getElementById("savePenaltyEvent").addEventListener("click", () => {
    const team = document.getElementById("penaltyTeam").value;
    const player = document.getElementById("penaltyPlayer").value.trim();
    const outcome = document.getElementById("penaltyOutcome").value;

    penalties.push({ team, player: player || "Player", outcome });
    renderPenalties();
    syncTimelineToFirebase();
    document.getElementById("penaltyPlayer").value = "";
});

document.getElementById("resetPenaltyBtn").addEventListener("click", () => {
    if (confirm("⚠️ Are you sure you want to reset the entire Penalty Shootout data? This action cannot be undone.")) {
        penalties = [];
        renderPenalties();
        syncTimelineToFirebase();
    }
});

// ==========================================
// TOURNAMENT RULES & CORE SETTINGS
// ==========================================
onValue(ref(db, "rules"), (snapshot) => {
    const val = snapshot.val();
    if (val) {
        document.getElementById("winPoint").value = val.winPoint ?? 3;
        document.getElementById("drawPoint").value = val.drawPoint ?? 1;
        document.getElementById("lossPoint").value = val.lossPoint ?? 0;
        document.getElementById("goalBonus").value = val.goalBonus ?? 0;
        document.getElementById("yellowPenalty").value = val.yellowPenalty ?? 0;
        document.getElementById("redPenalty").value = val.redPenalty ?? 0;
        document.getElementById("fairPlayBonus").value = val.fairPlayBonus ?? 0;
    }
});

onValue(ref(db, "settings"), (snapshot) => {
    const val = snapshot.val();
    if (val) {
        currentSettings = val || {}; // সেভ করার সময় ব্যবহারের জন্য локал রেফারেন্স রাখা হলো
        document.getElementById("tournamentName").value = val.TournamentName || "";
        document.getElementById("season").value = val.Season || "";
        document.getElementById("showGoals").checked = val.ShowGoals !== false;
        document.getElementById("showCards").checked = val.ShowCards !== false;
        document.getElementById("showStats").checked = val.ShowStats !== false;
        document.getElementById("showPenalty").checked = val.ShowPenalty !== false;
        document.getElementById("showCommentary").checked = val.ShowCommentary !== false;
        document.getElementById("showYoutube").checked = val.ShowYoutube !== false;

        if (val.viewerMode) {
            const radio = document.querySelector(`input[name="viewerMode"][value="${val.viewerMode}"]`);
            if (radio) radio.checked = true;
        }
        if (val.viewerLimit) {
            document.getElementById("viewerLimit").value = val.viewerLimit;
        }

        const modeText = val.viewerMode === "all" ? "Full Schedule" : `Last ${val.viewerLimit || 5} Matches`;
        const viewCountBadge = document.getElementById("viewerCount");
        if (viewCountBadge) {
            viewCountBadge.innerText = modeText;
        }

        // ব্যানার প্রিভিউ ও ডিলিট বাটন ভিজিবিলিটি কন্ট্রোল
        const bannerPreview = document.getElementById("bannerPreview");
        const deleteBannerBtn = document.getElementById("deleteBannerBtn");
        if (val.BannerUrl && bannerPreview && deleteBannerBtn) {
            bannerPreview.src = val.BannerUrl;
            bannerPreview.style.display = "block";
            deleteBannerBtn.classList.remove("hidden");
        } else if (bannerPreview && deleteBannerBtn) {
            bannerPreview.style.display = "none";
            deleteBannerBtn.classList.add("hidden");
        }

        // ব্যাকগ্রাউন্ড প্রিভিউ ও ডিলিট বাটন ভিজিবিলিটি কন্ট্রোল
        const bgPreview = document.getElementById("bgPreview");
        const deleteBgBtn = document.getElementById("deleteBgBtn");
        if (val.BgUrl && bgPreview && deleteBgBtn) {
            bgPreview.src = val.BgUrl;
            bgPreview.style.display = "block";
            deleteBgBtn.classList.remove("hidden");
        } else if (bgPreview && deleteBgBtn) {
            bgPreview.style.display = "none";
            deleteBgBtn.classList.add("hidden");
        }
    }
});

document.getElementById("saveRules").addEventListener("click", async () => {
    const rules = {
        winPoint: Number(document.getElementById("winPoint").value),
        drawPoint: Number(document.getElementById("drawPoint").value),
        lossPoint: Number(document.getElementById("lossPoint").value),
        goalBonus: Number(document.getElementById("goalBonus").value),
        yellowPenalty: Number(document.getElementById("yellowPenalty").value),
        redPenalty: Number(document.getElementById("redPenalty").value),
        fairPlayBonus: Number(document.getElementById("fairPlayBonus").value),
    };

    try {
        await set(ref(db, "rules"), rules);
        alert("Rules Saved ✅");
    } catch (err) {
        alert("Error saving rules: " + err.message);
    }
});

document.getElementById("saveTournament").addEventListener("click", async () => {
    const saveBtn = document.getElementById("saveTournament");
    const viewerModeVal = document.querySelector('input[name="viewerMode"]:checked')?.value || "all";
    const viewerLimitVal = parseInt(document.getElementById("viewerLimit").value, 10) || 5;
    const bannerFile = document.getElementById("bannerFile").files[0];
    const bgFile = document.getElementById("bgFile").files[0];

    saveBtn.disabled = true;
    saveBtn.innerText = "⏳ Saving Configurations...";

    try {
        let bannerUrl = currentSettings.BannerUrl || "";
        let bgUrl = currentSettings.BgUrl || "";

        // ক্লাউডিনারিতে ব্যানার এবং ব্যাকগ্রাউন্ড ফাইল আপলোড সম্পন্ন করার লজিক
        if (bannerFile) bannerUrl = await uploadLogo(bannerFile);
        if (bgFile) bgUrl = await uploadLogo(bgFile);

        const settings = {
            TournamentName: document.getElementById("tournamentName").value.trim(),
            Season: document.getElementById("season").value.trim(),
            ShowGoals: document.getElementById("showGoals").checked,
            ShowCards: document.getElementById("showCards").checked,
            ShowStats: document.getElementById("showStats").checked,
            ShowPenalty: document.getElementById("showPenalty").checked,
            ShowCommentary: document.getElementById("showCommentary").checked,
            ShowYoutube: document.getElementById("showYoutube").checked,
            ShowPointsTable: true, 
            ShowSchedule: true,     
            viewerMode: viewerModeVal,
            viewerLimit: viewerLimitVal,
            LiveStreamEnabled: document.getElementById("showYoutube").checked,
            BannerUrl: bannerUrl,
            BgUrl: bgUrl
        };

        await set(ref(db, "settings"), settings);
        alert("Configurations Saved ✅");
    } catch (err) {
        alert("Error saving settings: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "💾 Save Tournament Configurations";
        // ইনপুট ফাইল সিলেকশন রিসেট করা
        document.getElementById("bannerFile").value = "";
        document.getElementById("bgFile").value = "";
    }
});

// ব্যানার ও ব্যাকগ্রাউন্ড রিমুভ করার নতুন ইভেন্ট লিসেনারস
document.getElementById("deleteBannerBtn").addEventListener("click", async () => {
    if (confirm("🗑️ Are you sure you want to delete the Tournament Banner?")) {
        try {
            await update(ref(db, "settings"), { BannerUrl: "" });
            alert("Banner deleted successfully! 🗑️");
        } catch (err) {
            alert("Error deleting banner: " + err.message);
        }
    }
});

document.getElementById("deleteBgBtn").addEventListener("click", async () => {
    if (confirm("🗑️ Are you sure you want to delete the custom Application Background?")) {
        try {
            await update(ref(db, "settings"), { BgUrl: "" });
            alert("Background deleted successfully! 🗑️");
        } catch (err) {
            alert("Error deleting background: " + err.message);
        }
    }
});

document.getElementById("updateViewerSchedule").addEventListener("click", async () => {
    const viewerModeVal = document.querySelector('input[name="viewerMode"]:checked')?.value || "all";
    const viewerLimitVal = parseInt(document.getElementById("viewerLimit").value, 10) || 5;

    try {
        await update(ref(db, "settings"), {
            viewerMode: viewerModeVal,
            viewerLimit: viewerLimitVal
        });
        alert("Viewer Schedule Control Synced! 📅");
    } catch (err) {
        alert("Sync Error: " + err.message);
    }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
    const confirmLogout = confirm("Are you sure?");
    if (confirmLogout) {
        try {
            await signOut(auth);
            alert("Logged out 👋");
            window.location.href = "admin.html";
        } catch (err) {
            alert("Error: " + err.message);
        }
    }
});

// পয়েন্টস টেবিল সম্পূর্ণ রিসেট এবং ভিউয়ার রিয়েল-টাইম সিঙ্ক লজিক
const resetPointsBtn = document.getElementById("resetPointsBtn");
if (resetPointsBtn) {
    resetPointsBtn.addEventListener("click", async () => {
        if (confirm("🚨 WARNING: Are you sure you want to reset the Points Table? This will completely wipe out all standings data for all teams in both Admin and Viewer panels, and cannot be reversed!")) {
            resetPointsBtn.disabled = true;
            resetPointsBtn.innerText = "⏳ Resetting...";
            try {
                await set(ref(db, "points"), {});
                points = {};
                renderPoints();
                showToast("Standings and Points Table Reset Successfully! 🏆", "success");
            } catch (err) {
                showToast("Error resetting points table: " + err.message, "danger");
            } finally {
                resetPointsBtn.disabled = false;
                resetPointsBtn.innerText = "Reset Standings";
            }
        }
    });
}

// ===================================================================================
// MODULE: SQUAD & FORMATION ENGINE V3 (PRO ARCHITECTURE - POINTER DRAG EMULATION)
// ===================================================================================

let squadPlayers = [];
let squadFormations = [];
let activeSlots = [];
let activeFormationId = null;
let isLayoutLocked = false;
let selectedPlayerProfile = null;
let activeInspectSlotId = null;

// Layout History Management (Local Undo/Redo Stacks)
let undoStack = [];
let redoStack = [];

// Session Bypasses for Preferred Position Warnings
let sessionBypassPlayers = {};

// Touch Drag Context variables
let pointerDragSourceId = null;

// Initialize sub-tabs switcher
document.querySelectorAll("#formations .tabs-nav button[data-subtab]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#formations .tabs-nav button").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".squad-sub-content").forEach(c => c.classList.remove("active"));
        c_hideSubTabs();

        btn.classList.add("active");
        const target = document.getElementById(btn.dataset.subtab);
        if (target) target.classList.add("active");
    });
});

function c_hideSubTabs() {
    document.getElementById("squad-db").style.display = "none";
    document.getElementById("formation-builder").style.display = "none";
}

document.getElementById("btn-squad-tab").addEventListener("click", () => {
    document.getElementById("squad-db").style.display = "block";
});

document.getElementById("btn-builder-tab").addEventListener("click", () => {
    document.getElementById("formation-builder").style.display = "block";
    loadActiveFormationLayout();
});

// Setup sidebar triggers safely
const formationsSidebarItem = document.querySelector('.sidebar li[data-page="formations"]');
if (formationsSidebarItem) {
    formationsSidebarItem.addEventListener("click", () => {
        loadFormationTeamsDropdown();
    });
}

// 1. TEAMS SELECTOR POPULATOR
async function loadFormationTeamsDropdown() {
    const fTeamSelect = document.getElementById("f_teamSelect");
    if (!fTeamSelect) return;
    fTeamSelect.innerHTML = "";

    teams.forEach(t => {
        fTeamSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });

    fTeamSelect.addEventListener("change", () => {
        loadSquadRoster(fTeamSelect.value);
        loadFormationRoster(fTeamSelect.value);
    });

    if (teams.length > 0) {
        loadSquadRoster(teams[0].id);
        loadFormationRoster(teams[0].id);
    }
}

// 2. PLAYER SQUAD ENGINE
async function loadSquadRoster(teamId) {
    if (!teamId) return;
    onValue(ref(db, `players/${teamId}`), (snapshot) => {
        squadPlayers = [];
        const tableBody = document.getElementById("playerTableBody");
        if (!tableBody) return;
        tableBody.innerHTML = "";

        snapshot.forEach(child => {
            squadPlayers.push({ id: child.key, ...child.val() });
        });

        document.getElementById("squadCount").innerText = squadPlayers.length;

        squadPlayers.forEach(p => {
            const captainLabel = p.isCaptain ? " (C)" : p.isViceCaptain ? " (VC)" : "";
            let statusEmoji = "";
            if (p.status === "Injured") statusEmoji = " 🚑";
            if (p.status === "Suspended") statusEmoji = " 🟥";
            
            tableBody.innerHTML += `
                <tr>
                    <td><img src="${p.photo || 'https://placehold.co/40x40?text=P'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.1);"></td>
                    <td style="text-align:left; font-weight:700;">${p.name}${captainLabel}</td>
                    <td><b>${p.number || '-'}</b></td>
                    <td><span class="filter-chip active">${p.prefPos}</span></td>
                    <td><span class="live-badge" style="padding: 2px 6px; font-size:10px;">${p.status || "Active"}${statusEmoji}</span></td>
                    <td>
                        <button onclick="editSquadPlayer('${teamId}', '${p.id}')" style="padding:4px 8px; font-size:11px;">✏️</button>
                        <button onclick="deleteSquadPlayer('${teamId}', '${p.id}')" style="padding:4px 8px; font-size:11px; background:#ff4d67;">🗑️</button>
                    </td>
                </tr>
            `;
        });
        renderDraggableSquadList();
    });
}

// Add/Update Player Trigger
document.getElementById("savePlayerBtn").addEventListener("click", async () => {
    const teamId = document.getElementById("f_teamSelect").value;
    const playerId = document.getElementById("editingPlayerId").value;
    const name = document.getElementById("p_name").value.trim();
    const number = document.getElementById("p_number").value;
    const prefPos = document.getElementById("p_prefPos").value;
    const secPos = document.getElementById("p_secPos").value.trim();
    const photo = document.getElementById("p_photo").value.trim();
    const isCaptain = document.getElementById("p_isCaptain").checked;
    const isViceCaptain = document.getElementById("p_isViceCaptain").checked;
    const status = document.getElementById("p_status").value;

    if (!name || !teamId) {
        alert("Specify player name.");
        return;
    }

    // অফলাইন অপারেশন কিউ ইঞ্জিন (Step 15)
    let offlineQueue = JSON.parse(localStorage.getItem("matchcore_offline_queue") || "[]");
    
    async function executeDbWrite(action, path, payload) {
        if (!navigator.onLine) {
            offlineQueue.push({ action, path, payload, timestamp: Date.now() });
            localStorage.setItem("matchcore_offline_queue", JSON.stringify(offlineQueue));
            showToast("Edits queued! Saving locally (Offline) 📥", "success");
            return;
        }
        
        if (action === "update") {
            await update(ref(db, path), payload);
        } else if (action === "set") {
            await set(ref(db, path), payload);
        } else if (action === "push") {
            await push(ref(db, path), payload);
        } else if (action === "remove") {
            await remove(ref(db, path));
        }
    }

    // অটো সিঙ্ক সার্ভিস যখন ইন্টারনেট ফিরে আসবে
    window.addEventListener("online", async () => {
        if (offlineQueue.length > 0) {
            showToast("Network restored! Syncing database modifications... 🔄", "success");
            for (const item of offlineQueue) {
                try {
                    await executeDbWrite(item.action, item.path, item.payload);
                } catch(err) {
                    console.error("Auto Sync Error: ", err);
                }
            }
            offlineQueue = [];
            localStorage.setItem("matchcore_offline_queue", "[]");
            showToast("Autosync Completed Successfully! ✅", "success");
        }
    });

    // ৫ সেকেন্ড কাউন্টডাউন আনডু ইঞ্জিন (Step 13)
    let undoTimer = null;
    let undoActionPayload = null;

    function triggerUndoBanner(message, actionCallback) {
        if (undoTimer) clearTimeout(undoTimer);
        const banner = document.getElementById("undo-banner");
        const msg = document.getElementById("undoMessage");
        const btn = document.getElementById("undoActionBtn");
        
        if (!banner || !msg || !btn) return;
        msg.innerText = message;
        banner.classList.remove("hidden");
        
        btn.onclick = () => {
            actionCallback();
            banner.classList.add("hidden");
            clearTimeout(undoTimer);
            showToast("Action restored! ↩", "success");
        };

        undoTimer = setTimeout(() => {
            banner.classList.add("hidden");
        }, 5000);
    }

    const nationality = document.getElementById("p_nationality") ? document.getElementById("p_nationality").value.trim() : "Bangladesh";
    const age = document.getElementById("p_age") ? document.getElementById("p_age").value : "";
    const foot = document.getElementById("p_foot") ? document.getElementById("p_foot").value : "Right";
    const height = document.getElementById("p_height") ? document.getElementById("p_height").value : "";
    const weight = document.getElementById("p_weight") ? document.getElementById("p_weight").value : "";

    const playerData = {
        name,
        number,
        prefPos,
        secPos,
        nationality,
        age: age ? Number(age) : "",
        foot,
        height: height ? Number(height) : "",
        weight: weight ? Number(weight) : "",
        photo: photo || "https://placehold.co/150x150?text=PHOTO",
        isCaptain,
        isViceCaptain,
        status,
        updatedAt: Date.now()
    };

    if (playerId) {
        await executeDbWrite("update", `players/${teamId}/${playerId}`, playerData);
        document.getElementById("editingPlayerId").value = "";
        document.getElementById("playerFormTitle").innerText = "➕ Add New Player";
        document.getElementById("cancelPlayerEditBtn").style.display = "none";
    } else {
        await executeDbWrite("push", `players/${teamId}`, playerData);
    }

    // Reset Fields
    document.getElementById("p_name").value = "";
    document.getElementById("p_number").value = "";
    document.getElementById("p_secPos").value = "";
    document.getElementById("p_photo").value = "";
    document.getElementById("p_isCaptain").checked = false;
    document.getElementById("p_isViceCaptain").checked = false;
    document.getElementById("p_status").value = "Active";
    alert("Player saved to roster database! ⚽");
});

window.editSquadPlayer = function(teamId, playerId) {
    const player = squadPlayers.find(p => p.id === playerId);
    if (!player) return;

    document.getElementById("editingPlayerId").value = playerId;
    document.getElementById("p_name").value = player.name || "";
    document.getElementById("p_number").value = player.number || "";
    document.getElementById("p_prefPos").value = player.prefPos || "GK";
    document.getElementById("p_secPos").value = player.secPos || "";
    
    if (document.getElementById("p_nationality")) document.getElementById("p_nationality").value = player.nationality || "";
    if (document.getElementById("p_age")) document.getElementById("p_age").value = player.age || "";
    if (document.getElementById("p_foot")) document.getElementById("p_foot").value = player.foot || "Right";
    if (document.getElementById("p_height")) document.getElementById("p_height").value = player.height || "";
    if (document.getElementById("p_weight")) document.getElementById("p_weight").value = player.weight || "";

    document.getElementById("p_photo").value = player.photo || "";
    document.getElementById("p_isCaptain").checked = !!player.isCaptain;
    document.getElementById("p_isViceCaptain").checked = !!player.isViceCaptain;
    document.getElementById("p_status").value = player.status || "Active";

    document.getElementById("playerFormTitle").innerText = "✏️ Edit Player Squad Profile";
    document.getElementById("cancelPlayerEditBtn").style.display = "inline-block";
};

document.getElementById("cancelPlayerEditBtn").addEventListener("click", () => {
    document.getElementById("editingPlayerId").value = "";
    document.getElementById("p_name").value = "";
    document.getElementById("p_number").value = "";
    document.getElementById("p_secPos").value = "";
    document.getElementById("p_photo").value = "";
    document.getElementById("p_isCaptain").checked = false;
    document.getElementById("p_isViceCaptain").checked = false;
    document.getElementById("playerFormTitle").innerText = "➕ Add New Player";
    document.getElementById("cancelPlayerEditBtn").style.display = "none";
});

window.deleteSquadPlayer = async function(teamId, playerId) {
    const player = squadPlayers.find(p => p.id === playerId);
    if (!player) return;

    if (confirm(`Delete ${player.name} profile?`)) {
        const backupData = { ...player };
        
        // ১. ডাটাবেজ থেকে রিমুভ করুন
        await executeDbWrite("remove", `players/${teamId}/${playerId}`);
        
        // ২. ৫ সেকেন্ডের জন্য স্লাইডার আনডু ট্রিগার করুন
        triggerUndoBanner(`${player.name} Profile Deleted.`, async () => {
            await executeDbWrite("update", `players/${teamId}/${playerId}`, backupData);
        });
    }
};

// 3. FORMATION ENGINE LIBRARY
async function loadFormationRoster(teamId) {
    if (!teamId) return;
    const select = document.getElementById("activeFormationSelect");
    if (!select) return;

    onValue(ref(db, `formations/${teamId}`), async (snapshot) => {
        select.innerHTML = "";
        squadFormations = [];
        snapshot.forEach(child => {
            squadFormations.push({ id: child.key, ...child.val() });
        });

        if (squadFormations.length === 0) {
            // Seed base 4-3-3 config
            const defaultRef = await push(ref(db, `formations/${teamId}`), {
                name: "Base Line 4-3-3",
                isDefault: true,
                createdAt: Date.now()
            });
            const initSlots = [
                { type: "GK", label: "GK", x: 50, y: 88, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "CB", label: "LCB", x: 35, y: 70, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "CB", label: "RCB", x: 65, y: 70, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "LB", label: "LB", x: 15, y: 65, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "RB", label: "RB", x: 85, y: 65, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "CM", label: "LCM", x: 30, y: 45, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "CM", label: "RCM", x: 70, y: 45, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "CAM", label: "CAM", x: 50, y: 35, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "LW", label: "LW", x: 20, y: 15, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "RW", label: "RW", x: 80, y: 15, size: 60, angle: 0, assignedPlayerId: "" },
                { type: "ST", label: "ST", x: 50, y: 12, size: 60, angle: 0, assignedPlayerId: "" }
            ];
            initSlots.forEach(slot => {
                push(ref(db, `formationSlots/${defaultRef.key}`), slot);
            });
            return;
        }

        squadFormations.forEach(f => {
            const dText = f.isDefault ? " (Default)" : "";
            select.innerHTML += `<option value="${f.id}">${f.name}${dText}</option>`;
        });

        select.addEventListener("change", () => {
            activeFormationId = select.value;
            loadActiveFormationLayout();
        });

        const activeDef = squadFormations.find(f => f.isDefault) || squadFormations[0];
        activeFormationId = activeDef.id;
        select.value = activeFormationId;
        loadActiveFormationLayout();
    });
}

// 4. UNIFIED DYNAMIC POINTER DRAG ENGINE
async function loadActiveFormationLayout() {
    if (!activeFormationId) return;

    const fObj = squadFormations.find(f => f.id === activeFormationId);
    document.getElementById("defaultFormationBadge").style.display = fObj?.isDefault ? "inline-block" : "none";

    // Load layout slots
    onValue(ref(db, `formationSlots/${activeFormationId}`), (snapshot) => {
        activeSlots = [];
        snapshot.forEach(child => {
            activeSlots.push({ id: child.key, ...child.val() });
        });
        renderActiveSlots();
        renderDraggableSquadList();
        c_loadDatabaseVersions();
    });
}

function renderActiveSlots() {
    const container = document.getElementById("pitchSlotsContainer");
    if (!container) return;
    container.innerHTML = "";

    activeSlots.forEach(slot => {
        const assignedPlayer = squadPlayers.find(p => p.id === slot.assignedPlayerId);
        const size = slot.size || 60;
        const angle = slot.angle || 0;
        
        let playerHtml = "";
        if (assignedPlayer) {
            playerHtml = `
                <img src="${assignedPlayer.photo || 'https://placehold.co/40x40?text=P'}" class="slot-player-photo" style="transform: rotate(${-angle}deg);">
                <span class="slot-assigned-name">${assignedPlayer.name} (${assignedPlayer.number || ''})</span>
            `;
        } else {
            playerHtml = `<span style="font-size:18px; font-weight:800; color:#555;">+</span>`;
        }

        const closeBtnHtml = !isLayoutLocked ? `<button class="slot-close-btn" onclick="deletePitchSlot(event, '${slot.id}')">×</button>` : "";
        const dupBtnHtml = !isLayoutLocked ? `<button class="slot-duplicate-btn" onclick="duplicatePitchSlot(event, '${slot.id}')">＋</button>` : "";

        const slotEl = document.createElement("div");
        slotEl.id = `slot-${slot.id}`;
        
        let activeClass = (activeInspectSlotId === slot.id) ? "active-inspect" : "";
        slotEl.className = `formation-slot ${isLayoutLocked ? 'locked' : ''} ${activeClass}`;
        
        slotEl.style.width = `${size}px`;
        slotEl.style.height = `${size}px`;
        slotEl.style.left = `${slot.x}%`;
        slotEl.style.top = `${slot.y}%`;
        slotEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
        
        slotEl.innerHTML = `
            ${closeBtnHtml}
            ${dupBtnHtml}
            ${playerHtml}
            <span class="slot-type">${slot.label || slot.type}</span>
        `;

        // Touch Drag & Drop Emulation
        if (isLayoutLocked) {
            slotEl.addEventListener("pointerover", () => {
                if (pointerDragSourceId) {
                    slotEl.classList.add("drag-over");
                }
            });
            slotEl.addEventListener("pointerleave", () => {
                slotEl.classList.remove("drag-over");
            });
            slotEl.addEventListener("pointerup", () => {
                slotEl.classList.remove("drag-over");
                if (pointerDragSourceId) {
                    assignPlayerToSlot(pointerDragSourceId, slot.id);
                    pointerDragSourceId = null;
                }
            });
        } else {
            makeSlotMovable(slotEl, slot.id);
        }

        inspectEmptySlot(slot.id);
            }
        });

        container.appendChild(slotEl);
    });
}

function inspectEmptySlot(slotId) {
    const activeState = document.getElementById("profileActiveState");
    const emptyState = document.getElementById("profileEmptyState");
    if (emptyState) emptyState.style.display = "none";
    if (activeState) activeState.style.display = "block";

    const slot = activeSlots.find(s => s.id === slotId);
    document.getElementById("prof_photo").src = "https://placehold.co/150x150?text=EMPTY";
    document.getElementById("prof_number").innerText = "-";
    document.getElementById("prof_name").innerText = `Empty Slot (${slot ? (slot.label || slot.type) : ""})`;
    document.getElementById("prof_roles").innerHTML = "";
    document.getElementById("prof_pref").innerText = slot ? slot.type : "-";
    document.getElementById("prof_sec").innerText = "-";
    document.getElementById("prof_status").innerText = "-";
    document.getElementById("prof_slot").innerText = slotId;

    const unassignBtn = document.getElementById("unassignPlayerBtn");
    if (unassignBtn) unassignBtn.style.display = "none";

    const rotateSlider = document.getElementById("slotRotateSlider");
    const sizeSlider = document.getElementById("slotSizeSlider");
    if (rotateSlider) rotateSlider.value = slot ? (slot.angle || 0) : 0;
    if (sizeSlider) sizeSlider.value = slot ? (slot.size || 60) : 60;
}

function inspectPlayerProfile(player, slotId) {
    const activeState = document.getElementById("profileActiveState");
    const emptyState = document.getElementById("profileEmptyState");
    if (emptyState) emptyState.style.display = "none";
    if (activeState) activeState.style.display = "block";

    document.getElementById("prof_photo").src = player.photo || "https://placehold.co/150x150?text=PHOTO";
    document.getElementById("prof_number").innerText = player.number || "-";
    document.getElementById("prof_name").innerText = player.name;
    document.getElementById("prof_pref").innerText = player.prefPos || "-";
    document.getElementById("prof_sec").innerText = player.secPos || "-";
    document.getElementById("prof_status").innerText = player.status || "Active";
    document.getElementById("prof_slot").innerText = slotId ? `Slot ${slotId}` : "Bench / Roster";

    const unassignBtn = document.getElementById("unassignPlayerBtn");
    if (unassignBtn) {
        unassignBtn.style.display = slotId ? "block" : "none";
    }

    const slot = activeSlots.find(s => s.id === slotId);
    const rotateSlider = document.getElementById("slotRotateSlider");
    const sizeSlider = document.getElementById("slotSizeSlider");
    if (rotateSlider) rotateSlider.value = slot ? (slot.angle || 0) : 0;
    if (sizeSlider) sizeSlider.value = slot ? (slot.size || 60) : 60;
}

const unassignBtn = document.getElementById("unassignPlayerBtn");
if (unassignBtn) {
    unassignBtn.addEventListener("click", async () => {
        if (!activeInspectSlotId) return;
        const slot = activeSlots.find(s => s.id === activeInspectSlotId);
        if (slot && slot.assignedPlayerId) {
            await update(ref(db, `formationSlots/${activeFormationId}/${activeInspectSlotId}`), {
                assignedPlayerId: ""
            });
            activeInspectSlotId = null;
            const emptyState = document.getElementById("profileEmptyState");
            const activeState = document.getElementById("profileActiveState");
            if (emptyState) emptyState.style.display = "block";
            if (activeState) activeState.style.display = "none";
            showToast("Player unassigned from slot 🏃", "success");
        }
    });
}

const slotRotateSlider = document.getElementById("slotRotateSlider");
if (slotRotateSlider) {
    slotRotateSlider.addEventListener("input", (e) => {
        if (!activeInspectSlotId) return;
        const angle = parseInt(e.target.value, 10) || 0;
        const slotEl = document.getElementById(`slot-${activeInspectSlotId}`);
        if (slotEl) {
            slotEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
            const img = slotEl.querySelector(".slot-player-photo");
            if (img) img.style.transform = `rotate(${-angle}deg)`;
        }
    });
    slotRotateSlider.addEventListener("change", async (e) => {
        if (!activeInspectSlotId) return;
        const angle = parseInt(e.target.value, 10) || 0;
        await update(ref(db, `formationSlots/${activeFormationId}/${activeInspectSlotId}`), {
            angle: angle
        });
    });
}

const slotSizeSlider = document.getElementById("slotSizeSlider");
if (slotSizeSlider) {
    slotSizeSlider.addEventListener("input", (e) => {
        if (!activeInspectSlotId) return;
        const size = parseInt(e.target.value, 10) || 60;
        const slotEl = document.getElementById(`slot-${activeInspectSlotId}`);
        if (slotEl) {
            slotEl.style.width = `${size}px`;
            slotEl.style.height = `${size}px`;
        }
    });
    slotSizeSlider.addEventListener("change", async (e) => {
        if (!activeInspectSlotId) return;
        const size = parseInt(e.target.value, 10) || 60;
        await update(ref(db, `formationSlots/${activeFormationId}/${activeInspectSlotId}`), {
            size: size
        });
    });
}

const layoutLockBtn = document.getElementById("layoutLockBtn");
if (layoutLockBtn) {
    layoutLockBtn.addEventListener("click", () => {
        isLayoutLocked = !isLayoutLocked;
        if (isLayoutLocked) {
            layoutLockBtn.innerText = "🔒 Locked (Player Drag Active)";
            layoutLockBtn.className = "btn-danger";
        } else {
            layoutLockBtn.innerText = "🔓 Unlocked (Edit Slots)";
            layoutLockBtn.className = "btn-success";
        }
        renderActiveSlots();
    });
}

const addSlotBtn = document.getElementById("addSlotBtn");
if (addSlotBtn) {
    addSlotBtn.addEventListener("click", async () => {
        if (!activeFormationId) return;
        const newSlot = {
            type: "CM",
            label: "SUB",
            x: 50,
            y: 50,
            size: 60,
            angle: 0,
            assignedPlayerId: ""
        };
        await push(ref(db, `formationSlots/${activeFormationId}`), newSlot);
        showToast("New slot added to the pitch ➕", "success");
    });
}

window.deletePitchSlot = async function(event, slotId) {
    if (event) event.stopPropagation();
    if (!activeFormationId || !slotId) return;
    if (confirm("Are you sure you want to delete this slot?")) {
        await remove(ref(db, `formationSlots/${activeFormationId}/${slotId}`));
        if (activeInspectSlotId === slotId) {
            activeInspectSlotId = null;
            const emptyState = document.getElementById("profileEmptyState");
            const activeState = document.getElementById("profileActiveState");
            if (emptyState) emptyState.style.display = "block";
            if (activeState) activeState.style.display = "none";
        }
        showToast("Slot removed 🗑️", "success");
    }
};

window.duplicatePitchSlot = async function(event, slotId) {
    if (event) event.stopPropagation();
    if (!activeFormationId || !slotId) return;
    const slot = activeSlots.find(s => s.id === slotId);
    if (slot) {
        const newSlot = {
            type: slot.type || "CM",
            label: (slot.label || "SUB") + " Copy",
            x: Math.min(slot.x + 5, 95),
            y: Math.min(slot.y + 5, 95),
            size: slot.size || 60,
            angle: slot.angle || 0,
            assignedPlayerId: ""
        };
        await push(ref(db, `formationSlots/${activeFormationId}`), newSlot);
        showToast("Slot duplicated successfully! ➕", "success");
    }
};

function makeSlotMovable(slotEl, slotId) {
    let isDragging = false;
    let startX, startY;
    let startLeft, startTop;

    // স্লাইড বা ড্র্যাগ করার সময় টাচস্ক্রিনে ডিফল্ট স্ক্রল নিষ্ক্রিয় করুন
    slotEl.style.touchAction = "none";

    slotEl.addEventListener("pointerdown", (e) => {
        if (isLayoutLocked) return;
        isDragging = true;
        slotEl.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = slotEl.getBoundingClientRect();
        const parentRect = slotEl.parentNode.getBoundingClientRect();
        
        startLeft = ((rect.left + rect.width / 2 - parentRect.left) / parentRect.width) * 100;
        startTop = ((rect.top + rect.height / 2 - parentRect.top) / parentRect.height) * 100;
        
        e.stopPropagation();
    });

    slotEl.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const parentRect = slotEl.parentNode.getBoundingClientRect();
        const dx = ((e.clientX - startX) / parentRect.width) * 100;
        const dy = ((e.clientY - startY) / parentRect.height) * 100;
        
        let newLeft = Math.max(0, Math.min(100, startLeft + dx));
        let newTop = Math.max(0, Math.min(100, startTop + dy));
        
        slotEl.style.left = `${newLeft}%`;
        slotEl.style.top = `${newTop}%`;
    });

    slotEl.addEventListener("pointerup", async (e) => {
        if (!isDragging) return;
        isDragging = false;
        slotEl.releasePointerCapture(e.pointerId);

        const parentRect = slotEl.parentNode.getBoundingClientRect();
        
        // ড্রপ করা লোকেশন অন্য কোনো স্লটের ওপরে কি না তা পরীক্ষা করুন (সোয়াপ লজিক)
        const dropX = e.clientX;
        const dropY = e.clientY;
        
        let targetSlotId = null;
        activeSlots.forEach(s => {
            if (s.id !== slotId) {
                const otherEl = document.getElementById(`slot-${s.id}`);
                if (otherEl) {
                    const r = otherEl.getBoundingClientRect();
                    if (dropX >= r.left && dropX <= r.right && dropY >= r.top && dropY <= r.bottom) {
                        targetSlotId = s.id;
                    }
                }
            }
        });

        if (targetSlotId) {
            // দুটি স্লটের খেলোয়াড় সোয়াপ করুন (Step 6)
            const slotA = activeSlots.find(s => s.id === slotId);
            const slotB = activeSlots.find(s => s.id === targetSlotId);
            if (slotA && slotB) {
                const playerA = slotA.assignedPlayerId || "";
                const playerB = slotB.assignedPlayerId || "";
                
                await executeDbWrite("update", `formationSlots/${activeFormationId}/${slotId}`, { assignedPlayerId: playerB });
                await executeDbWrite("update", `formationSlots/${activeFormationId}/${targetSlotId}`, { assignedPlayerId: playerA });
                showToast("Players Swapped Successfully! 🔄", "success");
                return;
            }
        }

        // স্বাভাবিক মুভমেন্ট সংরক্ষণ করুন
        const dx = ((e.clientX - startX) / parentRect.width) * 100;
        const dy = ((e.clientY - startY) / parentRect.height) * 100;
        let newLeft = Math.max(0, Math.min(100, startLeft + dx));
        let newTop = Math.max(0, Math.min(100, startTop + dy));

        await executeDbWrite("update", `formationSlots/${activeFormationId}/${slotId}`, {
            x: Math.round(newLeft),
            y: Math.round(newTop)
        });
    });
}

    slotEl.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const parentRect = slotEl.parentNode.getBoundingClientRect();
        const dx = ((e.clientX - startX) / parentRect.width) * 100;
        const dy = ((e.clientY - startY) / parentRect.height) * 100;
        
        let newLeft = Math.max(0, Math.min(100, startLeft + dx));
        let newTop = Math.max(0, Math.min(100, startTop + dy));
        
        slotEl.style.left = `${newLeft}%`;
        slotEl.style.top = `${newTop}%`;
    });

    slotEl.addEventListener("pointerup", async (e) => {
        if (!isDragging) return;
        isDragging = false;
        slotEl.releasePointerCapture(e.pointerId);

        const parentRect = slotEl.parentNode.getBoundingClientRect();
        const dx = ((e.clientX - startX) / parentRect.width) * 100;
        const dy = ((e.clientY - startY) / parentRect.height) * 100;
        
        let newLeft = Math.max(0, Math.min(100, startLeft + dx));
        let newTop = Math.max(0, Math.min(100, startTop + dy));

        await update(ref(db, `formationSlots/${activeFormationId}/${slotId}`), {
            x: Math.round(newLeft),
            y: Math.round(newTop)
        });
    });
}

async function assignPlayerToSlot(playerId, slotId) {
    const player = squadPlayers.find(p => p.id === playerId);
    const slot = activeSlots.find(s => s.id === slotId);
    if (!player || !slot) return;

    if (player.prefPos !== slot.type && !sessionBypassPlayers[playerId]) {
        const modal = document.getElementById("positionWarningModal");
        const warnText = document.getElementById("posWarningText");
        if (modal && warnText) {
            warnText.innerText = `${player.name} is a preferred ${player.prefPos}, but you are assigning them to a ${slot.type} position slot.`;
            modal.classList.remove("hidden");
            
            const assignAnywayBtn = document.getElementById("posAssignAnywayBtn");
            const cancelBtn = document.getElementById("posCancelBtn");
            
            const cleanUp = () => {
                modal.classList.add("hidden");
                assignAnywayBtn.onpointerdown = null;
                cancelBtn.onpointerdown = null;
            };

            assignAnywayBtn.onpointerdown = async () => {
                if (document.getElementById("rememberPosChoice").checked) {
                    sessionBypassPlayers[playerId] = true;
                }
                cleanUp();
                await executeAssignment(playerId, slotId);
            };

            cancelBtn.onpointerdown = () => {
                cleanUp();
            };
            return;
        }
    }

    await executeAssignment(playerId, slotId);
}

async function executeAssignment(playerId, slotId) {
    const prevSlot = activeSlots.find(s => s.assignedPlayerId === playerId);
    if (prevSlot && prevSlot.id !== slotId) {
        await update(ref(db, `formationSlots/${activeFormationId}/${prevSlot.id}`), {
            assignedPlayerId: ""
        });
    }

    await update(ref(db, `formationSlots/${activeFormationId}/${slotId}`), {
        assignedPlayerId: playerId
    });
    showToast("Player successfully assigned to slot! ⚽", "success");
}

function renderDraggableSquadList() {
    const listContainer = document.getElementById("draggablePlayerList");
    const benchContainer = document.getElementById("benchContainer");
    if (!listContainer || !benchContainer) return;

    listContainer.innerHTML = "";
    benchContainer.innerHTML = "";

    const searchKeyword = document.getElementById("f_searchPlayer") ? document.getElementById("f_searchPlayer").value.toLowerCase() : "";
    const activeFilter = document.querySelector(".filter-chip.active") ? document.querySelector(".filter-chip.active").dataset.filter : "all";

    let filteredPlayers = squadPlayers.filter(p => {
        const matchName = p.name.toLowerCase().includes(searchKeyword);
        const matchNo = (p.number || "").toString().includes(searchKeyword);
        const matchPos = p.prefPos.toLowerCase().includes(searchKeyword);
        
        let matchFilter = true;
        if (activeFilter === "GK") matchFilter = p.prefPos === "GK";
        else if (activeFilter === "DEF") matchFilter = ["CB", "LB", "RB", "LWB", "RWB"].includes(p.prefPos);
        else if (activeFilter === "MID") matchFilter = ["CDM", "CM", "CAM", "LM", "RM"].includes(p.prefPos);
        else if (activeFilter === "ATT") matchFilter = ["LW", "RW", "CF", "ST"].includes(p.prefPos);

        return (matchName || matchNo || matchPos) && matchFilter;
    });

    filteredPlayers.forEach(p => {
        const isAssigned = activeSlots.some(s => s.assignedPlayerId === p.id);
        
        const pEl = document.createElement("div");
        pEl.className = `player-drag-card ${isAssigned ? 'disabled' : ''}`;
        pEl.innerHTML = `
            <img src="${p.photo || 'https://placehold.co/40x40?text=P'}">
            <div style="flex:1;">
                <div style="font-weight:700; font-size:13px;">${p.name}</div>
                <div style="font-size:11px; color:#aaa;">${p.prefPos} #${p.number || '-'}</div>
            </div>
        `;

        if (!isAssigned) {
            pEl.addEventListener("pointerdown", () => {
                pointerDragSourceId = p.id;
                document.querySelectorAll(".player-drag-card").forEach(c => c.style.borderColor = "rgba(255,255,255,0.06)");
                pEl.style.borderColor = "#00f0ff";
                inspectPlayerProfile(p, null);
            });
        }

        listContainer.appendChild(pEl);

        if (p.status === "Bench" && !isAssigned) {
            const benchEl = document.createElement("div");
            benchEl.className = "player-drag-card";
            benchEl.style.padding = "6px";
            benchEl.innerHTML = `
                <span style="font-size:11px; font-weight:800;">${p.name.split(' ').pop()} (${p.prefPos})</span>
            `;
            benchEl.addEventListener("pointerdown", () => {
                pointerDragSourceId = p.id;
                inspectPlayerProfile(p, null);
            });
            benchContainer.appendChild(benchEl);
        }
    });
}

document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        renderDraggableSquadList();
    });
});

const fSearchInput = document.getElementById("f_searchPlayer");
if (fSearchInput) {
    fSearchInput.addEventListener("input", () => {
        renderDraggableSquadList();
    });
}

function c_loadDatabaseVersions() {
    const container = document.getElementById("historyLogContainer");
    if (!container) return;
    container.innerHTML = `<span style="font-size:12px; color:#999; font-style:italic;">Live Active Version: ${activeFormationId || 'None'}</span>`;
}

const createFormationBtn = document.getElementById("createFormationBtn");
if (createFormationBtn) {
    createFormationBtn.addEventListener("click", async () => {
        const teamId = document.getElementById("f_teamSelect").value;
        if (!teamId) return;
        const name = prompt("Enter name for new formation:", "New custom layout");
        if (!name) return;

        const fRef = await push(ref(db, `formations/${teamId}`), {
            name: name,
            isDefault: false,
            createdAt: Date.now()
        });

        const initSlots = [
            { type: "GK", label: "GK", x: 50, y: 88, size: 60, angle: 0, assignedPlayerId: "" },
            { type: "CB", label: "LCB", x: 35, y: 70, size: 60, angle: 0, assignedPlayerId: "" },
            { type: "CB", label: "RCB", x: 65, y: 70, size: 60, angle: 0, assignedPlayerId: "" },
            { type: "CM", label: "CM", x: 50, y: 50, size: 60, angle: 0, assignedPlayerId: "" },
            { type: "ST", label: "ST", x: 50, y: 15, size: 60, angle: 0, assignedPlayerId: "" }
        ];
        initSlots.forEach(slot => {
            push(ref(db, `formationSlots/${fRef.key}`), slot);
        });
        showToast("New formation created! 🏟", "success");
    });
}

const renameFormationBtn = document.getElementById("renameFormationBtn");
if (renameFormationBtn) {
    renameFormationBtn.addEventListener("click", async () => {
        if (!activeFormationId) return;
        const teamId = document.getElementById("f_teamSelect").value;
        const name = prompt("Enter new name for formation:");
        if (!name) return;

        await update(ref(db, `formations/${teamId}/${activeFormationId}`), {
            name: name
        });
        showToast("Formation renamed! 🏷", "success");
    });
}

const deleteFormationBtn = document.getElementById("deleteFormationBtn");
if (deleteFormationBtn) {
    deleteFormationBtn.addEventListener("click", async () => {
        if (!activeFormationId) return;
        const teamId = document.getElementById("f_teamSelect").value;
        const fObj = squadFormations.find(f => f.id === activeFormationId);
        if (fObj?.isDefault) {
            alert("Cannot delete the default layout!");
            return;
        }
        if (confirm("Delete this entire formation layout? This cannot be undone.")) {
            await remove(ref(db, `formations/${teamId}/${activeFormationId}`));
            await remove(ref(db, `formationSlots/${activeFormationId}`));
            activeFormationId = null;
            showToast("Formation deleted! 🗑", "success");
        }
    });
}

const setDefaultFormationBtn = document.getElementById("setDefaultFormationBtn");
if (setDefaultFormationBtn) {
    setDefaultFormationBtn.addEventListener("click", async () => {
        if (!activeFormationId) return;
        const teamId = document.getElementById("f_teamSelect").value;

        const updates = {};
        squadFormations.forEach(f => {
            updates[`formations/${teamId}/${f.id}/isDefault`] = (f.id === activeFormationId);
        });
        await update(ref(db), updates);
        showToast("Selected layout set as default! ★", "success");
    });
}

// ==========================================
// PWA ENGINE (Step 17)
// ==========================================
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const pwaBanner = document.getElementById("pwa-banner");
    if (pwaBanner) pwaBanner.classList.remove("hidden");
});

const pwaInstallBtn = document.getElementById("pwaInstallBtn");
if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener("click", async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
                showToast("Thank you for installing MatchCore App! 📲", "success");
            }
            deferredPrompt = null;
            const pwaBanner = document.getElementById("pwa-banner");
            if (pwaBanner) pwaBanner.classList.add("hidden");
        }
    });
}

const pwaDismissBtn = document.getElementById("pwaDismissBtn");
if (pwaDismissBtn) {
    pwaDismissBtn.addEventListener("click", () => {
        const pwaBanner = document.getElementById("pwa-banner");
        if (pwaBanner) pwaBanner.classList.add("hidden");
    });
}

// Service Worker রেজিস্টার করুন
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then((reg) => {
            console.log("MatchCore Service Worker registered successfully: ", reg.scope);
        }).catch((err) => {
            console.error("MatchCore Service Worker registration failed: ", err);
        });
    });
}