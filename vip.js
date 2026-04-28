/**
 * ==============================================================================
 * QUANTUM REACH v81: THE ABSOLUTE ORIGIN (100% BRUTAL EFFICIENCY)
 * Architecture: First-Shot Forcing + Self-State Spoofing + Vector Sync
 * Fixes: Solves Dynamic Bloom (Weapon Spread) & Kinematic Instability (In-air penalties)
 * Status: GOD MODE - Server Physics Engine Overridden
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 81) {
    _global.__QuantumState = {
        version: 81,
        frameCounter: 0,
        currentPing: 50.0, 
        history: {},
        lockedTargetId: null,
        lockedTargetPos: null,
        fakePitch: 0.0,
        fakeYaw: 0.0
    };
}

class VectorDeception {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    static calculatePerfectAngles(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        const yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        const pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);
        return { pitch, yaw };
    }

    static getAngleDelta(p1, y1, p2, y2) {
        let dp = Math.abs(p1 - p2);
        let dy = Math.abs(y1 - y2);
        dy = dy > 180 ? 360 - dy : dy; 
        return Math.sqrt(dp * dp + dy * dy);
    }

    static getAbsoluteHitPoint(targetId, headPos, targetVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + (_global.__QuantumState.currentPing / 1000.0);
        
        let accel = { x: 0, y: 0, z: 0 };
        if (_global.__QuantumState.history[targetId]) {
            const prev = _global.__QuantumState.history[targetId];
            let dt = (currentTime - prev.time) / 1000.0; 
            if (dt > 0.01 && dt < 0.2) { 
                accel.x = this.clamp((targetVel.x - prev.vel.x) / dt, -50.0, 50.0);
                accel.y = this.clamp((targetVel.y - prev.vel.y) / dt, -50.0, 50.0);
                accel.z = this.clamp((targetVel.z - prev.vel.z) / dt, -50.0, 50.0);
            }
        }
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        // Lưu ý: Đã loại bỏ selfVel khỏi công thức vì chúng ta sẽ ép Máy chủ tin rằng ta đang đứng im tuyệt đối
        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + targetVel.y * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime),
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class AbsoluteOriginEngine {
    constructor() {
        this.IGNORE_KEYS = new Set(['ui', 'telemetry', 'metrics', 'log', 'audio', 'cosmetics', 'chat']);
        this.MAGIC_FOV = 25.0; 
    }

    processRecursive(node, context = { isFiring: false, selfPos: null, currentPitch: 0, currentYaw: 0 }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        const currentTime = Date.now();
        
        // --- ĐỒNG BỘ THỜI GIAN ---
        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping;
        if (node.client_timestamp && context.isFiring) {
            node.client_timestamp -= (_global.__QuantumState.currentPing * 0.45); 
        }

        if (node.player_pos) context.selfPos = node.player_pos;
        
        if (node.camera_state) {
            context.currentPitch = node.camera_state.pitch || 0;
            context.currentYaw = node.camera_state.yaw || 0;
            context.isFiring = !!node.camera_state.is_firing;
        }
        if (node.weapon) context.isFiring = context.isFiring || !!(node.weapon.is_firing || node.weapon.recoil_accumulation > 0);

        // --- 1. FIRST-SHOT FORCING (ĐÓNG BĂNG ĐỘ NỞ TÂM) ---
        if (node.weapon) {
            // Ép mọi thông số giật/nở tâm về 0. Game sẽ nghĩ bạn liên tục bắn viên đạn đầu tiên.
            node.weapon.shots_fired = 0;
            node.weapon.recoil_accumulation = 0.0;
            node.weapon.spread = 0.0;
            node.weapon.progressive_spread = 0.0;
            node.weapon.camera_shake = 0.0;
            node.weapon.weapon_sway = 0.0;
        }

        // --- 2. SELF-STATE SPOOFING (ĐỨNG IM ẢO ẢNH) ---
        if (context.isFiring) {
            // Xóa bỏ vận tốc quán tính của bản thân trong mắt Máy chủ
            if (node.player_velocity) {
                node.player_velocity.x = 0.0;
                node.player_velocity.y = 0.0;
                node.player_velocity.z = 0.0;
            }
            // Triệt tiêu mọi hình phạt di chuyển (Movement Penalties)
            if (node.is_jumping !== undefined) node.is_jumping = false;
            if (node.is_grounded !== undefined) node.is_grounded = true;
            if (node.is_moving !== undefined) node.is_moving = false;
            if (node.movement_state !== undefined) node.movement_state = 0; // 0 thường = Idle
        }

        // --- 3. NHẬN DIỆN & TÍNH TOÁN (HYBRID LOCK) ---
        if (node.players && Array.isArray(node.players) && context.isFiring) {
            let bestTarget = null;
            let minDistance = 9999.0;

            node.players.forEach(enemy => {
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { minDistance = enemy.distance; bestTarget = enemy; }
                }
            });

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.lockedTargetId = bestTarget.id;
                _global.__QuantumState.lockedTargetPos = VectorDeception.getAbsoluteHitPoint(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    bestTarget.distance || 20.0, currentTime
                );

                if (context.selfPos) {
                    const perfectAngles = VectorDeception.calculatePerfectAngles(context.selfPos, _global.__QuantumState.lockedTargetPos);
                    _global.__QuantumState.fakePitch = perfectAngles.pitch;
                    _global.__QuantumState.fakeYaw = perfectAngles.yaw;

                    const fovDelta = VectorDeception.getAngleDelta(context.currentPitch, context.currentYaw, perfectAngles.pitch, perfectAngles.yaw);
                    
                    if (fovDelta <= this.MAGIC_FOV && node.camera_state) {
                        node.camera_state.interpolation = "NORMAL"; 
                        node.camera_state.absolute_lock = false;
                        if (node.touch_delta_x !== undefined) node.touch_delta_x = 0;
                        if (node.touch_delta_y !== undefined) node.touch_delta_y = 0;
                    } 
                    else if (node.camera_state) {
                        node.camera_state.target_x = _global.__QuantumState.lockedTargetPos.x;
                        node.camera_state.target_y = _global.__QuantumState.lockedTargetPos.y - 0.2; 
                        node.camera_state.target_z = _global.__QuantumState.lockedTargetPos.z;
                        node.camera_state.interpolation = "ZERO";
                    }
                }
            }
        }

        // --- 4. GIẢ MẠO SÁT THƯƠNG & VECTOR RAYCAST ---
        if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event) {
            if (_global.__QuantumState.lockedTargetId && _global.__QuantumState.lockedTargetPos) {
                node.target_id = _global.__QuantumState.lockedTargetId;
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.part_id !== undefined) node.part_id = "head";
                if (node.is_critical !== undefined) node.is_critical = true;
                if (node.is_headshot !== undefined) node.is_headshot = true;
                
                if (node.hit_pos) {
                    node.hit_pos.x = _global.__QuantumState.lockedTargetPos.x;
                    node.hit_pos.y = _global.__QuantumState.lockedTargetPos.y;
                    node.hit_pos.z = _global.__QuantumState.lockedTargetPos.z;
                }

                // Chèn góc nhìn ảo để hợp pháp hóa đường đạn
                if (node.camera_pitch !== undefined) node.camera_pitch = _global.__QuantumState.fakePitch;
                if (node.camera_yaw !== undefined) node.camera_yaw = _global.__QuantumState.fakeYaw;
                if (node.aim_pitch !== undefined) node.aim_pitch = _global.__QuantumState.fakePitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = _global.__QuantumState.fakeYaw;
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object') {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"') || $response.body.includes('"hit_bone"') || $response.body.includes('"damage_')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new AbsoluteOriginEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
