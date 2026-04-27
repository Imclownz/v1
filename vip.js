/**
 * ==============================================================================
 * QUANTUM REACH v69: THE PARABOLIC OMNI-STATE
 * Architecture: True Frame Sync + Parabolic Jump Prediction + Payload Pre-Filter
 * Optimization: Zero-Lag JSON Parsing, Gravity-Aware Hijacking, Flawless Ceiling
 * ==============================================================================
 */

// 1. HYBRID GLOBAL STATE (An toàn & Độc lập)
const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 69) {
    _global.__QuantumState = {
        version: 69,
        frameCounter: 0,
        previousVelY: {},
        lastFireRate: 0.12,
        playerLastSeen: {}
    };
}

const MAX_TRACKED_PLAYERS = 25;
const CLEANUP_INTERVAL = 120;

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static getDynamicFrames(distance) {
        return Math.max(2, Math.min(6, Math.round(distance / 12.0))); 
    }

    // KHẮC PHỤC: Dự đoán Parabol bù trừ trọng lực cho trục Y
    static predictParabolic(targetPos, targetVel, selfVel, distance) {
        const frames = this.getDynamicFrames(distance);
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81; // Gia tốc trọng trường tiêu chuẩn của Engine
        
        let pos = { ...targetPos };
        let currentVy = targetVel.y;
        const dt = (distance / BULLET_SPEED) + 0.001; 
        
        for (let i = 0; i < frames; i++) {
            // Trục X, Z (Chuyển động tuyến tính)
            pos.x += (targetVel.x - selfVel.x) * dt;
            pos.z += (targetVel.z - selfVel.z) * dt;
            
            // Trục Y (Chuyển động rơi tự do)
            pos.y += (currentVy - selfVel.y) * dt + 0.5 * GRAVITY * (dt * dt);
            currentVy += GRAVITY * dt; // Cập nhật vận tốc rơi theo khung hình
        }
        return pos;
    }
}

class ParabolicAnchorEngine {
    constructor() {
        this.godWeight = 9999999.0;      
        this.voidWeight = -9999999.0;
        this.balanceWeight = 220.0;

        this.IGNORE_KEYS = new Set([
            'ui', 'inventory', 'audio', 'cosmetics', 'friends_list', 
            'graphics_settings', 'match_stats', 'chat', 'effects', 
            'particles', 'minimap', 'leaderboard'
        ]);

        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'spine3', 'spine4', 'chest', 
            'pelvis', 'hips', 'waist',
            'left_arm', 'right_arm', 'left_forearm', 'right_forearm',
            'left_upperarm', 'right_upperarm', 'left_hand', 'right_hand',
            'left_leg', 'right_leg', 'left_thigh', 'right_thigh',
            'left_calf', 'right_calf', 'left_foot', 'right_foot',
            'left_shoulder', 'right_shoulder', 'neck', 'clavicle'
        ];
    }

    getCombatPhase(weapon, camera) {
        let isFiring = false;
        let shotCount = 0;

        if (weapon) {
            if (weapon.is_firing || (weapon.recoil_accumulation && weapon.recoil_accumulation > 0)) isFiring = true;
            shotCount = weapon.shots_fired ?? (weapon.recoil_accumulation ? weapon.recoil_accumulation / 0.018 : 0);
            
            if (weapon.fire_rate && weapon.fire_rate > 0) {
                _global.__QuantumState.lastFireRate = weapon.fire_rate;
            }
        }
        if (camera && camera.is_firing) isFiring = true;

        if (!isFiring) return 0;
        if (shotCount <= 2.8) return 1;
        return 2;
    }

    enforceZeroPoint(weapon) {
        if (!weapon) return;
        const nullifyProps = [
            'recoil', 'spread', 'bloom', 'camera_shake', 'progressive_spread',
            'recoil_multiplier', 'horizontal_recoil', 'vertical_recoil',
            'movement_penalty', 'jump_penalty', 'weapon_sway', 'aim_sway'
        ];
        for (let prop of nullifyProps) {
            if (prop in weapon) weapon[prop] = 0.0;
        }
        weapon.aim_assist_range = 800.0;
        weapon.auto_aim_angle = 360.0;
        weapon.bullet_speed = 99999.0;
    }

    calculateAirborneTrend(targetVel, previousVelY = 0) {
        const deltaY = targetVel.y - previousVelY;
        const magnitude = Math.abs(targetVel.y);
        return {
            isRising: targetVel.y > 1.2 || (targetVel.y > 0.4 && deltaY > 0.6),
            isFalling: targetVel.y < -1.2 || (targetVel.y < -0.4 && deltaY < -0.6),
            magnitude: magnitude,
            acceleration: deltaY
        };
    }

    warpHitboxes(hitboxes, distance, phase, isAirborne, velTrend) {
        if (!hitboxes) return;

        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight * 1.2;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.000001;
                hitboxes[bone].friction = 0.0;
                hitboxes[bone].vertical_magnetism_multiplier = isAirborne 
                    ? (this.voidWeight * 4.2) 
                    : (this.voidWeight * 1.5);
            }
        }

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";

            let headRadius = distance > 55 ? 38.0 : (distance > 25 ? 26.0 : 19.0);
            if (isAirborne) headRadius += 18.0 + (velTrend.magnitude * 3.5);

            hitboxes.head.m_Radius = headRadius;
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight * (isAirborne ? 2.1 : 1.3);

            if (phase === 0 || phase === 1) {
                hitboxes.head.snap_weight = this.godWeight * 1.15;
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight * (isAirborne ? 3.0 : 1.4);
                hitboxes.head.friction = this.godWeight * 1.1;
            } else if (phase === 2) {
                const fireRate = _global.__QuantumState.lastFireRate || 0.12;
                const releaseCycle = Math.max(4, Math.round(1.0 / fireRate));
                
                // Đồng bộ đúng với biến đếm toàn cục
                const isReleasing = (_global.__QuantumState.frameCounter % releaseCycle) < Math.ceil(releaseCycle * 0.45);

                const snapFactor = isReleasing ? 0.48 : 1.0;
                hitboxes.head.snap_weight = this.balanceWeight * snapFactor;
                hitboxes.head.vertical_magnetism_multiplier = 68.0 * (isAirborne ? 2.3 : 1.0);
                hitboxes.head.friction = 110.0;
            }
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = (phase === 2) ? this.balanceWeight * 0.65 : this.godWeight * 0.9;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.vertical_magnetism_multiplier = isAirborne ? 160.0 : 95.0;
        }
    }

    hijackCoordinate(player, selfVel, previousVelY = 0) {
        if (!player?.head_pos || !player?.center_of_mass) {
            return { isAirborne: false, velTrend: {}, prevY: 0 };
        }

        const dist = player.distance || 20.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };

        const velTrend = this.calculateAirborneTrend(targetVel, previousVelY);
        const isAirborne = Math.abs(targetVel.y) > 1.2 || velTrend.isRising || velTrend.isFalling || velTrend.magnitude > 3.0;

        // Kích hoạt dự đoán Parabol
        const interceptPos = QuantumMath.predictParabolic(player.head_pos, targetVel, selfVel, dist);

        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;

        // KHẮC PHỤC: Nới lỏng trần nội suy để tâm súng không bị khựng
        const absoluteCeiling = player.head_pos.y - 0.015; 

        let targetY = isAirborne 
            ? absoluteCeiling 
            : QuantumMath.clamp(interceptPos.y, absoluteCeiling - 0.20, absoluteCeiling);

        if (isAirborne && velTrend.magnitude > 6.0) {
            const overshootClamp = velTrend.acceleration > 0 ? 0.04 : -0.06;
            targetY = QuantumMath.clamp(targetY + overshootClamp, absoluteCeiling - 0.12, absoluteCeiling + 0.05);
        }

        player.center_of_mass.y = targetY;

        return { isAirborne, velTrend, prevY: targetVel.y };
    }

    cleanupOldPlayers() {
        if (_global.__QuantumState.frameCounter % CLEANUP_INTERVAL !== 0) return;

        const now = _global.__QuantumState.frameCounter;
        const keys = Object.keys(_global.__QuantumState.previousVelY);
        if (keys.length > MAX_TRACKED_PLAYERS) {
            for (let key of keys) {
                if (now - (_global.__QuantumState.playerLastSeen[key] || 0) > 300) {
                    delete _global.__QuantumState.previousVelY[key];
                    delete _global.__QuantumState.playerLastSeen[key];
                }
            }
        }
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, phase: 0 }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;

        const currentPhase = this.getCombatPhase(node.weapon, node.camera_state);
        if (currentPhase > context.phase) context.phase = currentPhase;

        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                if (!enemy || typeof enemy !== 'object') continue;

                const playerId = enemy.id || enemy.player_id || 'default';
                _global.__QuantumState.playerLastSeen[playerId] = _global.__QuantumState.frameCounter;

                const lastY = _global.__QuantumState.previousVelY[playerId] || 0;
                const { isAirborne, velTrend, prevY } = this.hijackCoordinate(enemy, context.selfVel, lastY);

                _global.__QuantumState.previousVelY[playerId] = prevY;
                this.warpHitboxes(enemy.hitboxes, enemy.distance || 20.0, context.phase, isAirborne, velTrend);
            }
            this.cleanupOldPlayers();
        }

        if ('camera_state' in node) {
            node.camera_state.interpolation = "ZERO";
            if (context.phase === 1) {
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                node.camera_state.vertical_sensitivity_multiplier = 0.52;
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;

            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'chest_pos', 'velocity', 'hitboxes'].includes(key)) {
                node[key] = this.processRecursive(node[key], context);
            }
        }

        return node;
    }
}

// ==============================================================================
// EXECUTION BLOCK WITH PRE-FILTER (TỐI ƯU HÓA CPU TUYỆT ĐỐI)
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    // KHẮC PHỤC: Chỉ phân tích JSON nếu gói tin thực sự chứa dữ liệu chiến đấu
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            // KHẮC PHỤC: Bộ đếm Frame chỉ tăng 1 lần duy nhất cho mỗi gói tin
            _global.__QuantumState.frameCounter++;
            
            const payload = JSON.parse($response.body);
            const Engine = new ParabolicAnchorEngine();
            const mutatedPayload = Engine.processRecursive(payload);
            $done({ body: JSON.stringify(mutatedPayload) });
        } catch (error) {
            $done({ body: $response.body });
        }
    } else {
        // Trả về ngay lập tức với các gói tin rác (ping, chat, ui...)
        $done({ body: $response.body });
    }
}
