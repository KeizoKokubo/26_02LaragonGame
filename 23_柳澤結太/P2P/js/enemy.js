// js/enemy.js
class Enemy {
    constructor(wave, path, type = 'normal') {
        this.wave = wave;
        this.path = path;
        this.type = type;

        this.currentPathIndex = 0;
        this.x = path[0].x;
        this.y = path[0].y;

        // Wave数に応じたなだらかな難易度曲線（理不尽な急激強化を抑止）
        // 指数関数的な爆発増加ではなく、線形＋緩やかな係数で制御
        const waveScale = 1 + (wave - 1) * 0.22;

        if (type === 'fast') {
            this.name = '疾風ランナー';
            this.maxHp = Math.round(35 * waveScale);
            this.speed = 2.1;
            this.reward = 12 + Math.min(20, Math.floor(wave * 1.5));
            this.scoreValue = 60;
            this.radius = 10;
            this.color = '#3b82a6';
        } else if (type === 'tank') {
            this.name = '重装甲ゴーレム';
            this.maxHp = Math.round(130 * waveScale);
            this.speed = 1.0;
            this.reward = 28 + Math.min(35, Math.floor(wave * 2.5));
            this.scoreValue = 130;
            this.radius = 16;
            this.color = '#b45309';
        } else if (type === 'boss') {
            this.name = 'ボスモンスター';
            this.maxHp = Math.round(380 * waveScale);
            this.speed = 0.85;
            this.reward = 90 + Math.min(100, Math.floor(wave * 5));
            this.scoreValue = 400;
            this.radius = 20;
            this.color = '#c94a44';
        } else {
            // normal
            this.name = '通常スライム';
            this.maxHp = Math.round(55 * waveScale);
            this.speed = 1.4;
            this.reward = 10 + Math.min(18, Math.floor(wave * 1.2));
            this.scoreValue = 45;
            this.radius = 12;
            this.color = '#487c53';
        }

        this.hp = this.maxHp;
        this.dead = false;
        this.reachedEnd = false;
    }

    update() {
        if (this.dead || this.reachedEnd) return;

        if (this.currentPathIndex >= this.path.length - 1) {
            this.reachedEnd = true;
            return;
        }

        const target = this.path[this.currentPathIndex + 1];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= this.speed) {
            this.x = target.x;
            this.y = target.y;
            this.currentPathIndex++;
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    takeDamage(amount, particles) {
        this.hp -= amount;
        if (this.hp <= 0 && !this.dead) {
            this.dead = true;
            this.hp = 0;
            this.spawnDeathParticles(particles);
        }
    }

    spawnDeathParticles(particles) {
        if (!particles) return;
        const count = this.type === 'boss' ? 24 : this.type === 'tank' ? 16 : 10;
        const particleColor = this.type === 'boss' ? '#ef4444' : this.type === 'tank' ? '#d97706' : this.type === 'fast' ? '#60a5fa' : '#86efac';
        for (let i = 0; i < count; i++) {
            particles.push(new Particle(this.x, this.y, particleColor, Math.random() * 3 + 2, 3.5, 25));
        }
    }

    draw(ctx) {
        if (this.dead || this.reachedEnd) return;

        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 瞳
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x - 3, this.y - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(this.x + 3, this.y - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#332c23';
        ctx.beginPath();
        ctx.arc(this.x - 3, this.y - 2, 1.2, 0, Math.PI * 2);
        ctx.arc(this.x + 3, this.y - 2, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // HPバー
        const barW = this.radius * 2 + 6;
        const barH = 4;
        const barX = this.x - barW / 2;
        const barY = this.y - this.radius - 8;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(barX, barY, barW, barH);

        const hpRatio = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = hpRatio > 0.5 ? '#487c53' : hpRatio > 0.2 ? '#d97706' : '#c94a44';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        ctx.restore();
    }
}
