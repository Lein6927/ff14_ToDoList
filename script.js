const STORAGE_KEY = "quest-tracker-state-v1";
let state = null;
let saveTimer = null;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function pad(n) {
  return String(n).padStart(2, "0");
}
//行事曆顏色
const EVENT_COLORS = [
  "#e2555a",
  "#d4af37",
  "#4fd1ae",
  "#6d8cff",
  "#c46be0",
  "#f2994a",
];

function getAllEvents() {
  const off = typeof OFFICIAL_EVENTS !== "undefined" ? OFFICIAL_EVENTS : [];
  return [...off, ...state.events];
}
//部族好感度等級與所需點數
const TRIBE_LEVELS = [
  "1.中立",
  "2.承認",
  "3.友好",
  "4.信賴",
  "5.尊敬",
  "6.名譽",
  "7.誓約",
  "8.盟友",
];
const TRIBE_LEVEL_POINTS = [null, 150, 360, 510, 720, 990, 1320, null];
//部族每日任務額度表（版本 => 等級 => 每日額度）這裡只列出2版
const TRIBE_QUOTA_TABLE = {
  2: [3, 6, 9, 12, 12, 12, 12, 12],
  3: [3, 3, 3, 3, 3, 6, 6, 6],
  4: [3, 3, 3, 3, 3, 6, 6, 6],
  5: [3, 3, 3, 3, 3, 6, 6, 6],
  6: [3, 3, 3, 3, 3, 6, 6, 6],
  7: [3, 3, 3, 3, 3, 6, 6, 6],
};
function quotaForLevel(version, levelIndex) {
  const table = TRIBE_QUOTA_TABLE[version];
  if (!table) return null;
  return table[levelIndex] ?? table[table.length - 1];
}

//部族列表與初始好感度
const TRIBE_DATA = {
  2: ["蜥蜴人族", "風精靈族", "地靈族", "魚人族", "鳥人族"],
  3: ["瓦努族", "骨頷族", "莫古利族"],
  4: ["甲人族", "阿難陀族", "鯰魚精族"],
  5: ["仙子族", "奇塔利族", "矮人族"],
  6: ["悌陽象族", "奥密克戎族", "兔兔族"],
  7: ["佩魯佩魯族", "輝鱗族", "尤卡巨人族"],
};

const WEEKLY_TASK_NAMES = [
  "時尚品鑑",
  "天書奇談",
  "多瑪飛地",
  "軍團任務",
  "高難幻本",
  "老主顧",
];
//更改每日任務
const DAILY_TASK_NAMES = [
  "拾級",
  "練級",
  "討伐",
  "主線",
  "大型",
  "團隊",
  "PVP",
];

function defaultState() {
  const tribes = [];
  Object.keys(TRIBE_DATA).forEach((v) => {
    TRIBE_DATA[v].forEach((name, i) => {
      tribes.push({
        id: uid(),
        version: Number(v),
        index: i + 1,
        name,
        affinity: 0,
        note: "",
        dailyAllowance: 3,
        doneCountToday: 0,
      });
    });
  });
  return {
    dailyTribeCap: 12, //每日部族任務總上限
    currentVersion: Math.min(...Object.keys(TRIBE_DATA).map(Number)),
    /*設定更新時間*/
    settings: {
      dailyResetHour: 23,
      weeklyResetWeekday: 2,
      weeklyResetHour: 16,
    },
    lastDailyKey: "",
    lastWeeklyKey: "",
    // dailyTasks: [
    //   { id: uid(), name: "拾級", done: false },
    //   { id: uid(), name: "練級", done: false },
    //   { id: uid(), name: "討伐", done: false },
    //   { id: uid(), name: "主線", done: false },
    //   { id: uid(), name: "大型", done: false },
    //   { id: uid(), name: "團隊", done: false },
    //   { id: uid(), name: "PVP", done: false },
    // ],
    dailyTasks: DAILY_TASK_NAMES.map((name) => ({
      id: uid(),
      name,
      done: false,
    })),
    tribes,
    //改成用 WEEKLY_TASK_NAMES 生成，方便未來擴充
    weeklyTasks: WEEKLY_TASK_NAMES.map((name) => ({
      id: uid(),
      name,
      done: false,
    })),
    memos: [],
    links: [],
    events: [],
  };
}

async function loadState() {
  //從localStorage讀取
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    } else {
      state = defaultState();
    }
  } catch (e) {
    state = defaultState();
  }

  if (!state.settings)
    state.settings = {
      dailyResetHour: 6,
      weeklyResetWeekday: 3,
      weeklyResetHour: 6,
    };
  if (!state.events) state.events = [];
  if (!state.memos) state.memos = [];
  if (!state.links) state.links = [];
  if (typeof state.dailyTribeCap !== "number") {
    state.dailyTribeCap = 12;
  }
  if (typeof state.currentVersion !== "number") {
    state.currentVersion = Math.min(...Object.keys(TRIBE_DATA).map(Number));
  }
  syncTribeNames();
  syncWeeklyTaskNames();
  migrateDailyTasks();
  migrateTribeQuota();
  migrateMemos();
}
//同步部族名稱
function syncTribeNames() {
  state.tribes.forEach((t) => {
    const names = TRIBE_DATA[t.version];
    if (names && names[t.index - 1]) {
      t.name = names[t.index - 1];
    }
  });
}
//同步每週任務名稱
function syncWeeklyTaskNames() {
  state.weeklyTasks.forEach((t, i) => {
    if (WEEKLY_TASK_NAMES[i]) t.name = WEEKLY_TASK_NAMES[i];
  });
}

//每日任務名稱遷移
function migrateDailyTasks() {
  // 用「名字」比對現有任務，保留使用者原本的勾選狀態
  const existingByName = {};
  state.dailyTasks.forEach((t) => {
    existingByName[t.name] = t;
  });
  state.dailyTasks = DAILY_TASK_NAMES.map((name) => {
    if (existingByName[name]) return existingByName[name]; // 舊的有這個名字，原封不動留著（含勾選狀態）
    return { id: uid(), name, done: false }; // 新加的項目，從未完成開始
  });
}

//部族每日任務額度遷移
function migrateTribeQuota() {
  state.tribes.forEach((t) => {
    if (typeof t.affinityLevel !== "number") t.affinityLevel = 0;
    const q = quotaForLevel(t.version, t.affinityLevel);
    if (q !== null) {
      t.dailyAllowance = q;
    } else if (typeof t.dailyAllowance !== "number") {
      t.dailyAllowance = 3;
    }
    if (typeof t.doneCountToday !== "number") {
      t.doneCountToday = t.doneToday ? 1 : 0;
    }
  });
}
//舊版備忘錄（text/tag）遷移成新格式（title/content）
function migrateMemos() {
  state.memos.forEach((m) => {
    if (typeof m.title !== "string") {
      m.title = m.text || "（未命名）";
    }
    if (typeof m.content !== "string") {
      m.content = m.tag ? `標籤：${m.tag}` : "";
    }
    if (typeof m.createdAt !== "number") {
      m.createdAt = Date.now();
    }
    if (typeof m.date !== "string") {
      m.date = fmtDate(m.createdAt);
    }
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

//儲存狀態到localStorage，避免頻繁寫入
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("save failed", e);
    }
  }, 350);
}

function getDailyKey(now, resetHour) {
  const d = new Date(now);
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getNextDailyReset(now, resetHour) {
  const d = new Date(now);
  d.setHours(resetHour, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}
function getWeeklyKey(now, weekday, resetHour) {
  const cur = new Date(now);
  cur.setHours(resetHour, 0, 0, 0);
  let diff = (cur.getDay() - weekday + 7) % 7;
  cur.setDate(cur.getDate() - diff);
  if (cur > now) cur.setDate(cur.getDate() - 7);
  return `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
}
function getNextWeeklyReset(now, weekday, resetHour) {
  const cur = new Date(now);
  cur.setHours(resetHour, 0, 0, 0);
  let diff = (weekday - cur.getDay() + 7) % 7;
  let target = new Date(cur);
  target.setDate(cur.getDate() + diff);
  if (target <= now) target.setDate(target.getDate() + 7);
  return target;
}

function checkResets() {
  const now = new Date();
  const dKey = getDailyKey(now, state.settings.dailyResetHour);
  const wKey = getWeeklyKey(
    now,
    state.settings.weeklyResetWeekday,
    state.settings.weeklyResetHour,
  );
  let changed = false;
  if (state.lastDailyKey !== dKey) {
    state.dailyTasks.forEach((t) => (t.done = false));
    state.tribes.forEach((t) => (t.doneCountToday = 0));
    state.lastDailyKey = dKey;
    changed = true;
  }
  if (state.lastWeeklyKey !== wKey) {
    state.weeklyTasks.forEach((t) => (t.done = false));
    state.lastWeeklyKey = wKey;
    changed = true;
  }
  if (changed) {
    scheduleSave();
    renderAll();
  }
}

function checkIcon() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function renderDaily() {
  const wrap = document.getElementById("daily-tasks");
  wrap.innerHTML = "";
  state.dailyTasks.forEach((t) => {
    const el = document.createElement("div");
    el.className = "task-card" + (t.done ? " done" : "");
    el.innerHTML = `<div class="chk">${checkIcon()}</div><input class="task-name-input" value="${escapeAttr(t.name)}" />`;
    el.querySelector(".chk").addEventListener("click", () => {
      t.done = !t.done;
      scheduleSave();
      renderDaily();
    });
    const inp = el.querySelector(".task-name-input");
    inp.addEventListener("click", (e) => e.stopPropagation());
    inp.addEventListener("input", () => {
      t.name = inp.value;
      scheduleSave();
    });
    wrap.appendChild(el);
  });
  const done = state.dailyTasks.filter((t) => t.done).length;
  document.getElementById("daily-count").textContent =
    `${done} / ${state.dailyTasks.length}`;

  // 今日部族任務（依版本分區塊）
  const twrap = document.getElementById("tribe-today-list");
  twrap.innerHTML = "";
  const todays = state.tribes.filter((t) => t.version <= state.currentVersion); //今日可交的部族任務
  const todaysByVersion = {};
  todays.forEach((t) => {
    (todaysByVersion[t.version] = todaysByVersion[t.version] || []).push(t);
  });
  Object.keys(todaysByVersion)
    .sort((a, b) => a - b)
    .forEach((v) => {
      const block = document.createElement("div");
      block.className = "version-block";
      block.innerHTML = `<div class="version-title">第 ${v} 版</div>`;
      const grid = document.createElement("div");
      grid.className = "card-grid";
      todaysByVersion[v].forEach((t) => {
        const full = t.doneCountToday >= t.dailyAllowance;
        const el = document.createElement("div");
        el.className = "task-card" + (full ? " done" : "");
        el.innerHTML = `
                <span style="font-size:13.5px;flex:1;">${escapeHtml(t.name)}</span>
                <button class="quota-btn quota-minus-d">−</button>
                <span class="quota-count${full ? " full" : ""}">${t.doneCountToday}/${t.dailyAllowance}</span>
                <button class="quota-btn quota-plus-d">+</button>
              `;
        el.querySelector(".quota-minus-d").addEventListener("click", (e) => {
          e.stopPropagation();
          t.doneCountToday = Math.max(0, t.doneCountToday - 1);
          scheduleSave();
          renderDaily();
          renderTribes();
        });
        el.querySelector(".quota-plus-d").addEventListener("click", (e) => {
          e.stopPropagation();
          t.doneCountToday = Math.min(t.dailyAllowance, t.doneCountToday + 1);
          scheduleSave();
          renderDaily();
          renderTribes();
        });
        grid.appendChild(el);
      });
      block.appendChild(grid);
      twrap.appendChild(block);
    });

  const totalDone = todays.reduce((s, t) => s + t.doneCountToday, 0); //今日已交總數
  const totalQuota = state.dailyTribeCap; //今日總上限
  document.getElementById("tribe-today-count").textContent =
    `${totalDone} / ${totalQuota}`; //今日已交 / 今日總上限
  const remaining = totalQuota - totalDone; //今日剩餘可交數
  const hintEl = document.getElementById("tribe-today-hint");
  if (hintEl) {
    hintEl.textContent =
      remaining > 0
        ? `今天還有 ${remaining} 次部族任務可以交，別忘記！`
        : `今天的部族任務額度都交完了`;
  }
}

let tribeVersionFilter = "all";
function renderTribes() {
  const wrap = document.getElementById("tribe-blocks");
  wrap.innerHTML = "";
  const byVersion = {};
  state.tribes.forEach((t) => {
    (byVersion[t.version] = byVersion[t.version] || []).push(t);
  });
  Object.keys(byVersion)
    .sort((a, b) => a - b)
    .filter((v) => Number(v) <= state.currentVersion)
    .filter((v) => tribeVersionFilter === "all" || v === tribeVersionFilter)
    .forEach((v) => {
      const block = document.createElement("div");
      block.className = "version-block";
      block.innerHTML = `<div class="version-title">第 ${v} 版</div>`;
      const grid = document.createElement("div");
      grid.className = "tribe-grid";
      const hasLevelTable = !!TRIBE_QUOTA_TABLE[v]; //是否有好感度等級表
      byVersion[v].forEach((t) => {
        const card = document.createElement("div");
        card.className = "tribe-card";
        const full = t.doneCountToday >= t.dailyAllowance; //今日已交完

        if (hasLevelTable) {
          card.innerHTML = `
        <div class="tribe-top">
          <input class="tribe-name-input" value="${escapeAttr(t.name)}" />
        </div>
        <div class="tribe-level-row">
          <select class="tribe-level-select">
            ${TRIBE_LEVELS.map((lv, i) => `<option value="${i}" ${i === t.affinityLevel ? "selected" : ""}>${lv}${TRIBE_LEVEL_POINTS[i] ? `（${TRIBE_LEVEL_POINTS[i]}）` : ""}</option>`).join("")}
          </select>
          <span class="quota-hint">今日上限 ${t.dailyAllowance} 次</span>
        </div>
        <div class="tribe-quota-row">
          <button class="quota-btn quota-minus">−</button>
          <span class="quota-count${full ? " full" : ""}">${t.doneCountToday}/${t.dailyAllowance}</span>
          <button class="quota-btn quota-plus">+</button>
        </div>
        <input class="tribe-note" placeholder="備註" value="${escapeAttr(t.note || "")}" />
      `;
          card
            .querySelector(".tribe-level-select")
            .addEventListener("change", (e) => {
              const lvl = parseInt(e.target.value);
              t.affinityLevel = lvl;
              t.dailyAllowance = quotaForLevel(t.version, lvl);
              if (t.doneCountToday > t.dailyAllowance)
                t.doneCountToday = t.dailyAllowance;
              scheduleSave();
              renderTribes();
              renderDaily();
            });
        } else {
          const pct = Math.max(0, Math.min(100, t.affinity));
          card.innerHTML = `
        <div class="tribe-top">
          <input class="tribe-name-input" value="${escapeAttr(t.name)}" />
        </div>
        <div class="tribe-quota-row">
          <button class="quota-btn quota-minus">−</button>
          <span class="quota-count${full ? " full" : ""}">${t.doneCountToday}/${t.dailyAllowance}</span>
          <button class="quota-btn quota-plus">+</button>
          <span class="quota-max-label">今日上限<input type="number" class="quota-max-input" value="${t.dailyAllowance}" min="1" /></span>
        </div>
        <div class="aff-row">
          <button class="aff-btn minus">−</button>
          <div class="aff-bar-wrap"><div class="aff-bar" style="width:${pct}%"></div></div>
          <button class="aff-btn plus">+</button>
          <span class="aff-num">${t.affinity}</span>
        </div>
        <input class="tribe-note" placeholder="備註，例如：還差 320 點" value="${escapeAttr(t.note || "")}" />
      `;
          card
            .querySelector(".quota-max-input")
            .addEventListener("input", (e) => {
              const v2 = parseInt(e.target.value) || 1;
              t.dailyAllowance = Math.max(1, v2);
              if (t.doneCountToday > t.dailyAllowance)
                t.doneCountToday = t.dailyAllowance;
              scheduleSave();
              renderTribes();
              renderDaily();
            });
          card.querySelector(".minus").addEventListener("click", () => {
            t.affinity = Math.max(0, t.affinity - 1);
            scheduleSave();
            renderTribes();
          });
          card.querySelector(".plus").addEventListener("click", () => {
            t.affinity = Math.min(100, t.affinity + 1);
            scheduleSave();
            renderTribes();
          });
        }

        card.querySelector(".quota-minus").addEventListener("click", () => {
          t.doneCountToday = Math.max(0, t.doneCountToday - 1);
          scheduleSave();
          renderTribes();
          renderDaily();
        });
        card.querySelector(".quota-plus").addEventListener("click", () => {
          t.doneCountToday = Math.min(t.dailyAllowance, t.doneCountToday + 1);
          scheduleSave();
          renderTribes();
          renderDaily();
        });
        const nameInp = card.querySelector(".tribe-name-input");
        nameInp.addEventListener("input", () => {
          t.name = nameInp.value;
          scheduleSave();
          renderDaily();
        });
        const noteInp = card.querySelector(".tribe-note");
        noteInp.addEventListener("input", () => {
          t.note = noteInp.value;
          scheduleSave();
        });
        grid.appendChild(card);
      });
      block.appendChild(grid);
      wrap.appendChild(block);
    });
  document.getElementById("tribe-count").textContent =
    `共 ${state.tribes.filter((t) => t.version <= state.currentVersion).length} 個部族（已開放）`;
}

//每週任務清單渲染（同一份資料，畫在兩個不同容器：每週任務頁 + 日常任務頁提醒）
function renderWeeklyList(containerId, countId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = "";
  state.weeklyTasks.forEach((t) => {
    const el = document.createElement("div");
    el.className = "weekly-card" + (t.done ? " done" : "");
    //本週任務是否完成的勾選框 + 任務名稱輸入框
    el.innerHTML = `<div class="chk">${checkIcon()}</div><input class="task-name-input" value="${escapeAttr(t.name)}" />`;

    el.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      t.done = !t.done;
      scheduleSave();
      renderWeekly();
    });
    const inp = el.querySelector("input");
    inp.addEventListener("click", (e) => e.stopPropagation());
    inp.addEventListener("input", () => {
      t.name = inp.value;
      scheduleSave();
    });
    wrap.appendChild(el);
  });
  const done = state.weeklyTasks.filter((t) => t.done).length;
  const countEl = document.getElementById(countId);
  if (countEl) countEl.textContent = `${done} / ${state.weeklyTasks.length}`;
}
function renderWeekly() {
  renderWeeklyList("weekly-tasks", "weekly-count");
  renderWeeklyList("weekly-tasks-daily", "weekly-count-daily");
}

let memoExpanded = {}; //記錄目前哪些備忘錄是展開狀態（id -> true/false）

// function renderMemos() {
//   const list = document.getElementById("memo-list");
//   const items = [...state.memos].sort((a, b) =>
//     a.done === b.done ? 0 : a.done ? 1 : -1,
//   );
//   if (list) {
//     list.innerHTML = "";
//     if (items.length === 0) {
//       list.innerHTML = `<div class="empty-hint">還沒有備忘事項，新增一筆開始追蹤</div>`;
//     } else {
//       items.forEach((m) => {
//         const wrapEl = document.createElement("div");
//         wrapEl.className = "memo-row-wrap";
//         const expanded = !!memoExpanded[m.id];
//         wrapEl.innerHTML = `
//           <div class="memo-row${m.done ? " done" : ""}">
//             <div class="chk">${checkIcon()}</div>
//             <span class="memo-text memo-row-click">${escapeHtml(m.title)}</span>
//             <span class="memo-date">${escapeHtml(m.date)}</span>
//             <button class="icon-btn del-memo" aria-label="刪除">✕</button>
//           </div>
//           <div class="memo-content" ${expanded ? "" : "hidden"}>${escapeHtml(m.content || "（沒有內文）")}</div>
//         `;
//         wrapEl.querySelector(".chk").addEventListener("click", () => {
//           m.done = !m.done;
//           scheduleSave();
//           renderMemos();
//         });
//         wrapEl
//           .querySelector(".memo-row-click")
//           .addEventListener("click", () => {
//             memoExpanded[m.id] = !memoExpanded[m.id];
//             renderMemos();
//           });
//         wrapEl.querySelector(".del-memo").addEventListener("click", () => {
//           state.memos = state.memos.filter((x) => x.id !== m.id);
//           delete memoExpanded[m.id];
//           scheduleSave();
//           renderMemos();
//         });
//         list.appendChild(wrapEl);
//       });
//     }
//     const countEl = document.getElementById("memo-count");
//     if (countEl)
//       countEl.textContent = `${state.memos.filter((m) => !m.done).length} 未完成`;
//   }
//   renderMemoDailyReminder();
// }

function renderMemos() {
  const list = document.getElementById("memo-list");
  const items = [...state.memos].sort((a, b) =>
    a.done === b.done ? 0 : a.done ? 1 : -1,
  );
  if (list) {
    list.innerHTML = "";
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-hint">還沒有備忘事項，新增一筆開始追蹤</div>`;
    } else {
      items.forEach((m) => {
        const opened = !!memoContentOpen[m.id];
        const editing = !!memoEditing[m.id];
        const wrapEl = document.createElement("div");
        wrapEl.className = "memo-row-wrap";

        const dateHtml = editing
          ? `<input type="date" class="memo-edit-date" value="${escapeAttr(m.date)}" />`
          : `<span class="memo-date memo-row-click">${escapeHtml(m.date)}</span>`;
        const titleHtml = editing
          ? `<input class="task-name-input memo-edit-title" value="${escapeAttr(m.title)}" />`
          : `<span class="memo-text memo-row-click">${escapeHtml(m.title)}</span>`;

        wrapEl.innerHTML = `
          <div class="memo-row${m.done ? " done" : ""}">
            <div class="chk">${checkIcon()}</div>
            ${dateHtml}
            ${titleHtml}
            <button class="reset-btn-sm memo-edit-btn">${editing ? "完成" : "編輯"}</button>
            <button class="icon-btn del-memo" aria-label="刪除">✕</button>
          </div>
          <div class="memo-content" ${opened ? "" : "hidden"}>${
            editing
              ? `<textarea class="memo-content-input memo-edit-content" rows="2">${escapeHtml(m.content || "")}</textarea>`
              : escapeHtml(m.content || "（沒有內文）")
          }</div>
        `;

        wrapEl.querySelector(".chk").addEventListener("click", () => {
          m.done = !m.done;
          scheduleSave();
          renderMemos();
        });
        if (!editing) {
          wrapEl.querySelectorAll(".memo-row-click").forEach((el) => {
            el.addEventListener("click", () => {
              memoContentOpen[m.id] = !memoContentOpen[m.id];
              renderMemos();
            });
          });
        }
        wrapEl.querySelector(".memo-edit-btn").addEventListener("click", () => {
          memoEditing[m.id] = !memoEditing[m.id];
          if (memoEditing[m.id]) memoContentOpen[m.id] = true;
          renderMemos();
        });
        if (editing) {
          const dateInp = wrapEl.querySelector(".memo-edit-date");
          dateInp.addEventListener("input", () => {
            m.date = dateInp.value;
            scheduleSave();
          });
          const titleInp = wrapEl.querySelector(".memo-edit-title");
          titleInp.addEventListener("input", () => {
            m.title = titleInp.value;
            scheduleSave();
          });
          const contentInp = wrapEl.querySelector(".memo-edit-content");
          contentInp.addEventListener("input", () => {
            m.content = contentInp.value;
            scheduleSave();
          });
        }
        wrapEl.querySelector(".del-memo").addEventListener("click", () => {
          if (!confirmDelete(`確定要刪除「${m.title}」這筆備忘錄嗎？`)) return;
          state.memos = state.memos.filter((x) => x.id !== m.id);
          delete memoContentOpen[m.id];
          delete memoEditing[m.id];
          scheduleSave();
          renderMemos();
        });
        list.appendChild(wrapEl);
      });
    }
    const countEl = document.getElementById("memo-count");
    if (countEl)
      countEl.textContent = `${state.memos.filter((m) => !m.done).length} 未完成`;
  }
  renderMemoDailyReminder();
}

//---------------
let memoContentOpen = {}; // id -> 是否展開內文
let memoEditing = {}; // id -> 是否處於編輯模式
let dragMemoId = null; // 目前正在拖曳的備忘錄 id

//日常任務頁的備忘錄提醒：依新增日期排序，只顯示未完成的
function renderMemoDailyReminder() {
  const wrap = document.getElementById("memo-daily-list");
  if (!wrap) return;
  wrap.innerHTML = "";
  const items = state.memos; // 直接照陣列順序顯示，順序可以用拖曳調整
  const countEl = document.getElementById("memo-daily-count");
  if (countEl)
    countEl.textContent = `${items.filter((m) => !m.done).length} 未完成`;
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-hint">還沒有備忘事項</div>`;
    return;
  }
  items.forEach((m) => {
    const opened = !!memoContentOpen[m.id];
    const editing = !!memoEditing[m.id];
    const row = document.createElement("div");
    row.className = "memo-row-wrap";
    row.draggable = true;

    const titleHtml = editing
      ? `<input class="task-name-input memo-edit-title" value="${escapeAttr(m.title)}" />`
      : `<span class="memo-text">${escapeHtml(m.title)}</span>`;

    const dateHtml = editing
      ? `<input type="date" class="memo-edit-date" value="${escapeAttr(m.date)}" />`
      : `<span class="memo-date">${escapeHtml(m.date)}</span>`;

    row.innerHTML = `
      <div class="memo-row${m.done ? " done" : ""}">
        <div class="chk">${checkIcon()}</div>
        ${dateHtml}
        ${titleHtml}
        <button class="icon-btn memo-caret-btn" aria-label="展開內文">${opened ? "▲" : "▼"}</button>
        <button class="reset-btn-sm memo-edit-btn">${editing ? "完成" : "編輯"}</button>
        <button class="icon-btn del-memo-daily" aria-label="刪除">✕</button>
      </div>
      <div class="memo-content" ${opened ? "" : "hidden"}>${
        editing
          ? `<textarea class="memo-content-input memo-edit-content" rows="2">${escapeHtml(m.content || "")}</textarea>`
          : escapeHtml(m.content || "（沒有內文）")
      }</div>
    `;

    row.querySelector(".chk").addEventListener("click", () => {
      m.done = !m.done;
      scheduleSave();
      renderMemos();
    });
    row.querySelector(".memo-caret-btn").addEventListener("click", () => {
      memoContentOpen[m.id] = !memoContentOpen[m.id];
      renderMemoDailyReminder();
    });
    row.querySelector(".memo-edit-btn").addEventListener("click", () => {
      memoEditing[m.id] = !memoEditing[m.id];
      if (memoEditing[m.id]) memoContentOpen[m.id] = true;
      renderMemoDailyReminder();
    });

    row.querySelector(".del-memo-daily").addEventListener("click", () => {
      if (!confirmDelete(`確定要刪除「${m.title}」這筆備忘錄嗎？`)) return;
      state.memos = state.memos.filter((x) => x.id !== m.id);
      scheduleSave();
      renderMemos();
    });

    if (editing) {
      //編輯模式下，可改日期、標題、內文
      const dateInp = row.querySelector(".memo-edit-date");
      dateInp.addEventListener("input", () => {
        m.date = dateInp.value;
        scheduleSave();
      });
      const titleInp = row.querySelector(".memo-edit-title");
      titleInp.addEventListener("input", () => {
        m.title = titleInp.value;
        scheduleSave();
      });
      const contentInp = row.querySelector(".memo-edit-content");
      contentInp.addEventListener("input", () => {
        m.content = contentInp.value;
        scheduleSave();
      });
    }

    row.addEventListener("dragstart", () => {
      dragMemoId = m.id;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      dragMemoId = null;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!dragMemoId || dragMemoId === m.id) return;
      const fromIdx = state.memos.findIndex((x) => x.id === dragMemoId);
      const toIdx = state.memos.findIndex((x) => x.id === m.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = state.memos.splice(fromIdx, 1);
      state.memos.splice(toIdx, 0, moved);
      scheduleSave();
      renderMemoDailyReminder();
    });

    wrap.appendChild(row);
  });
}

//實用網站清單
function renderLinks() {
  const list = document.getElementById("link-list");
  if (!list) return;
  list.innerHTML = "";
  if (state.links.length === 0) {
    list.innerHTML = `<div class="empty-hint">還沒有收藏的網站，新增一筆開始收藏</div>`;
  } else {
    state.links.forEach((l) => {
      const row = document.createElement("div");
      row.className = "memo-row-wrap";
      row.innerHTML = `
        <div class="memo-row">
          <a href="${escapeAttr(l.url)}" target="_blank" rel="noopener" class="memo-text" style="color:var(--text-0);text-decoration:none;">${escapeHtml(l.name)}</a>
          <button class="icon-btn del-link" aria-label="刪除">✕</button>
        </div>
      `;
      row.querySelector(".del-link").addEventListener("click", () => {
        if (!confirmDelete(`確定要刪除「${l.name}」這個網站嗎？`)) return;
        state.links = state.links.filter((x) => x.id !== l.id);
        scheduleSave();
        renderLinks();
      });
      list.appendChild(row);
    });
  }
  const countEl = document.getElementById("links-count");
  if (countEl) countEl.textContent = `${state.links.length} 筆`;
}

function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
//確認是否刪除-對話框
function confirmDelete(message) {
  return window.confirm(message || "確定要刪除嗎？這個動作無法復原。");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function renderTodayBanner() {
  const banner = document.getElementById("today-events-banner");
  const todays = getAllEvents().filter((e) => isEventOnDay(e, todayStr()));
  if (todays.length === 0) {
    banner.classList.add("empty");
    banner.innerHTML = `<span class="label">今日活動</span><span class="items" style="color:var(--text-2);font-size:12.5px;">今天沒有安排的活動</span>`;
  } else {
    banner.classList.remove("empty");
    banner.innerHTML = `<span class="label">今日活動</span><div class="items">${todays.map((e) => `<span class="pill">${escapeHtml(e.title)}</span>`).join("")}</div>`;
  }
}
function isEventOnDay(e, key) {
  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const end = e.endDate && isValidDate(e.endDate) ? e.endDate : e.date;
  return key >= e.date && key <= end;
}
//官方行事曆活動
function eventLinkHtml(ev) {
  if (ev.url) {
    return `<a href="${escapeAttr(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.title)}</a>`;
  }
  return escapeHtml(ev.title);
}
let calViewYear, calViewMonth, calSelectedDate;
let calSelectedColor = EVENT_COLORS[0]; //預設顏色
//行事曆顏色選擇器
function renderColorPicker() {
  const wrap = document.getElementById("cal-color-picker");
  wrap.innerHTML = "";
  EVENT_COLORS.forEach((c) => {
    const sw = document.createElement("div");
    sw.className =
      "cal-color-swatch" + (c === calSelectedColor ? " selected" : "");
    sw.style.background = c;
    sw.addEventListener("click", () => {
      calSelectedColor = c;
      renderColorPicker();
    });
    wrap.appendChild(sw);
  });
}
//行事曆
function renderCalendar() {
  const y = calViewYear,
    m = calViewMonth;
  document.getElementById("cal-title").textContent = `${y} 年 ${m + 1} 月`;

  const dowRow = document.getElementById("cal-dow-row");
  dowRow.innerHTML = ["日", "一", "二", "三", "四", "五", "六"]
    .map((d) => `<div class="cal-dow">${d}</div>`)
    .join("");

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const firstDay = new Date(y, m, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const today = todayStr();

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    const dnum = daysInPrevMonth - startOffset + 1 + i;
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    cells.push({ key: dateKey(py, pm, dnum), dnum, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: dateKey(y, m, d), dnum: d, other: false });
  }
  const remainder = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remainder; i++) {
    const nm = m === 11 ? 0 : m + 1;
    const ny = m === 11 ? y + 1 : y;
    cells.push({ key: dateKey(ny, nm, i), dnum: i, other: true });
  }

  cells.forEach((c) => {
    const evs = getAllEvents().filter((e) => isEventOnDay(e, c.key));
    const maxShow = 3;
    const bars = evs
      .slice(0, maxShow)
      .map(
        (e) =>
          `<div class="cal-event-bar" style="background:${e.color || EVENT_COLORS[0]};color:${e.textColor || "#2d2a37"}">${escapeHtml(e.title)}</div>`,
      )
      .join("");
    const more =
      evs.length > maxShow
        ? `<div class="cal-event-more">+${evs.length - maxShow}</div>`
        : "";
    const cell = document.createElement("div");
    cell.className =
      "cal-cell" +
      (c.other ? " other-month" : "") +
      (c.key === today ? " today" : "") +
      (c.key === calSelectedDate ? " selected" : "");
    cell.innerHTML = `<span class="cal-daynum">${c.dnum}</span><div class="cal-event-bars">${bars}${more}</div>`;
    cell.addEventListener("click", () => {
      calSelectedDate = c.key;
      renderCalendar();
    });
    grid.appendChild(cell);
  });

  const detailDate = document.getElementById("cal-detail-date");
  const [sy, sm, sd] = calSelectedDate.split("-").map(Number);
  const wd = ["日", "一", "二", "三", "四", "五", "六"][
    new Date(sy, sm - 1, sd).getDay()
  ];
  detailDate.textContent = `${sy} 年 ${sm} 月 ${sd} 日（週${wd}）${calSelectedDate === today ? " · 今天" : ""}`;

  const list = document.getElementById("cal-event-list");
  const dayEvents = getAllEvents().filter((e) =>
    isEventOnDay(e, calSelectedDate),
  );
  if (dayEvents.length === 0) {
    list.innerHTML = `<div class="empty-hint" style="padding:14px;font-size:12px;">這天還沒有安排活動</div>`;
  } else {
    list.innerHTML = "";
    dayEvents.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "cal-event-row";
      const delHtml = ev.official
        ? `<span style="font-size:10px;color:var(--text-2);flex-shrink:0;">官方</span>`
        : `<button class="icon-btn del-ev" aria-label="刪除">✕</button>`;
      row.innerHTML = `<span class="dot" style="background:${ev.color || EVENT_COLORS[0]}"></span><div class="cal-event-body"><div class="cal-event-title">${eventLinkHtml(ev)}</div>${ev.note ? `<div class="cal-event-note">${escapeHtml(ev.note)}</div>` : ""}</div>${delHtml}`;
      if (!ev.official) {
        row.querySelector(".del-ev").addEventListener("click", () => {
          if (!confirmDelete(`確定要刪除「${ev.title}」這個活動嗎？`)) return;
          state.events = state.events.filter((x) => x.id !== ev.id);
          scheduleSave();
          renderCalendar();
          renderTodayBanner();
        });
      }
      list.appendChild(row);
    });
  }
}

function setupCalendar() {
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
  calSelectedDate = todayStr();

  document.getElementById("cal-prev").addEventListener("click", () => {
    calViewMonth--;
    if (calViewMonth < 0) {
      calViewMonth = 11;
      calViewYear--;
    }
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    calViewMonth++;
    if (calViewMonth > 11) {
      calViewMonth = 0;
      calViewYear++;
    }
    renderCalendar();
  });
  document.getElementById("cal-today").addEventListener("click", () => {
    const n = new Date();
    calViewYear = n.getFullYear();
    calViewMonth = n.getMonth();
    calSelectedDate = todayStr();
    renderCalendar();
  });

  const titleInp = document.getElementById("cal-ev-title");
  const noteInp = document.getElementById("cal-ev-note");
  const endInp = document.getElementById("cal-ev-end");
  renderColorPicker();
  document.getElementById("cal-ev-add-btn").addEventListener("click", () => {
    const title = titleInp.value.trim();
    if (!title) return;
    const endDate = endInp.value || calSelectedDate;
    state.events.push({
      id: uid(),
      date: calSelectedDate,
      endDate,
      title,
      note: noteInp.value.trim(),
      color: calSelectedColor,
    });
    titleInp.value = "";
    noteInp.value = "";
    endInp.value = "";
    scheduleSave();
    renderCalendar();
    renderTodayBanner();
    titleInp.focus();
  });
  titleInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("cal-ev-add-btn").click();
  });
}

function renderAll() {
  renderDaily();
  renderTribes();
  renderWeekly();
  renderMemos();
  renderLinks();
  renderTodayBanner();
  renderCalendar();
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document
        .getElementById("panel-" + btn.dataset.tab)
        .classList.add("active");
    });
  });
}

function setupSettings() {
  const dHourLabel = document.getElementById("daily-reset-hour-label");
  if (dHourLabel) {
    dHourLabel.textContent = `${pad(state.settings.dailyResetHour)}:00`;
  }

  const wDay = document.getElementById("weekly-reset-day");

  ["日", "一", "二", "三", "四", "五", "六"].forEach((d, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `週${d}`;
    wDay.appendChild(o);
  });
  wDay.value = state.settings.weeklyResetWeekday;
  wDay.addEventListener("change", () => {
    state.settings.weeklyResetWeekday = parseInt(wDay.value);
    scheduleSave();
    checkResets();
    updateCountdowns();
  });

  const wHour = document.getElementById("weekly-reset-hour");
  for (let h = 0; h < 24; h++) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = `${pad(h)}:00`;
    wHour.appendChild(o);
  }
  wHour.value = state.settings.weeklyResetHour;
  wHour.addEventListener("change", () => {
    state.settings.weeklyResetHour = parseInt(wHour.value);
    scheduleSave();
    checkResets();
    updateCountdowns();
  });

  document
    .getElementById("manual-daily-reset")
    .addEventListener("click", () => {
      state.dailyTasks.forEach((t) => (t.done = false));
      state.tribes.forEach((t) => (t.doneCountToday = 0));
      scheduleSave();
      renderAll();
    });
  document
    .getElementById("manual-weekly-reset")
    .addEventListener("click", () => {
      state.weeklyTasks.forEach((t) => (t.done = false));
      scheduleSave();
      renderAll();
    });
}

// function setupMemoAdd() {
//   const titleInp = document.getElementById("memo-title");
//   const contentInp = document.getElementById("memo-content");
//   document.getElementById("memo-add-btn").addEventListener("click", () => {
//     const title = titleInp.value.trim();
//     if (!title) return;
//     state.memos.push({
//       id: uid(),
//       title,
//       content: contentInp.value.trim(),
//       done: false,
//       createdAt: Date.now(),
//     });
//     titleInp.value = "";
//     contentInp.value = "";
//     scheduleSave();
//     renderMemos();
//     titleInp.focus();
//   });
//   titleInp.addEventListener("keydown", (e) => {
//     if (e.key === "Enter") document.getElementById("memo-add-btn").click();
//   });
// }
function setupMemoAdd() {
  const dateInp = document.getElementById("memo-date");
  const titleInp = document.getElementById("memo-title");
  const contentInp = document.getElementById("memo-content");
  dateInp.value = todayStr();
  document.getElementById("memo-add-btn").addEventListener("click", () => {
    const title = titleInp.value.trim();
    if (!title) return;
    state.memos.push({
      id: uid(),
      date: dateInp.value || todayStr(),
      title,
      content: contentInp.value.trim(),
      done: false,
      createdAt: Date.now(),
    });
    dateInp.value = todayStr();
    titleInp.value = "";
    contentInp.value = "";
    scheduleSave();
    renderMemos();
    titleInp.focus();
  });
  titleInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("memo-add-btn").click();
  });
}

function setupLinkAdd() {
  const nameInp = document.getElementById("link-name");
  const urlInp = document.getElementById("link-url");
  document.getElementById("link-add-btn").addEventListener("click", () => {
    const name = nameInp.value.trim();
    let url = urlInp.value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    state.links.push({ id: uid(), name, url });
    nameInp.value = "";
    urlInp.value = "";
    scheduleSave();
    renderLinks();
    nameInp.focus();
  });
  urlInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("link-add-btn").click();
  });
}

//部族版本進度選擇器
function setupVersionProgress() {
  const selectIds = ["current-version-select", "current-version-select-daily"];
  const selects = selectIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const versions = Object.keys(TRIBE_DATA).sort((a, b) => a - b);
  selects.forEach((sel) => {
    sel.innerHTML = "";
    versions.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = `第 ${v} 版`;
      sel.appendChild(o);
    });
    sel.value = state.currentVersion;
    sel.addEventListener("change", () => {
      state.currentVersion = parseInt(sel.value);
      if (
        tribeVersionFilter !== "all" &&
        Number(tribeVersionFilter) > state.currentVersion
      ) {
        tribeVersionFilter = "all";
      }
      selects.forEach((other) => {
        if (other !== sel) other.value = state.currentVersion;
      });
      scheduleSave();
      setupTribeFilter();
      renderTribes();
      renderDaily();
    });
  });
}

//部族版本篩選器
function setupTribeFilter() {
  const wrap = document.getElementById("tribe-version-pills");
  const versions = Object.keys(TRIBE_DATA)
    .sort((a, b) => a - b)
    .filter((v) => Number(v) <= state.currentVersion);
  function draw() {
    wrap.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.className =
      "version-pill" + (tribeVersionFilter === "all" ? " active" : "");
    allBtn.textContent = "全部";
    allBtn.addEventListener("click", () => {
      tribeVersionFilter = "all";
      draw();
      renderTribes();
    });
    wrap.appendChild(allBtn);
    versions.forEach((v) => {
      const btn = document.createElement("button");
      btn.className =
        "version-pill" + (tribeVersionFilter === v ? " active" : "");
      btn.textContent = `${v}版`;
      btn.addEventListener("click", () => {
        tribeVersionFilter = v;
        draw();
        renderTribes();
      });
      wrap.appendChild(btn);
    });
  }
  draw();
}

function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return d > 0
    ? `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function updateCountdowns() {
  const now = new Date();
  const nd = getNextDailyReset(now, state.settings.dailyResetHour);
  const nw = getNextWeeklyReset(
    now,
    state.settings.weeklyResetWeekday,
    state.settings.weeklyResetHour,
  );
  document.getElementById("daily-countdown").textContent = fmtCountdown(
    nd - now,
  );
  document.getElementById("weekly-countdown").textContent = fmtCountdown(
    nw - now,
  );
}

(async function init() {
  await loadState();
  setupCalendar();
  checkResets();
  setupTabs();
  setupSettings();
  setupMemoAdd();
  setupLinkAdd();
  setupVersionProgress();
  setupTribeFilter();
  renderAll();
  updateCountdowns();
  setInterval(updateCountdowns, 1000);
  setInterval(checkResets, 30000);
})();
