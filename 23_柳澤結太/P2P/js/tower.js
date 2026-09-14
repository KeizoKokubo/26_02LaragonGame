// js/tower.js
class Particle {
    constructor(x, y, color, size = 3, speed = 2, maxLife = 20) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        const angle = Math.random() * Math.PI * 2;
        const s = Math.random() * speed + 0.5;
        this.vx = Math.cos(angle) * s;
        this.vy = Math.sin(angle) * s;
        this.life = 0;
        this.maxLife = maxLife;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life++;
        this.size *= 0.94;
    }

    draw(ctx) {
        const alpha = Math.max(0, 1 - this.life / this.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, target, damage, speed, towerType, stage, isSplash = false, splashRadius = 0) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = speed;
        this.towerType = towerType;
        this.stage = stage;
        this.isSplash = isSplash;
        this.splashRadius = splashRadius;
        this.hit = false;
        this.angle = 0;
    }

    update(enemies, particles) {
        if (this.hit) return;

        if (this.target.dead || this.target.reachedEnd) {
            this.hit = true;
            return;
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        this.angle = Math.atan2(dy, dx);
        const dist = Math.hypot(dx, dy);

        if (dist <= this.speed) {
            this.x = this.target.x;
            this.y = this.target.y;
            this.hit = true;
            this.applyDamage(enemies, particles);
            sound.playHit(this.isSplash);
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    applyDamage(enemies, particles) {
        if (this.isSplash && this.splashRadius > 0) {
            for (let i = 0; i < 10; i++) {
                particles.push(new Particle(this.x, this.y, this.stage === 3 ? '#c94a44' : '#8b5a2b', 4, 3, 20));
            }
            enemies.forEach(enemy => {
                const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                if (dist <= this.splashRadius) {
                    const factor = 1 - (dist / this.splashRadius) * 0.4;
                    enemy.takeDamage(this.damage * factor, particles);
                }
            });
        } else {
            for (let i = 0; i < 4; i++) {
                particles.push(new Particle(this.x, this.y, this.towerType === 'gatling' ? '#487c53' : '#3b82a6', 3, 2, 15));
            }
            this.target.takeDamage(this.damage, particles);
        }
    }

    draw(ctx) {
        if (this.hit) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.towerType === 'gatling') {
            ctx.strokeStyle = this.stage === 3 ? '#166534' : '#487c53';
            ctx.lineWidth = this.stage === 3 ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.lineTo(7, 0);
            ctx.stroke();

            ctx.fillStyle = '#332c23';
            ctx.beginPath();
            ctx.moveTo(7, 0);
            ctx.lineTo(2, -2.5);
            ctx.lineTo(2, 2.5);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = this.stage === 3 ? '#22c55e' : '#86efac';
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.lineTo(-4, -2.5);
            ctx.lineTo(-2, 0);
            ctx.lineTo(-4, 2.5);
            ctx.closePath();
            ctx.fill();
        } else if (this.towerType === 'cannon') {
            ctx.fillStyle = this.stage === 3 ? '#b91c1c' : this.stage === 2 ? '#78350f' : '#8b5a2b';
            ctx.beginPath();
            const r = this.stage === 3 ? 6.5 : this.stage === 2 ? 5.5 : 4.5;
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.arc(1, 1, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const color = this.stage === 3 ? '#7c3aed' : this.stage === 2 ? '#2563eb' : '#3b82a6';
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(2, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class Tower {
    constructor(gridX, gridY, tileSize, baseType = 'gatling') {
        this.gridX = gridX;
        this.gridY = gridY;
        this.tileSize = tileSize;
        this.x = gridX * tileSize + tileSize / 2;
        this.y = gridY * tileSize + tileSize / 2;
        this.baseType = baseType;
        this.level = 1;
        this.stage = 1;
        this.cooldown = 0;
        this.target = null;
        this.angle = 0;

        this.applyStats();
    }

    get currentType() {
        return this.stage > 1 ? `${this.baseType}_stage${this.stage}` : this.baseType;
    }

    // タワー上方修正（頼もしい威力・射程・連射速度へ強化）
    static calculateStats(baseType, level) {
        let stage = 1;
        if (level < 3) {
            stage = 1;
        } else if (level < 9) {
            stage = 2;
        } else {
            stage = 3;
        }

        let name, range, damage, fireRate, bulletSpeed, color, isSplash, splashRadius, formDesc, cost = 100;

        if (baseType === 'gatling') {
            cost = 100;
            if (stage === 1) {
                name = 'エルフの木の弓';
                range = 115 + (level - 1) * 8;      // 105->115
                damage = 7 + (level - 1) * 2.5;     // 4.5->7
                fireRate = Math.max(10, 18 - (level - 1) * 2); // 18(3.3/s)->16(3.75/s)
                bulletSpeed = 9.5;
                color = '#487c53';
                isSplash = false;
                splashRadius = 0;
                formDesc = '初期段階: 連射性に優れたエルフの木の弓';
            } else if (stage === 2) {
                name = '精霊の疾風弓';
                range = 140 + (level - 3) * 6;      // 125->140
                damage = 14 + (level - 3) * 3.5;    // 9->14
                fireRate = Math.max(7, 13 - (level - 3) * 1); // 13(4.6/s)->8(7.5/s)
                bulletSpeed = 12;
                color = '#15803d';
                isSplash = false;
                splashRadius = 0;
                formDesc = '第2進化: 風の加護を宿した二連弓 (Lv.3〜8)';
            } else {
                name = '★神木の大聖弓';
                range = 180 + (level - 9) * 8;      // 160->180
                damage = 38 + (level - 9) * 8;      // 25->38
                fireRate = Math.max(4, 7 - Math.floor((level - 9) * 0.5)); // 7(8.5/s)->4(15.0/s)
                bulletSpeed = 16;
                color = '#166534';
                isSplash = false;
                splashRadius = 0;
                formDesc = '最終第3進化: 神速無双の四連聖弓 (Lv.9〜)';
            }
        } else if (baseType === 'cannon') {
            cost = 160;
            if (stage === 1) {
                name = '投石器';
                range = 145 + (level - 1) * 8;      // 135->145
                damage = 25 + (level - 1) * 7;      // 22->25
                fireRate = Math.max(35, 55 - (level - 1) * 4); // 55(1.1/s)->51(1.18/s)
                bulletSpeed = 5.5;
                color = '#8b5a2b';
                isSplash = true;
                splashRadius = 50 + (level - 1) * 5; // 45->50
                formDesc = '初期段階: 集団敵用の範囲爆発投石器';
            } else if (stage === 2) {
                name = '重装カタパルト';
                range = 168 + (level - 3) * 7;      // 155->168
                damage = 46 + (level - 3) * 9;      // 40->46
                fireRate = Math.max(28, 46 - (level - 3) * 2.5); // 46(1.3/s)->34(1.76/s)
                bulletSpeed = 7.5;
                color = '#78350f';
                isSplash = true;
                splashRadius = 68 + (level - 3) * 5;
                formDesc = '第2進化: 巨岩を撃ち出す重投石機 (Lv.3〜8)';
            } else {
                name = '★紅蓮のマグマ巨砲';
                range = 210 + (level - 9) * 10;     // 190->210
                damage = 115 + (level - 9) * 22;    // 95->115
                fireRate = Math.max(20, 34 - (level - 9) * 1.5);
                bulletSpeed = 9.5;
                color = '#b91c1c';
                isSplash = true;
                splashRadius = 98 + (level - 9) * 6;
                formDesc = '最終第3進化: 広域溶岩大爆発砲 (Lv.9〜)';
            }
        } else if (baseType === 'laser') {
            cost = 220;
            if (stage === 1) {
                name = '見習い魔術塔';
                range = 200 + (level - 1) * 12;     // 180->200
                damage = 58 + (level - 1) * 18;     // 48->58
                fireRate = Math.max(50, 82 - (level - 1) * 6); // 82(0.73/s)->76(0.79/s)
                bulletSpeed = 15;
                color = '#3b82a6';
                isSplash = false;
                splashRadius = 0;
                formDesc = '初期段階: 強敵単体用の長射程魔術';
            } else if (stage === 2) {
                name = '古代ルーン魔導塔';
                range = 235 + (level - 3) * 10;     // 210->235
                damage = 110 + (level - 3) * 26;    // 95->110
                fireRate = Math.max(38, 68 - (level - 3) * 4); // 68(0.88/s)->48(1.25/s)
                bulletSpeed = 20;
                color = '#2563eb';
                isSplash = false;
                splashRadius = 0;
                formDesc = '第2進化: 凝縮された魔導パルス (Lv.3〜8)';
            } else {
                name = '★大賢者の天雷神塔';
                range = 295 + (level - 9) * 14;     // 260->295
                damage = 280 + (level - 9) * 65;    // 220->280
                fireRate = Math.max(25, 48 - (level - 9) * 2.5);
                bulletSpeed = 26;
                color = '#7c3aed';
                isSplash = false;
                splashRadius = 0;
                formDesc = '最終第3進化: ボス特効の神聖雷光 (Lv.9〜)';
            }
        }

        return {
            name,
            level,
            stage,
            cost,
            range,
            damage,
            fireRate,
            bulletSpeed,
            color,
            isSplash,
            splashRadius,
            formDesc,
            dps: (damage * (60 / fireRate)).toFixed(1)
        };
    }

    applyStats() {
        const stats = Tower.calculateStats(this.baseType, this.level);
        this.name = stats.name;
        this.stage = stats.stage;
        this.cost = stats.cost;
        this.range = stats.range;
        this.damage = stats.damage;
        this.fireRate = stats.fireRate;
        this.bulletSpeed = stats.bulletSpeed;
        this.color = stats.color;
        this.isSplash = stats.isSplash;
        this.splashRadius = stats.splashRadius;
        this.formDesc = stats.formDesc;
    }

    getUpgradeCost() {
        return Math.round(this.cost * 0.45 * this.level + 35);
    }

    upgrade() {
        const prevStage = this.stage;
        this.level++;
        this.applyStats();
        return this.stage > prevStage;
    }

    update(enemies, projectiles, particles) {
        if (this.cooldown > 0) {
            this.cooldown--;
        }

        let bestTarget = null;
        let bestProgress = -1;

        for (const enemy of enemies) {
            if (enemy.dead || enemy.reachedEnd) continue;
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist <= this.range) {
                const progress = enemy.currentPathIndex * 1000 - dist;
                if (progress > bestProgress) {
                    bestProgress = progress;
                    bestTarget = enemy;
                }
            }
        }

        this.target = bestTarget;

        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);

            if (this.cooldown <= 0) {
                this.fire(projectiles);
                this.cooldown = this.fireRate;
            }
        }
    }

    fire(projectiles) {
        if (!this.target) return;
        const p = new Projectile(
            this.x,
            this.y,
            this.target,
            this.damage,
            this.bulletSpeed,
            this.baseType,
            this.stage,
            this.isSplash,
            this.splashRadius || 0
        );
        projectiles.push(p);
        sound.playShoot(this.baseType);
    }

    draw(ctx, isSelected = false) {
        ctx.save();

        if (isSelected) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.fillStyle = this.stage === 3 ? 'rgba(185, 28, 28, 0.08)' : 'rgba(72, 124, 83, 0.08)';
            ctx.fill();
            ctx.strokeStyle = this.stage === 3 ? 'rgba(185, 28, 28, 0.6)' : 'rgba(72, 124, 83, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.fillStyle = this.stage === 3 ? '#fef3c7' : this.stage === 2 ? '#f1f5f9' : '#ffffff';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.stage === 3 ? 3 : this.stage === 2 ? 2.5 : 2;
        ctx.beginPath();
        ctx.roundRect(this.x - 17, this.y - 17, 34, 34, this.stage === 3 ? 10 : 6);
        ctx.fill();
        ctx.stroke();

        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.color;

        if (this.baseType === 'gatling') {
            if (this.stage === 1) {
                ctx.fillRect(0, -2, 16, 4);
            } else if (this.stage === 2) {
                ctx.fillRect(0, -5, 18, 3);
                ctx.fillRect(0, 2, 18, 3);
            } else {
                ctx.fillRect(0, -8, 22, 3);
                ctx.fillRect(0, -3, 24, 3);
                ctx.fillRect(0, 3, 24, 3);
                ctx.fillRect(0, 8, 22, 3);
            }
        } else if (this.baseType === 'cannon') {
            if (this.stage === 1) {
                ctx.fillRect(0, -4, 15, 8);
            } else if (this.stage === 2) {
                ctx.fillRect(0, -6, 20, 12);
            } else {
                ctx.fillRect(0, -8, 25, 16);
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(8, -4, 12, 8);
            }
        } else {
            if (this.stage === 1) {
                ctx.fillRect(0, -3, 20, 6);
            } else if (this.stage === 2) {
                ctx.fillRect(0, -4, 26, 8);
            } else {
                ctx.fillRect(0, -5, 32, 4);
                ctx.fillRect(0, 1, 32, 4);
                ctx.fillStyle = '#a855f7';
                ctx.fillRect(10, -2, 14, 4);
            }
        }

        ctx.fillStyle = this.stage === 3 ? '#d97706' : '#332c23';
        ctx.beginPath();
        ctx.arc(0, 0, this.stage === 3 ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.save();
        ctx.font = 'bold 10px -apple-system, sans-serif';
        if (this.stage === 3) {
            ctx.fillStyle = '#b91c1c';
            ctx.fillText(`★Lv.${this.level} (第3)`, this.x - 24, this.y + 25);
        } else if (this.stage === 2) {
            ctx.fillStyle = '#d97706';
            ctx.fillText(`Lv.${this.level} (第2)`, this.x - 20, this.y + 25);
        } else {
            ctx.fillStyle = '#64748b';
            ctx.fillText(`Lv.${this.level}`, this.x - 12, this.y + 25);
        }
        ctx.restore();
    }
}