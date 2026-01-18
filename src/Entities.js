export class Player {
    constructor(innerRadius, outerRadius) {
        this.angle = 0;
        this.orbitRadius = innerRadius;
        this.targetRadius = innerRadius;
        this.innerRadius = innerRadius;
        this.outerRadius = outerRadius;
        this.isInner = true;
        this.speed = 0.05; // Radians per frame
        this.radius = 10;
        this.color = '#00f3ff';
        this.trail = [];
    }

    switchOrbit() {
        this.isInner = !this.isInner;
        this.targetRadius = this.isInner ? this.innerRadius : this.outerRadius;
        // Particle burst effect could be triggered here by Game
    }

    update() {
        // Move along orbit
        this.angle += this.speed;

        // Smooth transition between orbits
        const diff = this.targetRadius - this.orbitRadius;
        this.orbitRadius += diff * 0.2; // Easing

        // Update trail
        this.trail.push({
            angle: this.angle,
            radius: this.orbitRadius,
            alpha: 1
        });
        if (this.trail.length > 20) this.trail.shift();

        // Fade trails
        for (let t of this.trail) t.alpha -= 0.05;
    }

    getPos(cx, cy) {
        return {
            x: cx + Math.cos(this.angle) * this.orbitRadius,
            y: cy + Math.sin(this.angle) * this.orbitRadius
        };
    }
}

export class Obstacle {
    constructor(angle, radius, type = 'normal') {
        this.angle = angle;
        this.radius = radius; // Orbit radius
        this.size = 15;
        this.active = true;
        this.type = type; // 'normal' (kills), 'point' (score)
        this.color = type === 'point' ? '#bc13fe' : '#ff0055';
    }

    update(playerSpeed) {
        // Obstacles stay static relative to orbit? Or rotate?
        // Let's make them rotate slightly slower than player or static
        // For "Orbit Switch" usually obstacles are static or moving slowly
        // Let's make them static relative to the world for now, but since player moves forever, 
        // effectively they are just fixed at an angle.
        // Actually, infinite runner style:
        // We will rotate the entire world or just spawn obstacles ahead.
        // Let's spawn them ahead of player angle.
    }

    getPos(cx, cy) {
        return {
            x: cx + Math.cos(this.angle) * this.radius,
            y: cy + Math.sin(this.angle) * this.radius
        };
    }

    checkCollision(player, cx, cy) {
        const pPos = player.getPos(cx, cy);
        const oPos = this.getPos(cx, cy);
        const dx = pPos.x - oPos.x;
        const dy = pPos.y - oPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (player.radius + this.size);
    }
}

export class Particle {
    constructor(x, y, color, speed) {
        this.x = x;
        this.y = y;
        this.color = color;
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * speed;
        this.vx = Math.cos(a) * s;
        this.vy = Math.sin(a) * s;
        this.life = 1.0;
        this.decay = 0.02 + Math.random() * 0.03;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
}
