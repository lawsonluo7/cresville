// Main Game Controller
class Game {
    constructor() {
        this.world = null;
        this.gameState = null;
        this.economy = null;
        this.ui = null;
        this.statsPanel = null;
        this.actionsPanel = null;
        this.canvas = document.getElementById('gameCanvas');
        this.gameRunning = false;
        this.tickInterval = null;
    }

    init() {
        // Load or create world
        const seed = parseInt(localStorage.getItem('currentSeed'));
        this.world = new World(seed);

        // Create game state
        this.gameState = new GameState();

        // Create economy
        this.economy = new Economy(this.gameState, this.world);

        // Create UI
        this.ui = new GameUI(this.canvas, this.gameState, this.world, this.economy);
        this.statsPanel = new StatsPanel(this.gameState, this.economy);
        this.actionsPanel = new ActionsPanel(this.gameState, this.world, this.economy, this.ui);

        // Load save if exists
        const saveData = localStorage.getItem('gameSave_' + seed);
        if (saveData) {
            this.loadGame(JSON.parse(saveData));
        }

        // Start game loop
        this.gameRunning = true;
        this.tickInterval = setInterval(() => this.tick(), 1000);

        // Initial render
        this.render();
        this.updateUI();
    }

    tick() {
        if (!this.gameRunning) return;

        this.gameState.time++;

        // Run economy simulation
        this.economy.tick();

        // Auto-save every 30 seconds
        if (this.gameState.time % 30 === 0) {
            this.saveGame();
        }

        // Update UI
        this.updateUI();
        this.render();
    }

    render() {
        this.ui.render();
    }

    updateUI() {
        // Update time display
        document.getElementById('timeDisplay').textContent = this.formatTime(this.gameState.time);

        // Update panels
        this.statsPanel.render();
        this.actionsPanel.render();
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    saveGame() {
        const seed = parseInt(localStorage.getItem('currentSeed'));
        const saveData = {
            seed: seed,
            gameState: this.gameState.toJSON(),
            world: this.world.toJSON(),
            economy: this.economy.toJSON(),
            time: this.gameState.time
        };
        localStorage.setItem('gameSave_' + seed, JSON.stringify(saveData));

        // Also update save list
        let saves = JSON.parse(localStorage.getItem('saves') || '[]');
        const existingIndex = saves.findIndex(s => s.seed === seed);
        
        const saveEntry = {
            seed: seed,
            name: `Save ${new Date().toLocaleTimeString()}`,
            time: this.gameState.time
        };

        if (existingIndex >= 0) {
            saves[existingIndex] = saveEntry;
        } else {
            saves.push(saveEntry);
        }
        localStorage.setItem('saves', JSON.stringify(saves));
    }

    loadGame(saveData) {
        // Restore world
        this.world = World.fromJSON(saveData.world);

        // Restore game state
        this.gameState = GameState.fromJSON(saveData.gameState);

        // Restore economy
        this.economy = Economy.fromJSON(saveData.economy, this.world);
        this.economy.gameState = this.gameState;

        this.gameState.addMessage('Game loaded', 'success');
    }

    stop() {
        this.gameRunning = false;
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
        }
        this.saveGame();
    }
}

// Global game instance
let game = null;

function backToMenu() {
    if (game) {
        game.stop();
    }
    window.location.href = 'index.html';
}

// Initialize game when page loads
window.addEventListener('load', () => {
    game = new Game();
    game.init();

    // Render loop
    function gameLoop() {
        if (game && game.gameRunning) {
            game.render();
            game.updateUI();
        }
        requestAnimationFrame(gameLoop);
    }
    gameLoop();

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (game) {
            game.stop();
        }
    });
});
