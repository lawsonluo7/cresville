// Economy and game state management
class GameState {
    constructor() {
        this.money = 500;
        this.food = 50;
        this.wood = 100;
        this.population = 0;
        this.employed = 0;
        this.incomeTaxRate = 0.1; // 10%
        this.time = 0; // in seconds
        this.messages = [];
    }

    addMessage(text, type = 'info') {
        this.messages.push({ text, type, time: this.time });
        if (this.messages.length > 10) {
            this.messages.shift();
        }
    }

    toJSON() {
        return {
            money: this.money,
            food: this.food,
            wood: this.wood,
            population: this.population,
            employed: this.employed,
            incomeTaxRate: this.incomeTaxRate,
            time: this.time
        };
    }

    static fromJSON(data) {
        const state = new GameState();
        Object.assign(state, data);
        return state;
    }
}

// Economy simulation
class Economy {
    constructor(gameState, world) {
        this.gameState = gameState;
        this.world = world;
        this.structures = new Map(); // key: "x,y", value: structure object
    }

    buildStructure(tile, structureType) {
        const costs = this.getStructureCost(structureType);
        
        // Check resources
        if (this.gameState.money < costs.money) {
            return { success: false, reason: 'Not enough money' };
        }
        if (this.gameState.wood < costs.wood) {
            return { success: false, reason: 'Not enough wood' };
        }
        if (this.gameState.food < costs.food) {
            return { success: false, reason: 'Not enough food' };
        }

        // Check if can build
        const buildCheck = this.world.canBuildStructure(tile, structureType);
        if (!buildCheck.canBuild) {
            return { success: false, reason: buildCheck.reason };
        }

        // Check if tile is empty
        if (tile.structure) {
            return { success: false, reason: 'Tile already occupied' };
        }

        // Deduct costs
        this.gameState.money -= costs.money;
        this.gameState.wood -= costs.wood;
        this.gameState.food -= costs.food;

        // Build structure
        const structure = {
            type: structureType,
            x: tile.x,
            y: tile.y,
            level: 1,
            data: this.getDefaultStructureData(structureType)
        };

        tile.structure = structure;
        this.structures.set(`${tile.x},${tile.y}`, structure);

        this.gameState.addMessage(`Built ${structureType} at (${tile.x}, ${tile.y})`, 'success');
        return { success: true, structure };
    }

    getStructureCost(structureType) {
        const costs = {
            house: { money: 100, wood: 50, food: 0 },
            farm: { money: 80, wood: 30, food: 10 },
            mine: { money: 120, wood: 60, food: 0 },
            lumber: { money: 50, wood: 20, food: 0 }
        };
        return costs[structureType] || { money: 0, wood: 0, food: 0 };
    }

    getDefaultStructureData(structureType) {
        const data = {
            house: { residents: 0, capacity: 5 },
            farm: { production: 0, foodPerTick: 0.5 },
            mine: { resourceLevel: 'stone', extractedStone: 0 },
            lumber: { woodPerTick: 0.5 }
        };
        return data[structureType] || {};
    }

    tick() {
        // Calculate income from farms
        let farmIncome = 0;
        let farmCount = 0;

        for (let structure of this.structures.values()) {
            if (structure.type === 'farm') {
                const income = 10;
                const tax = income * this.gameState.incomeTaxRate;
                const netIncome = income - tax;
                
                // Farm goes bankrupt if income < 0 after tax
                if (netIncome <= 0) {
                    this.destroyStructure(structure.x, structure.y);
                    this.gameState.addMessage('Farm went bankrupt due to high taxes', 'error');
                    continue;
                }

                farmIncome += netIncome;
                farmCount++;
                
                // Produce food
                structure.data.foodPerTick = 1 + (0.5 * (structure.level - 1));
            }
        }

        this.gameState.money += farmIncome;

        // Consume food
        const foodConsumption = this.gameState.population * 0.5;
        this.gameState.food -= foodConsumption;

        // If not enough food, population leaves
        if (this.gameState.food < 0) {
            const leavers = Math.ceil(-this.gameState.food / 5);
            this.gameState.population -= Math.min(leavers, this.gameState.population);
            this.gameState.food = 0;
            if (leavers > 0) {
                this.gameState.addMessage(`${leavers} people left due to hunger`, 'warning');
            }
        }

        // Houses produce food and accept population
        let totalHouseCapacity = 0;
        for (let structure of this.structures.values()) {
            if (structure.type === 'house') {
                totalHouseCapacity += structure.data.capacity;
            }
        }

        // Population can grow if there are empty houses and food
        const unemployed = this.gameState.population - this.gameState.employed;
        if (this.gameState.population < totalHouseCapacity && this.gameState.food > 50) {
            const newPeople = Math.min(2, totalHouseCapacity - this.gameState.population);
            this.gameState.population += newPeople;
        }

        // Generate wood from lumber structures
        const lumberStructures = Array.from(this.structures.values()).filter(s => s.type === 'lumber');
        for (let lumber of lumberStructures) {
            // Find forests within 8 blocks
            let forestCount = 0;
            for (let dx = -8; dx <= 8; dx++) {
                for (let dy = -8; dy <= 8; dy++) {
                    const tile = this.world.getTile(lumber.x + dx, lumber.y + dy);
                    if (tile.isForest && tile.forestHealth > 0) {
                        forestCount++;
                    }
                }
            }

            if (forestCount > 0) {
                const woodPerTick = 0.5 * lumber.level;
                this.gameState.wood += woodPerTick;

                // Damage nearby forests
                for (let dx = -8; dx <= 8; dx++) {
                    for (let dy = -8; dy <= 8; dy++) {
                        const tile = this.world.getTile(lumber.x + dx, lumber.y + dy);
                        if (tile.isForest && tile.forestHealth > 0) {
                            tile.forestHealth -= 0.1;
                            if (tile.forestHealth <= 0) {
                                tile.isForest = false;
                                break; // Move to next forest
                            }
                        }
                    }
                }
            }
        }

        // Generate resources from mines
        for (let structure of this.structures.values()) {
            if (structure.type === 'mine') {
                this.tickMine(structure);
            }
        }
    }

    tickMine(mine) {
        // Find resources within 4 blocks
        let resourcesAvailable = { stone: 0, iron: 0, uranium: 0 };
        
        for (let dx = -4; dx <= 4; dx++) {
            for (let dy = -4; dy <= 4; dy++) {
                const tile = this.world.getTile(mine.x + dx, mine.y + dy);
                resourcesAvailable.stone += tile.resources.stone;
                resourcesAvailable.iron += tile.resources.iron;
                resourcesAvailable.uranium += tile.resources.uranium;
            }
        }

        // Mine resources based on level
        if (mine.data.resourceLevel === 'stone' && resourcesAvailable.stone > 0) {
            const mined = Math.min(1, resourcesAvailable.stone);
            this.gameState.wood += mined * 0.5; // Convert stone to resources
            mine.data.extractedStone += mined;

            // Upgrade to iron if enough extracted
            if (mine.data.extractedStone >= 100) {
                mine.data.resourceLevel = 'iron';
                mine.data.extractedStone = 0;
                this.gameState.addMessage('Mine upgraded to iron extraction', 'success');
            }
        } else if (mine.data.resourceLevel === 'iron' && resourcesAvailable.iron > 0) {
            const mined = Math.min(0.5, resourcesAvailable.iron);
            this.gameState.wood += mined * 1.0;
            mine.data.extractedStone += mined;

            if (mine.data.extractedStone >= 100) {
                mine.data.resourceLevel = 'uranium';
                mine.data.extractedStone = 0;
                this.gameState.addMessage('Mine upgraded to uranium extraction', 'success');
            }
        } else if (mine.data.resourceLevel === 'uranium' && resourcesAvailable.uranium > 0) {
            const mined = Math.min(0.2, resourcesAvailable.uranium);
            this.gameState.wood += mined * 2.0;
        }
    }

    destroyStructure(x, y) {
        const key = `${x},${y}`;
        const structure = this.structures.get(key);
        if (structure) {
            this.structures.delete(key);
            const tile = this.world.getTile(x, y);
            tile.structure = null;
        }
    }

    getStructureAtTile(tile) {
        return this.structures.get(`${tile.x},${tile.y}`);
    }

    getAllStructures() {
        return Array.from(this.structures.values());
    }

    toJSON() {
        return {
            structures: Array.from(this.structures.values())
        };
    }

    static fromJSON(data, world) {
        const economy = new Economy(new GameState(), world);
        data.structures.forEach(structure => {
            economy.structures.set(`${structure.x},${structure.y}`, structure);
        });
        return economy;
    }
}
