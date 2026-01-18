import { Renderer } from './Renderer.js';
import { Player, Obstacle, Particle } from './Entities.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderer = new Renderer(canvas, this.ctx);

        // Game Constants
        this.INNER_RADIUS = 100;
        this.OUTER_RADIUS = 180;

        // State
        this.state = 'MENU'; // MENU, PLAYING, GAMEOVER
        this.score = 0;
        this.bestScore = localStorage.getItem('lumina_best') || 0;
        this.lastTime = 0;

        // Entities
        this.player = null;
        this.obstacles = [];
        this.particles = [];
        this.spawnTimer = 0;

        // Screen Shake
        this.shake = 0;

        // Binding
        this.loop = this.loop.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }

    init() {
        // Setup Event Listeners
        window.addEventListener('resize', () => {
            this.renderer.resize(window.innerWidth, window.innerHeight);
        });

        // Combined input handler for Mouse and Touch
        const inputAction = (e) => {
            // Prevent default touch actions (scrolling)
            if (e.type === 'touchstart') e.preventDefault();
            this.handleInput();
        };

        this.canvas.addEventListener('mousedown', inputAction);
        this.canvas.addEventListener('touchstart', inputAction, { passive: false });
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') this.handleInput();
        });

        // UI Buttons
        document.getElementById('start-btn').addEventListener('click', () => {
            document.getElementById('start-screen').classList.add('hidden');
            this.start();
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            document.getElementById('game-over-screen').classList.add('hidden');
            this.start();
        });

        document.getElementById('best-score').innerText = this.bestScore;

        // Start Loop
        requestAnimationFrame(this.loop);
    }

    start() {
        this.state = 'PLAYING';
        this.score = 0;
        this.updateScoreUI();

        // Calculate radii based on screen size (responsive)
        const minDim = Math.min(this.canvas.width, this.canvas.height);
        this.INNER_RADIUS = minDim * 0.15;
        this.OUTER_RADIUS = minDim * 0.25;

        this.player = new Player(this.INNER_RADIUS, this.OUTER_RADIUS);
        this.obstacles = [];
        this.particles = [];
        this.spawnTimer = 0;

        document.getElementById('score-container').classList.remove('hidden');
    }

    handleInput() {
        if (this.state === 'PLAYING') {
            this.player.switchOrbit();
            // Optional: Add sound or slight shake on switch
            this.spawnParticles(this.player.getPos(this.renderer.cx, this.renderer.cy), 5, '#ffffff');
        } else if (this.state === 'GAMEOVER') {
            // Optional: fast restart on tap?
        }
    }

    spawnParticles(pos, count, color) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(pos.x, pos.y, color, 5));
        }
    }

    gameOver() {
        this.state = 'GAMEOVER';
        this.shake = 20;
        document.getElementById('score-container').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').innerText = this.score;

        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('lumina_best', this.bestScore);
        }
        document.getElementById('best-score').innerText = this.bestScore;

        // Explosion
        const pos = this.player.getPos(this.renderer.cx, this.renderer.cy);
        this.spawnParticles(pos, 50, this.player.color);
    }

    update(dt) {
        if (this.shake > 0) this.shake *= 0.9;

        if (this.player) {
            this.player.update();
            this.player.innerRadius = this.INNER_RADIUS;
            this.player.outerRadius = this.OUTER_RADIUS;

            // Spawning Logic
            this.spawnTimer++;
            // Spawn rate increases with score
            const spawnRate = Math.max(20, 60 - Math.floor(this.score / 5));

            if (this.spawnTimer > spawnRate) {
                this.spawnTimer = 0;
                // Randomly choose inner or outer
                const isInner = Math.random() > 0.5;
                const radius = isInner ? this.INNER_RADIUS : this.OUTER_RADIUS;
                // Spawn ahead of player
                const spawnAngle = this.player.angle + Math.PI;
                this.obstacles.push(new Obstacle(spawnAngle, radius, 'normal'));

                // Add points occasionally
                if (Math.random() > 0.7) {
                    const otherRadius = isInner ? this.OUTER_RADIUS : this.INNER_RADIUS;
                    this.obstacles.push(new Obstacle(spawnAngle + 0.5, otherRadius, 'point'));
                }
            }
        }

        // Update Obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            let obs = this.obstacles[i];
            // Since player moves in circles, technically obstacles just sit there? 
            // NO, typically in Orbit games, obstacles move towards player or player moves towards them.
            // Here Player.angle increases. Obstacles are at fixed angles.
            // We need to remove obstacles that are "behind" the player significantly or too far ahead?
            // Actually simpler: Removing them after they complete a full circle relative to player?
            // Let's just remove them if they are too far behind angle-wise.

            const angleDiff = obs.angle - this.player.angle;
            // If angleDiff is very negative (player passed it), remove.
            // Handle wrap around? 
            // Player angle keeps increasing. Obstacle angle is fixed.
            // So if (obs.angle < player.angle - Math.PI) remove it.

            if (obs.angle < this.player.angle - Math.PI) {
                this.obstacles.splice(i, 1);
                // Points passed without collection are just lost
                // Obstacles passed give score?
                if (obs.type === 'normal') {
                    this.score++;
                    this.updateScoreUI();
                }
                continue;
            }

            // check collision
            if (obs.checkCollision(this.player, this.renderer.cx, this.renderer.cy)) {
                if (obs.type === 'normal') {
                    this.gameOver();
                } else if (obs.type === 'point') {
                    this.score += 5;
                    this.updateScoreUI();
                    this.spawnParticles(obs.getPos(this.renderer.cx, this.renderer.cy), 10, obs.color);
                    this.obstacles.splice(i, 1);
                }
            }
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.update();
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    updateScoreUI() {
        document.getElementById('score-value').innerText = this.score;
    }

    loop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (this.state === 'PLAYING') {
            this.update(dt);
        } else if (this.state === 'GAMEOVER') {
            // Still accept update of particles?
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.update();
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }

        // Draw
        this.ctx.save();
        if (this.shake > 0.5) {
            const dx = (Math.random() - 0.5) * this.shake;
            const dy = (Math.random() - 0.5) * this.shake;
            this.ctx.translate(dx, dy);
        }

        this.renderer.clear();
        this.renderer.drawRings(this.INNER_RADIUS, this.OUTER_RADIUS);

        if (this.player && this.state !== 'GAMEOVER') { // Hide player on death
            this.renderer.drawPlayer(this.player);
        }

        this.renderer.drawObstacles(this.obstacles);
        this.renderer.drawParticles(this.particles);

        this.ctx.restore();

        requestAnimationFrame(this.loop);
    }
}
