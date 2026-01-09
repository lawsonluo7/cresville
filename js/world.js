// Seeded random number generator (Mulberry32)
class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }

    next() {
        this.seed |= 0;
        this.seed = (this.seed + 0x6d2b79f5) | 0;
        let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// Perlin-like noise generator
class PerlinNoise {
    constructor(seed) {
        this.rng = new SeededRandom(seed);
        this.permutation = this.generatePermutation();
    }

    generatePermutation() {
        const p = Array.from({ length: 256 }, (_, i) => i);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.rng.next() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        return [...p, ...p];
    }

    noise(x, y) {
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        const u = this.fade(xf);
        const v = this.fade(yf);

        const p = this.permutation;
        const aa = p[p[xi] + yi];
        const ab = p[p[xi] + yi + 1];
        const ba = p[p[xi + 1] + yi];
        const bb = p[p[xi + 1] + yi + 1];

        const x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
        const x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
        return this.lerp(x1, x2, v);
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 8 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}

// World tile data structure
class Tile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.altitude = 0;
        this.resources = {
            stone: 0,
            iron: 0,
            uranium: 0
        };
        this.structure = null; // { type, data }
        this.isForest = false;
        this.forestHealth = 0; // 0-100, regenerates after cutting
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            altitude: this.altitude,
            resources: { ...this.resources },
            structure: this.structure,
            isForest: this.isForest,
            forestHealth: this.forestHealth
        };
    }

    static fromJSON(data) {
        const tile = new Tile(data.x, data.y);
        tile.altitude = data.altitude;
        tile.resources = { ...data.resources };
        tile.structure = data.structure;
        tile.isForest = data.isForest;
        tile.forestHealth = data.forestHealth;
        return tile;
    }
}

// World generation and management
class World {
    constructor(seed) {
        this.seed = seed;
        this.tiles = new Map();
        this.perlin = new PerlinNoise(seed);
        this.rng = new SeededRandom(seed);
        this.chunkSize = 16;
        this.generatedChunks = new Set();
    }

    getTile(x, y) {
        const key = `${x},${y}`;
        if (!this.tiles.has(key)) {
            this.generateTile(x, y);
        }
        return this.tiles.get(key);
    }

    generateTile(x, y) {
        const tile = new Tile(x, y);
        const key = `${x},${y}`;

        // Generate altitude using Perlin noise
        const noiseScale = 0.1;
        const altitude = this.perlin.noise(x * noiseScale, y * noiseScale) * 30 - 10;
        tile.altitude = Math.round(altitude);

        // Generate resources based on altitude
        this.generateResources(tile);

        // Generate forests in patches
        this.generateForest(tile);

        this.tiles.set(key, tile);
        return tile;
    }

    generateResources(tile) {
        const rng = new SeededRandom(this.seed + tile.x * 73856093 ^ tile.y * 19349663);

        // Stone is everywhere
        tile.resources.stone = rng.nextInt(50, 150);

        // Iron appears at certain altitudes
        if (Math.abs(tile.altitude) < 5) {
            tile.resources.iron = rng.nextInt(20, 80);
        } else if (Math.abs(tile.altitude) < 10) {
            tile.resources.iron = rng.nextInt(5, 30);
        }

        // Uranium is rare
        if (Math.abs(tile.altitude) < 3) {
            tile.resources.uranium = rng.nextInt(1, 10);
        } else if (Math.abs(tile.altitude) < 8) {
            tile.resources.uranium = rng.nextInt(0, 5);
        }
    }

    generateForest(tile) {
        const rng = new SeededRandom(this.seed + tile.x * 83492791 ^ tile.y * 39916801);
        
        // Forests spawn in patches on land (altitude > -3)
        if (tile.altitude > -3) {
            const forestNoise = this.perlin.noise(tile.x * 0.05, tile.y * 0.05);
            if (forestNoise > 0.3 && rng.next() > 0.6) {
                tile.isForest = true;
                tile.forestHealth = rng.nextInt(70, 100);
            }
        }
    }

    getTiles(centerX, centerY, gridSize = 9) {
        const tiles = [];
        const halfGrid = Math.floor(gridSize / 2);
        
        for (let dy = -halfGrid; dy <= halfGrid; dy++) {
            for (let dx = -halfGrid; dx <= halfGrid; dx++) {
                const x = centerX + dx;
                const y = centerY + dy;
                tiles.push(this.getTile(x, y));
            }
        }
        return tiles;
    }

    getSelectedTile(centerX, centerY) {
        return this.getTile(centerX, centerY);
    }

    canBuildStructure(tile, structureType) {
        // Can't build on water
        if (tile.altitude < 0) {
            return { canBuild: false, reason: 'Cannot build on water' };
        }

        // Can't build on forest
        if (tile.isForest) {
            return { canBuild: false, reason: 'Cannot build on forest' };
        }

        // Check altitude constraints
        const neighbors = [
            this.getTile(tile.x - 1, tile.y),
            this.getTile(tile.x + 1, tile.y),
            this.getTile(tile.x, tile.y - 1),
            this.getTile(tile.x, tile.y + 1)
        ];

        const maxAltitudeDiff = this.getMaxAltitudeDiff(structureType);
        for (let neighbor of neighbors) {
            if (Math.abs(neighbor.altitude - tile.altitude) > maxAltitudeDiff) {
                return { canBuild: false, reason: `Terrain too steep for ${structureType}` };
            }
        }

        return { canBuild: true };
    }

    getMaxAltitudeDiff(structureType) {
        const limits = {
            house: 1,
            farm: 1,
            mine: 3,
            lumber: 2
        };
        return limits[structureType] || 1;
    }

    toJSON() {
        const tilesArray = Array.from(this.tiles.values()).map(tile => tile.toJSON());
        return {
            seed: this.seed,
            tiles: tilesArray
        };
    }

    static fromJSON(data) {
        const world = new World(data.seed);
        data.tiles.forEach(tileData => {
            const tile = Tile.fromJSON(tileData);
            world.tiles.set(`${tile.x},${tile.y}`, tile);
        });
        return world;
    }
}
