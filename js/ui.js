// UI Management
class GameUI {
    constructor(canvas, gameState, world, economy) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.world = world;
        this.economy = economy;

        this.cameraX = 0;
        this.cameraY = 0;
        this.gridSize = 9;
        this.tileSize = 32;

        this.setupKeyListeners();
    }

    setupKeyListeners() {
        window.addEventListener('keydown', (e) => {
            switch (e.key.toLowerCase()) {
                case 'arrowup':
                    this.cameraY--;
                    break;
                case 'arrowdown':
                    this.cameraY++;
                    break;
                case 'arrowleft':
                    this.cameraX--;
                    break;
                case 'arrowright':
                    this.cameraX++;
                    break;
            }
        });
    }

    render() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const tiles = this.world.getTiles(this.cameraX, this.cameraY, this.gridSize);
        const halfGrid = Math.floor(this.gridSize / 2);

        let index = 0;
        for (let dy = -halfGrid; dy <= halfGrid; dy++) {
            for (let dx = -halfGrid; dx <= halfGrid; dx++) {
                const tile = tiles[index];
                const screenX = (dx + halfGrid) * this.tileSize;
                const screenY = (dy + halfGrid) * this.tileSize;

                this.drawTile(tile, screenX, screenY);
                index++;
            }
        }

        // Highlight center tile
        const centerScreenX = halfGrid * this.tileSize;
        const centerScreenY = halfGrid * this.tileSize;
        this.ctx.strokeStyle = '#ff9900';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(centerScreenX, centerScreenY, this.tileSize, this.tileSize);
    }

    drawTile(tile, screenX, screenY) {
        // Draw ground based on altitude
        const color = this.getAltitudeColor(tile.altitude);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);

        // Draw water indicator if underwater
        if (tile.altitude < 0) {
            this.ctx.fillStyle = `rgba(50, 100, 200, ${0.3 + Math.abs(tile.altitude) * 0.05})`;
            this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
        }

        // Draw forest
        if (tile.isForest) {
            this.ctx.fillStyle = '#228B22';
            this.ctx.fillRect(screenX + 4, screenY + 4, this.tileSize - 8, this.tileSize - 8);
            this.ctx.fillStyle = '#32CD32';
            this.ctx.beginPath();
            this.ctx.arc(screenX + this.tileSize / 2, screenY + this.tileSize / 2, this.tileSize / 3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw structure
        if (tile.structure) {
            this.drawStructure(tile.structure, screenX, screenY);
        }

        // Draw grid
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(screenX, screenY, this.tileSize, this.tileSize);
    }

    drawStructure(structure, screenX, screenY) {
        const colors = {
            house: '#FF6B6B',
            farm: '#FFD93D',
            mine: '#8B4513',
            lumber: '#D4A574'
        };

        const color = colors[structure.type] || '#999';
        this.ctx.fillStyle = color;
        this.ctx.fillRect(screenX + 6, screenY + 6, this.tileSize - 12, this.tileSize - 12);

        // Draw structure level indicator
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px Arial';
        this.ctx.fillText(structure.level, screenX + 10, screenY + 18);
    }

    getAltitudeColor(altitude) {
        if (altitude < -5) return '#1a3a52'; // Deep water
        if (altitude < 0) return '#3a5a7a'; // Water
        if (altitude < 5) return '#90EE90'; // Low grass
        if (altitude < 10) return '#7CB342'; // Mid grass
        if (altitude < 15) return '#A1887F'; // Hill
        if (altitude < 20) return '#8B8B83'; // Rocky
        return '#C0C0C0'; // Snow
    }

    getSelectedTile() {
        return this.world.getSelectedTile(this.cameraX, this.cameraY);
    }

    getCameraX() {
        return this.cameraX;
    }

    getCameraY() {
        return this.cameraY;
    }
}

// Stats Panel UI
class StatsPanel {
    constructor(gameState, economy) {
        this.gameState = gameState;
        this.economy = economy;
    }

    render() {
        const panel = document.getElementById('statsPanel');
        panel.innerHTML = '';

        // Economy Stats
        this.addStat(panel, 'Money', `$${Math.floor(this.gameState.money)}`, '#4a9eff');
        this.addStat(panel, 'Wood', Math.floor(this.gameState.wood), '#D4A574');
        this.addStat(panel, 'Food', Math.floor(this.gameState.food), '#FFD93D');
        
        // Population Stats
        panel.innerHTML += '<div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #4a9eff;"></div>';
        this.addStat(panel, 'Population', this.gameState.population, '#FF6B6B');
        this.addStat(panel, 'Employed', this.gameState.employed, '#90EE90');
        this.addStat(panel, 'Unemployed', this.gameState.population - this.gameState.employed, '#FF9999');

        // Economy Controls
        panel.innerHTML += '<div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #4a9eff;"><div class="panel-title" style="margin-bottom: 15px; margin-top: 0;">ECONOMY</div></div>';
        
        const sliderGroup = document.createElement('div');
        sliderGroup.className = 'slider-group';
        
        const label = document.createElement('div');
        label.className = 'slider-label';
        label.innerHTML = `<span>Income Tax</span><span>${Math.floor(this.gameState.incomeTaxRate * 100)}%</span>`;
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = this.gameState.incomeTaxRate * 100;
        slider.oninput = (e) => {
            this.gameState.incomeTaxRate = parseInt(e.target.value) / 100;
            label.innerHTML = `<span>Income Tax</span><span>${e.target.value}%</span>`;
        };
        
        sliderGroup.appendChild(label);
        sliderGroup.appendChild(slider);
        panel.appendChild(sliderGroup);

        // Warnings
        if (this.gameState.food < 20) {
            panel.innerHTML += '<div class="warning">⚠ Food running low!</div>';
        }
        if (this.gameState.money < 50) {
            panel.innerHTML += '<div class="warning">⚠ Money running low!</div>';
        }
        if (this.gameState.population - this.gameState.employed > 10) {
            panel.innerHTML += '<div class="warning">⚠ High unemployment!</div>';
        }
    }

    addStat(panel, label, value, color) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
            <span class="stat-label">${label}</span>
            <span class="stat-value" style="color: ${color}">${value}</span>
        `;
        panel.appendChild(row);
    }
}

// Actions Panel UI
class ActionsPanel {
    constructor(gameState, world, economy, ui) {
        this.gameState = gameState;
        this.world = world;
        this.economy = economy;
        this.ui = ui;
    }

    render() {
        const panel = document.getElementById('actionsList');
        panel.innerHTML = '';

        const selectedTile = this.ui.getSelectedTile();
        
        // Show selected tile info
        const tileInfo = document.createElement('div');
        tileInfo.className = 'selected-tile-info';
        tileInfo.innerHTML = `
            <div class="tile-label">Selected: (${selectedTile.x}, ${selectedTile.y})</div>
            <div>Altitude: ${selectedTile.altitude}</div>
            <div>Stone: ${Math.floor(selectedTile.resources.stone)}</div>
            <div>Iron: ${Math.floor(selectedTile.resources.iron)}</div>
            <div>Uranium: ${Math.floor(selectedTile.resources.uranium)}</div>
            ${selectedTile.structure ? `<div style="color: #4a9eff;">Has: ${selectedTile.structure.type}</div>` : '<div style="color: #666;">Empty</div>'}
        `;
        panel.appendChild(tileInfo);

        // Building actions
        const structures = [
            { name: 'House', type: 'house', cost: { money: 100, wood: 50, food: 0 } },
            { name: 'Farm', type: 'farm', cost: { money: 80, wood: 30, food: 10 } },
            { name: 'Mine', type: 'mine', cost: { money: 120, wood: 60, food: 0 } },
            { name: 'Lumber', type: 'lumber', cost: { money: 50, wood: 20, food: 0 } }
        ];

        structures.forEach(struct => {
            const button = document.createElement('button');
            button.className = 'action-button';
            
            const canAfford = 
                this.gameState.money >= struct.cost.money &&
                this.gameState.wood >= struct.cost.wood &&
                this.gameState.food >= struct.cost.food &&
                !selectedTile.structure &&
                this.world.canBuildStructure(selectedTile, struct.type).canBuild;

            if (!canAfford) {
                button.classList.add('disabled');
            }

            button.innerHTML = `${struct.name}
                <div class="cost-info">$${struct.cost.money} | 🪵${struct.cost.wood} | 🍎${struct.cost.food}</div>
            `;

            button.onclick = () => {
                if (canAfford) {
                    const result = this.economy.buildStructure(selectedTile, struct.type);
                    if (result.success) {
                        this.render();
                    } else {
                        this.gameState.addMessage(result.reason, 'error');
                    }
                }
            };

            panel.appendChild(button);
        });

        // Demolish button
        if (selectedTile.structure) {
            const demolishBtn = document.createElement('button');
            demolishBtn.className = 'action-button';
            demolishBtn.style.marginTop = '15px';
            demolishBtn.style.borderColor = '#ff6666';
            demolishBtn.style.color = '#ff6666';
            demolishBtn.textContent = 'Demolish';
            demolishBtn.onclick = () => {
                this.economy.destroyStructure(selectedTile.x, selectedTile.y);
                this.render();
            };
            panel.appendChild(demolishBtn);
        }
    }
}
