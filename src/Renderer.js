export class Renderer {
    constructor(canvas, context) {
        this.canvas = canvas;
        this.ctx = context;
        this.width = canvas.width;
        this.height = canvas.height;
        this.cx = this.width / 2;
        this.cy = this.height / 2;
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        this.cx = w / 2;
        this.cy = h / 2;
    }

    clear() {
        // Trail effect
        this.ctx.fillStyle = 'rgba(5, 5, 16, 0.3)';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawRings(innerRadius, outerRadius) {
        this.ctx.save();
        this.ctx.translate(this.cx, this.cy);

        // Inner Ring
        this.ctx.beginPath();
        this.ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Outer Ring
        this.ctx.beginPath();
        this.ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#333';
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawPlayer(player) {
        const pos = player.getPos(this.cx, this.cy);

        // Draw Trail
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = player.radius * 2;

        if (player.trail.length > 1) {
            // Draw segments manually or connect dots
            for (let i = 0; i < player.trail.length; i++) {
                const t = player.trail[i];
                if (t.alpha <= 0) continue;

                const tx = this.cx + Math.cos(t.angle) * t.radius;
                const ty = this.cy + Math.sin(t.angle) * t.radius;

                this.ctx.beginPath();
                this.ctx.fillStyle = player.color;
                this.ctx.globalAlpha = t.alpha * 0.5;
                this.ctx.arc(tx, ty, player.radius * 0.8, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        this.ctx.restore();

        // Glow
        this.ctx.save();
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = player.color;
        this.ctx.fillStyle = player.color;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, player.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Core white center
        this.ctx.fillStyle = '#fff';
        this.ctx.shadowBlur = 5;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, player.radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    drawObstacles(obstacles) {
        this.ctx.save();
        for (let obs of obstacles) {
            const pos = obs.getPos(this.cx, this.cy);
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = obs.color;
            this.ctx.fillStyle = obs.color;

            this.ctx.beginPath();
            if (obs.type === 'normal') {
                // Draw square for spikes/obstacle
                this.ctx.rect(pos.x - obs.size / 2, pos.y - obs.size / 2, obs.size, obs.size);
            } else {
                // Circle for points
                this.ctx.arc(pos.x, pos.y, obs.size / 1.5, 0, Math.PI * 2);
            }
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    drawParticles(particles) {
        this.ctx.save();
        // Additive blending for explosions
        this.ctx.globalCompositeOperation = 'lighter';
        for (let p of particles) {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.restore();
    }
}
