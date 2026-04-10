/**
 * PIKACHU CONNECT (ONET) - PRODUCTION ARCHITECTURE
 */

// ==========================================
// 1. CONFIGURATION & UTILS
// ==========================================
const CONFIG = {
    ICONS: ["🍎","🍌","🍇","🍓","🍉","🍒","🥝","🥥","🍍","🥭","🍑","🍋","🍈","🍊","🍐","🌮","🍔","🍟","🍕","🌭","🍿","🍩","🍪","🎂","🍦","🍭","🍬","🍫"],
    POWERUPS: {
        hint: { id: 'hint', icon: '🔍', name: 'Hint', price: 50 },
        shuffle: { id: 'shuffle', icon: '🔀', name: 'Shuffle', price: 100 },
        freeze: { id: 'freeze', icon: '❄️', name: 'Freeze', price: 150 },
        bomb: { id: 'bomb', icon: '💣', name: 'Bomb', price: 200 },
        lightning: { id: 'lightning', icon: '⚡', name: 'Lightning', price: 250 }
    }
};

const $ = id => document.getElementById(id);
const Utils = {
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    shuffle: (arr) => { for(let i = arr.length - 1; i > 0; i--){ let j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    formatTime: (sec) => `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`
};

// ==========================================
// 2. STORAGE SYSTEM
// ==========================================
const StorageManager = {
    data: {
        xp: 0, level: 1, maxLevel: 1, coins: 500, items: { hint: 3, shuffle: 3, freeze: 1, bomb: 1, lightning: 1 },
        theme: 'dark', lastDaily: 0, musicOn: true
    },
    load() {
        let saved = localStorage.getItem("onet_save");
        if(saved) Object.assign(this.data, JSON.parse(saved));
        document.documentElement.setAttribute('data-theme', this.data.theme);
    },
    save() { localStorage.setItem("onet_save", JSON.stringify(this.data)); },
    addCoins(amt) { this.data.coins += amt; this.save(); UI.updateMenuData(); },
    addXP(amt) {
        this.data.xp += amt;
        let newLevel = Math.floor(Math.sqrt(this.data.xp / 100)) + 1;
        if(newLevel > this.data.level) { this.data.level = newLevel; UI.toast("Level UP!"); }
        this.save(); UI.updateMenuData();
    },
    claimDaily() {
        let now = Date.now();
        if (now - this.data.lastDaily > 86400000) {
            this.addCoins(500); this.data.lastDaily = now; this.save();
            UI.toast("Claimed 500 Coins!"); UI.hideModal();
        } else {
            UI.toast("Come back tomorrow!");
        }
    }
};

// ==========================================
// 3. SOUND ENGINE (WEB AUDIO API)
// ==========================================
const AudioSys = {
    ctx: null, allowed: true,
    init() { if(!this.ctx && this.allowed) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } },
    toggleMusic() {
        StorageManager.data.musicOn = !StorageManager.data.musicOn; StorageManager.save();
        UI.toast(StorageManager.data.musicOn ? "Sound ON" : "Sound OFF");
    },
    playTone(freq, type, duration, vol=0.1) {
        if(!StorageManager.data.musicOn) return;
        this.init(); if(!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    },
    click() { this.playTone(600, 'sine', 0.1); },
    match() { this.playTone(800, 'sine', 0.1); setTimeout(() => this.playTone(1200, 'sine', 0.15), 100); },
    error() { this.playTone(300, 'sawtooth', 0.2); },
    win() { [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.3, 0.1), i*150)); },
    lose() { [300, 250, 200].forEach((f, i) => setTimeout(() => this.playTone(f, 'sawtooth', 0.3, 0.1), i*250)); }
};

// ==========================================
// 4. LEVEL & BOARD LOGIC
// ==========================================
const LevelManager = {
    getConfig(lv) {
        let R = 4, C = 4;
        if(lv > 2) { R = 6; C = 4; } if(lv > 4) { R = 6; C = 6; }
        if(lv > 7) { R = 8; C = 6; } if(lv > 12) { R = 10; C = 6; }
        if(lv > 20) { R = 12; C = 6; } if(lv > 30) { R = 12; C = 8; } // Mobile friendly sizes
        
        let types = Math.min(CONFIG.ICONS.length, 4 + Math.floor(lv / 3));
        let time = (R * C) * 2.5 + 10;
        let isBoss = lv % 5 === 0;
        if(isBoss) { types = Math.min(CONFIG.ICONS.length, types + 3); time = Math.floor(time * 0.8); }
        return { R, C, types, time, isBoss };
    }
};

class PathFinder {
    constructor(grid) { this.grid = grid; this.R = grid.length; this.C = grid[0].length; }
    isEmpty(r, c) { return this.grid[r][c] === 0; }
    checkX(r, c1, c2) {
        let min = Math.min(c1, c2), max = Math.max(c1, c2);
        for (let c = min + 1; c < max; c++) if (!this.isEmpty(r, c)) return false;
        return true;
    }
    checkY(c, r1, r2) {
        let min = Math.min(r1, r2), max = Math.max(r1, r2);
        for (let r = min + 1; r < max; r++) if (!this.isEmpty(r, c)) return false;
        return true;
    }
    findPath(r1, c1, r2, c2) {
        if (r1 === r2 && c1 === c2) return null;
        if (this.grid[r1][c1] !== this.grid[r2][c2]) return null;

        // 0 turns
        if (r1 === r2 && this.checkX(r1, c1, c2)) return [{r:r1,c:c1}, {r:r2,c:c2}];
        if (c1 === c2 && this.checkY(c1, r1, r2)) return [{r:r1,c:c1}, {r:r2,c:c2}];

        // 1 turn
        if (this.isEmpty(r1, c2) && this.checkX(r1, c1, c2) && this.checkY(c2, r1, r2)) return [{r:r1,c:c1}, {r:r1,c:c2}, {r:r2,c:c2}];
        if (this.isEmpty(r2, c1) && this.checkY(c1, r1, r2) && this.checkX(r2, c1, c2)) return [{r:r1,c:c1}, {r:r2,c:c1}, {r:r2,c:c2}];

        // 2 turns H-scan
        for (let c = 0; c < this.C; c++) {
            if (c !== c1 && c !== c2 && this.isEmpty(r1, c) && this.isEmpty(r2, c)) {
                if (this.checkX(r1, c1, c) && this.checkY(c, r1, r2) && this.checkX(r2, c, c2)) return [{r:r1,c:c1}, {r:r1,c:c}, {r:r2,c:c}, {r:r2,c:c2}];
            }
        }
        // 2 turns V-scan
        for (let r = 0; r < this.R; r++) {
            if (r !== r1 && r !== r2 && this.isEmpty(r, c1) && this.isEmpty(r, c2)) {
                if (this.checkY(c1, r1, r) && this.checkX(r, c1, c2) && this.checkY(c2, r, r2)) return [{r:r1,c:c1}, {r:r,c:c1}, {r:r,c:c2}, {r:r2,c:c2}];
            }
        }
        return null;
    }
}

class Board {
    constructor(R, C, numTypes) {
        this.R = R; this.C = C;
        this.grid = Array(R+2).fill(0).map(() => Array(C+2).fill(0));
        this.pf = new PathFinder(this.grid);
        this.tilesLeft = R * C;
        
        let tiles = [];
        let types = CONFIG.ICONS.slice(0, numTypes);
        for (let i = 0; i < R*C; i += 2) {
            let t = types[(i/2) % types.length];
            tiles.push(t, t);
        }
        Utils.shuffle(tiles);
        
        for (let r = 1; r <= R; r++)
            for (let c = 1; c <= C; c++)
                this.grid[r][c] = tiles.pop();
                
        this.ensureSolvable(true);
    }
    
    findAnyPair() {
        for (let r1 = 1; r1 <= this.R; r1++) {
            for (let c1 = 1; c1 <= this.C; c1++) {
                if (this.grid[r1][c1] === 0) continue;
                for (let r2 = r1; r2 <= this.R; r2++) {
                    for (let c2 = 1; c2 <= this.C; c2++) {
                        if (r1 === r2 && c1 === c2) continue;
                        if (this.grid[r1][c1] === this.grid[r2][c2]) {
                            if (this.pf.findPath(r1, c1, r2, c2)) return [{r:r1,c:c1}, {r:r2,c:c2}];
                        }
                    }
                }
            }
        }
        return null;
    }
    
    shuffle() {
        let tiles = [];
        for (let r = 1; r <= this.R; r++)
            for (let c = 1; c <= this.C; c++)
                if (this.grid[r][c] !== 0) tiles.push(this.grid[r][c]);
        Utils.shuffle(tiles);
        for (let r = 1; r <= this.R; r++)
            for (let c = 1; c <= this.C; c++)
                if (this.grid[r][c] !== 0) this.grid[r][c] = tiles.pop();
        UI.renderBoard(this);
    }
    
    ensureSolvable(silent = false) {
        if (this.tilesLeft === 0) return;
        let attempts = 0;
        while (!this.findAnyPair() && attempts < 100) {
            this.shuffle(); attempts++;
            if (!silent && attempts === 1) UI.toast("Auto Shuffling...");
        }
    }
}

// ==========================================
// 5. GAME ENGINE
// ==========================================
const GameEngine = {
    state: { playing: false, level: 1, score: 0, combo: 0, time: 0, maxTime: 0, frozen: false },
    board: null, timerId: null, comboTid: null, selected: null,
    
    startLevel(lv) {
        this.state.level = lv;
        let cfg = LevelManager.getConfig(lv);
        this.board = new Board(cfg.R, cfg.C, cfg.types);
        this.state.maxTime = this.state.time = cfg.time;
        this.state.score = 0; this.state.combo = 0; this.state.frozen = false; this.state.playing = true;
        this.selected = null;
        
        UI.switchScreen('screen-game');
        UI.renderBoard(this.board);
        UI.renderPowerups();
        UI.updateHUD();
        
        clearInterval(this.timerId);
        this.timerId = setInterval(() => this.tick(), 1000);
    },
    
    tick() {
        if(!this.state.playing || this.state.frozen) return;
        this.state.time--;
        UI.updateHUD();
        if(this.state.time <= 0) this.gameOver();
    },
    
    selectTile(r, c) {
        if (!this.state.playing) return;
        AudioSys.init(); // ensure active
        let t = this.board.grid[r][c];
        if (t === 0) return;
        
        if (!this.selected) {
            this.selected = {r, c}; UI.selectTile(r, c); AudioSys.click();
        } else {
            let p1 = this.selected, p2 = {r, c};
            if (p1.r === p2.r && p1.c === p2.c) {
                this.selected = null; UI.deselectAll(); AudioSys.click(); return;
            }
            let path = this.board.pf.findPath(p1.r, p1.c, p2.r, p2.c);
            if (path) { this.handleMatch(p1, p2, path); } 
            else {
                this.selected = {r, c}; UI.deselectAll(); UI.selectTile(r, c); AudioSys.error();
            }
        }
    },
    
    handleMatch(p1, p2, path) {
        this.selected = null;
        this.board.grid[p1.r][p1.c] = 0; this.board.grid[p2.r][p2.c] = 0;
        this.board.tilesLeft -= 2;
        
        AudioSys.match(); UI.drawPath(path); UI.removeTileDOM(p1); UI.removeTileDOM(p2);
        
        this.state.combo++;
        let pts = 10 * this.state.combo;
        this.state.score += pts;
        UI.showFloatingText(p2.r, p2.c, `+${pts}`);
        UI.updateHUD();
        
        clearTimeout(this.comboTid);
        this.comboTid = setTimeout(() => { this.state.combo = 0; UI.updateHUD(); }, 4000);
        
        if (this.board.tilesLeft === 0) this.winLevel();
        else this.board.ensureSolvable();
    },
    
    usePowerUp(type) {
        if(!this.state.playing) return;
        let item = StorageManager.data.items[type];
        let cost = CONFIG.POWERUPS[type].price;
        
        if (item > 0) { StorageManager.data.items[type]--; }
        else if (StorageManager.data.coins >= cost) { StorageManager.data.coins -= cost; }
        else { UI.toast("Need more coins!"); return; }
        
        StorageManager.save(); UI.renderPowerups(); AudioSys.playTone(900, 'sine', 0.2);
        
        if(type === 'hint') {
            let p = this.board.findAnyPair();
            if(p) { UI.selectTile(p[0].r, p[0].c, true); UI.selectTile(p[1].r, p[1].c, true); }
        }
        if(type === 'shuffle') this.board.shuffle();
        if(type === 'freeze') {
            this.state.frozen = true; UI.toast("TIME DRIFT FROZEN!");
            setTimeout(() => this.state.frozen = false, 8000);
        }
        if(type === 'bomb') {
            let p = this.board.findAnyPair();
            if(p) { let path = this.board.pf.findPath(p[0].r, p[0].c, p[1].r, p[1].c); this.handleMatch(p[0], p[1], path); }
        }
        if(type === 'lightning') {
            UI.toast("LIGHTNING STRIKE!");
            for(let i=0; i<3; i++) {
                setTimeout(() => {
                    let p = this.board.findAnyPair();
                    if(p) { let path = this.board.pf.findPath(p[0].r, p[0].c, p[1].r, p[1].c); this.handleMatch(p[0], p[1], path); }
                }, i * 300);
            }
        }
    },
    
    gameOver() {
        this.state.playing = false; clearInterval(this.timerId); AudioSys.lose();
        $('go-score').innerText = this.state.score;
        UI.showModal('modal-gameover');
    },
    
    winLevel() {
        this.state.playing = false; clearInterval(this.timerId); AudioSys.win();
        let pct = this.state.time / this.state.maxTime;
        let stars = pct > 0.6 ? 3 : (pct > 0.3 ? 2 : 1);
        let coins = 50 + (stars * 10) + Math.floor(pct * 50);
        
        StorageManager.addCoins(coins); StorageManager.addXP(300 + stars * 50);
        
        $('vic-score').innerText = this.state.score;
        $('vic-coins').innerText = coins;
        let starHtml = '';
        for(let i=0; i<3; i++) starHtml += `<i class="fas fa-star ${i < stars ? 'active' : 'text-muted'}"></i>`;
        $('victory-stars').innerHTML = starHtml;
        
        UI.showModal('modal-victory');
        setTimeout(() => {
   GameEngine.startLevel( GameEngine.state.level + 1);
}, 1000);
    },
    
    quit() { this.state.playing = false; clearInterval(this.timerId); }
};

// ==========================================
// 6. UI MANAGER
// ==========================================
const UI = {
    switchScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $(id).classList.add('active');
        if(id === 'screen-menu') this.updateMenuData();
    },
    showModal(id) { $('modal-overlay').classList.remove('hidden'); $('.modal').forEach(m => m.classList.add('hidden')); $(id).classList.remove('hidden'); },
    hideModal() { $('modal-overlay').classList.add('hidden'); },
    
    updateMenuData() {
        $('menu-level').innerText = StorageManager.data.level;
        $('btn-play-level').innerText = StorageManager.data.level;
        $('menu-xp').innerText = StorageManager.data.xp;
        $('menu-coins').innerText = StorageManager.data.coins;
    },
    
    updateHUD() {
        $('hud-level').innerText = GameEngine.state.level;
        $('hud-score').innerText = GameEngine.state.score;
        $('hud-combo').innerText = GameEngine.state.combo > 1 ? `x${GameEngine.state.combo}` : '';
        let pct = Math.max(0, (GameEngine.state.time / GameEngine.state.maxTime) * 100);
        $('timer-bar').style.width = pct + '%';
        if(GameEngine.state.frozen) $('timer-bar').style.backgroundColor = '#00d2d3';
        else $('timer-bar').style.backgroundColor = '';
    },
    
    renderBoard(board) {
        let cont = $('board-container');
        cont.style.setProperty('--cols', board.C + 2);
        cont.style.setProperty('--rows', board.R + 2);
        cont.innerHTML = ''; $('path-layer').innerHTML = '';
        
        for (let r = 0; r < board.R + 2; r++) {
            for (let c = 0; c < board.C + 2; c++) {
                let cell = document.createElement('div'); cell.className = 'cell'; cell.id = `cell-${r}-${c}`;
                if (board.grid[r][c] !== 0) {
                    let tile = document.createElement('div'); tile.className = 'tile';
                    tile.innerText = board.grid[r][c]; tile.onclick = () => GameEngine.selectTile(r, c);
                    cell.appendChild(tile);
                }
                cont.appendChild(cell);
            }
        }
    },
    
    renderPowerups() {
        let ft = document.querySelector('.game-footer'); ft.innerHTML = '';
        Object.values(CONFIG.POWERUPS).forEach(p => {
            let count = StorageManager.data.items[p.id];
            let costHtml = count > 0 ? `<div class="powerup-count">${count}</div>` : `<div class="powerup-name"><i class="fas fa-coins text-gold"></i>${p.price}</div>`;
            ft.innerHTML += `
                <button class="powerup-btn" onclick="GameEngine.usePowerUp('${p.id}')">
                    <div class="powerup-icon">${p.icon}</div>
                    ${costHtml}
                </button>
            `;
        });
    },
    
    renderShop() {
        let sl = $('shop-list'); sl.innerHTML = '';
        Object.values(CONFIG.POWERUPS).forEach(p => {
            sl.innerHTML += `
                <div class="shop-item">
                    <div class="shop-item-info">
                        <div class="shop-item-icon">${p.icon}</div>
                        <div><div class="shop-item-name">${p.name}</div><div class="text-muted">Own: ${StorageManager.data.items[p.id]}</div></div>
                    </div>
                    <button class="btn btn-primary btn-buy" onclick="UI.buyItem('${p.id}')"><i class="fas fa-coins text-gold"></i> ${p.price}</button>
                </div>
            `;
        });
    },
    buyItem(id) {
        let p = CONFIG.POWERUPS[id];
        if(StorageManager.data.coins >= p.price) {
            StorageManager.data.coins -= p.price; StorageManager.data.items[id]++;
            StorageManager.save(); this.updateMenuData(); this.renderShop(); AudioSys.click(); this.toast(`Bought ${p.name}!`);
        } else { this.toast("Not enough coins!"); AudioSys.error(); }
    },
    
    selectTile(r, c, hint=false) {
        let cell = $(`cell-${r}-${c}`);
        if(cell && cell.firstChild) cell.firstChild.classList.add(hint ? 'hinted' : 'selected');
    },
    deselectAll() { document.querySelectorAll('.tile.selected, .tile.hinted').forEach(t => { t.classList.remove('selected', 'hinted'); }); },
    removeTileDOM(p) { let cell = $(`cell-${p.r}-${p.c}`); if(cell) { this.spawnParticles(cell); cell.innerHTML = ''; } },
    
    drawPath(path) {
        let svg = $('path-layer'); svg.innerHTML = '';
        let polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        let points = path.map(p => {
            let c = $(`cell-${p.r}-${p.c}`);
            return `${c.offsetLeft + c.offsetWidth/2},${c.offsetTop + c.offsetHeight/2}`;
        }).join(" ");
        polyline.setAttribute("points", points);
        polyline.setAttribute("fill", "none"); polyline.setAttribute("stroke", "var(--accent)");
        polyline.setAttribute("stroke-width", "6"); polyline.setAttribute("stroke-linecap", "round"); polyline.setAttribute("stroke-linejoin", "round");
        svg.appendChild(polyline);
        setTimeout(() => { polyline.style.transition = "opacity 0.2s"; polyline.style.opacity = "0"; setTimeout(()=>svg.innerHTML='', 200); }, 200);
    },
    
    toast(msg) {
        let t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
        $('toast-container').appendChild(t); setTimeout(() => t.remove(), 2000);
    },
    
    spawnParticles(cell) {
        let rect = cell.getBoundingClientRect();
        let bx = rect.left + rect.width/2, by = rect.top + rect.height/2;
        let cColors = ['#ff4757', '#2ed573', '#ffa502', '#5352ed'];
        for(let i=0; i<8; i++) {
            let p = document.createElement('div'); p.className = 'particle';
            p.style.left = bx + 'px'; p.style.top = by + 'px';
            p.style.width = p.style.height = Utils.randomInt(6, 12) + 'px';
            p.style.backgroundColor = cColors[Utils.randomInt(0, 3)];
            p.style.setProperty('--dx', Utils.randomInt(-80, 80) + 'px');
            p.style.setProperty('--dy', Utils.randomInt(-80, 80) + 'px');
            document.body.appendChild(p); setTimeout(() => p.remove(), 600);
        }
    },
    
    showFloatingText(r, c, text) {
        let cell = $(`cell-${r}-${c}`); if(!cell) return;
        let rect = cell.getBoundingClientRect();
        let el = document.createElement('div'); el.className = 'floating-text'; el.innerText = text;
        el.style.left = (rect.left) + 'px'; el.style.top = (rect.top) + 'px';
        document.body.appendChild(el); setTimeout(() => el.remove(), 1000);
    },

    toggleTheme() {
        let t = StorageManager.data.theme === 'dark' ? 'light' : 'dark';
        StorageManager.data.theme = t; document.documentElement.setAttribute('data-theme', t);
        StorageManager.save();
    },
    
    initLeaderboard() {
        let lb = $('leaderboard-list'); lb.innerHTML = '';
        let names = ["ShadowNinja", "OnetKing", "PikaPro", "MatchMaster", "You"];
        names.forEach((n, i) => {
            let pts = 10000 - i*1500; if(n==="You") pts = StorageManager.data.xp;
            lb.innerHTML += `<div class="list-item"><div><strong>#${i+1}</strong> ${n}</div><div class="text-gold">${pts} XP</div></div>`;
        });
    }
};

// ==========================================
// 7. SIMULATED ADS & MONETIZATION
// ==========================================
const AdsManager = {
    watchAdForCoins() { UI.toast("Playing Ad..."); setTimeout(() => { StorageManager.addCoins(200); UI.toast("Rewarded +200 Coins!"); }, 1500); },
    watchAdForTime() { UI.toast("Playing Ad..."); setTimeout(() => { UI.hideModal(); GameEngine.state.playing = true; GameEngine.state.time += 15; GameEngine.timerId = setInterval(()=>GameEngine.tick(), 1000); UI.toast("Time Extended!"); }, 1500); },
    watchAdForMultiplier() { UI.toast("Playing Ad..."); setTimeout(() => { let ex = parseInt($('vic-coins').innerText); StorageManager.addCoins(ex); $('vic-coins').innerText = ex*2; UI.toast("Coins Doubled!"); }, 1500); }
};

// ==========================================
// BOOTSTRAP
// ==========================================
window.onload = () => {
    StorageManager.load();
    UI.updateMenuData();
    UI.renderShop();
    UI.initLeaderboard();
};
