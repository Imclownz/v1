/**
 * ==============================================================================
 * QUANTUM REACH v73: THE HUMANIZED APEX (FINAL STABILITY)
 * Architecture: Smart EMA Velocity, Sine-Wave Humanization, Constant Gravity
 * Fixes: Zero Response Lag, Absolute Memory Cleanup, Anti-Jitter Sine Oscillation
 * Status: Undetectable Human-Like God Mode
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version < 73) {
    _global.__QuantumState = {
        version: 73,
        frameCounter: 0,
        velocityHistory: {}, 
        lastUpdate: {}, // Theo dõi thời gian cập nhật của từng ID để dọn rác
        lastFireRate: 0.12,
        lastCleanup: Date.now()
    };
}

class QuantumMath {
    static getDynamicFrames(distance) {
        return Math.max(3, Math.min(10, Math.round(distance / 8.0))); 
    }

    // Tạo dao động mềm mại giống nhịp thở con người (Tránh Jitter của Math.random)
    static getHumanizedOffset(frame) {
        const amplitude = 0.012; // Biên độ dao động tối đa
        const frequency = 0.05;  // Tốc độ nhịp thở
        return {
            x: Math.sin(frame * frequency) * amplitude,
            z: Math.cos(frame * frequency * 0.8) * amplitude * 0.7
        };
    }

    static predictParabolic(targetId, targetPos, targetVel, selfVel, distance, isAirborne, frameCount) {
        const frames = this.getDynamicFrames(distance);
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81; // Hằng số tuyệt đối, không thay đổi theo cự ly

        const totalTime = (distance / BULLET_SPEED) + 0.0006;
        let dt = totalTime / frames;
        if (isAirborne) dt *= 0.90;

        let pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
        let currentVy = targetVel.y;

        // SMART EMA FILTER (Chống trễ khi đổi hướng)
        const history = _global.__QuantumState.velocityHistory[targetId] || [];
        let avgVel = targetVel;

        if (history.length > 0) {
            const lastVel = history[history.length - 1];
            // Tích vô hướng vector 2D (X, Z) để kiểm tra đổi hướng
            const dotProduct = (lastVel.x * targetVel.x) + (lastVel.z * targetVel.z);
            
            if (dotProduct < 0) {
                // Kẻ địch bẻ lái ngoắt 180 độ -> XÓA lịch sử, bắt ngay vận tốc mới để không bị trễ tâm
                _global.__QuantumState.velocityHistory[targetId] = [];
                avgVel = targetVel;
            } else {
                // Kẻ địch chạy thẳng -> Làm mượt (Smooth)
                avgVel = {
                    x: lastVel.x * 0.4 + targetVel.x * 0.6,
                    y: lastVel.y * 0.3 + targetVel.y * 0.7,
                    z: lastVel.z * 0.4 + targetVel.z * 0.6
                };
            }
        }

        for (let i = 0; i < frames; i++) {
            pos.x += (avgVel.x - selfVel.x) * dt;
            pos.z += (avgVel.z - selfVel.z) * dt;
            pos.y += (currentVy - selfVel.y) * dt + 0.5 * GRAVITY * dt * dt;
            currentVy += GRAVITY * dt;
        }

        // Áp dụng nhịp thở sinh học
        const micro = this.getHumanizedOffset(frameCount);
        return {
            x: pos.x + micro.x,
            y: pos.y,
            z: pos.z + micro.z
        };
    }
}

class HumanizedApexEngine {
    constructor() {
        this.godWeight = 9500.0;        
        this.voidWeight = -12000.0;
        this.balanceWeight = 220.0;
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 'particles']);
        this.ghostBones = ['root', 'spine', 'pelvis', 'hips', 'arm', 'leg', 'shoulder', 'foot', 'hand', 'neck', 'jaw', 'spine1', 'chest'];
    }

    getCombatPhase(weapon, camera) {
        if (!weapon && !camera) return 0;
        const isFiring = !!(weapon?.is_firing || weapon?.recoil_accumulation > 0 || camera?.is_firing);
        if (!isFiring) return 0;

        const shotCount = weapon?.shots_fired ?? (weapon?.recoil_accumulation / 0.015 || 0);
        return Math.min(2, Math.floor(shotCount / 3) + 1); // 1: Teleport/Snap (0-3 viên), 2: Smooth Control (>3 viên)
    }

    enforceZeroPoint(weapon) {
        if (!weapon) return;
        ['recoil', 'spread', 'bloom', 'camera_shake', 'weapon_sway'].forEach(p => weapon[p] = 0.0);
        weapon.aim_assist_range = 600.0;      
        weapon.auto_aim_angle = 180.0;        
        weapon.bullet_speed = 99999.0;
    }

    warpHitboxes(hitboxes, distance, phase, isAirborne) {
        if (!hitboxes) return;

        this.ghostBones.forEach(bone => {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].m_Radius = 0.000001;
                hitboxes[bone].friction = 0.0;
                hitboxes[bone].vertical_magnetism_multiplier = this.voidWeight * 0.8;
            }
        });

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            const baseRadius = distance > 55 ? 34 : (distance > 30 ? 27 : 21);
            hitboxes.head.m_Radius = isAirborne ? baseRadius * 1.18 : baseRadius;

            if (phase === 1) {
                hitboxes.head.snap_weight = this.godWeight;
                hitboxes.head.horizontal_magnetism_multiplier = this.godWeight * 0.8; 
                hitboxes.head.vertical_magnetism_multiplier = isAirborne ? this.godWeight * 1.1 : this.godWeight * 0.9;
                hitboxes.head.friction = 145.0; 
            } else if (phase === 2) {
                hitboxes.head.snap_weight = this.balanceWeight;
                hitboxes.head.horizontal_magnetism_multiplier = 180.0;
                hitboxes.head.vertical_magnetism_multiplier = 120.0;
                hitboxes.head.friction = 180.0;
            }
        }
    }

    cleanupMemory() {
        const now = Date.now();
        if (now - _global.__QuantumState.lastCleanup < 5000) return; // Dọn rác mỗi 5 giây
        _global.__QuantumState.lastCleanup = now;

        Object.keys(_global.__QuantumState.lastUpdate).forEach(id => {
            // Nếu một ID không được cập nhật trong 5 giây (Kẻ địch đã chết hoặc ra khỏi tầm nhìn), xóa triệt để
            if (now - _global.__QuantumState.lastUpdate[id] > 5000) {
                delete _global.__QuantumState.velocityHistory[id];
                delete _global.__QuantumState.lastUpdate[id];
            }
        });
    }

    processRecursive(node, context = { selfVel: {x:0,y:0,z:0}, phase: 0 }) {
        if (typeof node !== 'object' || node === null) return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.player_velocity) context.selfVel = node.player_velocity;
        if (node.weapon) context.phase = this.getCombatPhase(node.weapon, node.camera_state);
        if (node.weapon) this.enforceZeroPoint(node.weapon);

        if (node.players && Array.isArray(node.players)) {
            this.cleanupMemory();
            const now = Date.now();

            node.players.forEach(enemy => {
                const id = enemy.id || enemy.uid || 'unknown';
                const isAirborne = Math.abs(enemy.velocity?.y || 0) > 1.15;

                _global.__QuantumState.lastUpdate[id] = now;
                if (!_global.__QuantumState.velocityHistory[id]) _global.__QuantumState.velocityHistory[id] = [];
                _global.__QuantumState.velocityHistory[id].push({... (enemy.velocity || {x:0,y:0,z:0})});
                if (_global.__QuantumState.velocityHistory[id].length > 4) _global.__QuantumState.velocityHistory[id].shift();

                const interceptPos = QuantumMath.predictParabolic(
                    id,
                    enemy.head_pos || enemy.center_of_mass,
                    enemy.velocity || {x:0,y:0,z:0},
                    context.selfVel,
                    enemy.distance || 25.0,
                    isAirborne,
                    _global.__QuantumState.frameCounter
                );

                enemy.center_of_mass.x = interceptPos.x;
                enemy.center_of_mass.z = interceptPos.z;
                enemy.center_of_mass.y = interceptPos.y - 0.015;

                this.warpHitboxes(enemy.hitboxes, enemy.distance || 25.0, context.phase, isAirborne);
            });
        }

        // DECOUPLED CAMERA LOGIC (Chống xung đột Teleport và Smooth)
        if (node.camera_state) {
            if (context.phase === 1) {
                // Pure Snap (Teleport 3 viên đầu)
                node.camera_state.interpolation = "ZERO";
                node.camera_state.snap_speed = this.godWeight;
                node.camera_state.stickiness = this.godWeight;
                node.camera_state.lock_bone = "bone_Head";
                node.camera_state.vertical_sensitivity_multiplier = 0.0; 
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                // Pure Smooth (Sấy dài)
                node.camera_state.interpolation = "SMOOTH";
                node.camera_state.snap_speed = this.balanceWeight * 2.5;
                node.camera_state.vertical_sensitivity_multiplier = 0.65;
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            const skipKeys = ['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state'];
            if (typeof node[key] === 'object' && !skipKeys.includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new HumanizedApexEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body });
    }
}
