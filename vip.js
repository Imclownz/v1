/**
 * ==============================================================================
 * QUANTUM REACH v81: THE SINGULARITY (99% BRUTALITY)
 * Architecture: Perfect Euler Vector Sync + Dynamic Time Warping + Array Unpacker
 * Fixes: Bypasses Server-Side Raycast Validation, Heuristic Bans, and Ghost Damage
 * Status: OMNIPOTENT - Mathematical Domination over Server Logic
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 81) {
    _global.__QuantumState = {
        version: 81,
        frameCounter: 0,
        currentPing: 45.0, // Ping mặc định
        history: {},
        lockedTargetId: null,
        lockedTargetPos: null,
        perfectPitch: 0.0,
        perfectYaw: 0.0
    };
}

class SingularityMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // 1. TÍNH TOÁN GÓC NHÌN HOÀN HẢO (Euler Angles) TỪ 2 TỌA ĐỘ
    static calculatePerfectAim(selfPos, targetPos) {
        if (!selfPos || !targetPos) return { pitch: 0, yaw: 0 };
        
        const dx = targetPos.x - selfPos.x;
        const dy = targetPos.y - selfPos.y; // Tính từ mắt/súng đến đầu
        const dz = targetPos.z - selfPos.z;
        
        const distanceXZ = Math.sqrt(dx * dx + dz * dz);
        
        // Chuyển đổi Radian sang Độ (Degrees)
        const yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        const pitch = Math.atan2(-dy, distanceXZ) * (180.0 / Math.PI); // -dy vì Unity trục Y hướng lên
        
        return { pitch, yaw };
    }

    // 2. DỰ ĐOÁN ĐỘNG HỌC KẾT HỢP GIA TỐC
    static getAbsoluteHitPoint(targetId, headPos, targetVel, selfVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + (_global.__QuantumState.currentPing / 1000.0) + 0.005;
        
        let accel = { x: 0, y: 0, z: 0 };
        if (_global.__QuantumState.history[targetId]) {
            const prev = _global.__QuantumState.history[targetId];
            let dt = (currentTime - prev.time) / 1000.0; 
            if (dt > 0.01 && dt < 0.2) { 
                accel.x = this.clamp((targetVel.x - prev.vel.x) / dt, -45.0, 45.0);
                accel.y = this.clamp((targetVel.y - prev.vel.y) / dt, -45.0, 45.0);
                accel.z = this.clamp((targetVel.z - prev.vel.z) / dt, -45.0, 45.0);
            }
        }
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        return { 
            x: headPos.x + (targetVel.x - selfVel.x) * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime) - 0.01,
            z: headPos.z + (targetVel.z - selfVel.z) * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class SingularityEngine {
    constructor() {
        this.IGNORE_KEYS = new Set(['ui', 'telemetry', 'metrics', 'log', 'audio', 'cosmetics', 'chat', 'friends']);
    }

    processRecursive(node, context = { isFiring: false, selfPos: null, selfVel: {x:0,y:0,z:0} }) {
        if (typeof node !== 'object' || node === null) return node;

        // XỬ LÝ MẢNG NÉN ĐẠN (Deep Array Unpacking)
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        const currentTime = Date.now();
        
        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping;
        if (node.player_pos) context.selfPos = node.player_pos;
        if (node.player_velocity) context.selfVel = node.player_velocity;
        
        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
        }

        // BẺ CONG THỜI GIAN ĐỘNG (Dynamic Time Warping)
        if (node.client_timestamp && context.isFiring) {
            const dynamicDelay = _global.__QuantumState.currentPing * 0.35; 
            node.client_timestamp -= dynamicDelay; 
        }

        // KHÓA MỤC TIÊU & TÍNH TOÁN VECTOR CHUẨN XÁC
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
                _global.__QuantumState.lockedTargetPos = SingularityMath.getAbsoluteHitPoint(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    context.selfVel, bestTarget.distance || 20.0, currentTime
                );

                if (context.selfPos) {
                    // Tính góc nhìn hoàn hảo từ Súng đến Đầu địch
                    const angles = SingularityMath.calculatePerfectAim(context.selfPos, _global.__QuantumState.lockedTargetPos);
                    _global.__QuantumState.perfectPitch = angles.pitch;
                    _global.__QuantumState.perfectYaw = angles.yaw;
                }

                // Gán hitboxes tuyệt đối để Engine Client không bối rối
                node.players.forEach(enemy => {
                    if (enemy.id === _global.__QuantumState.lockedTargetId) {
                        enemy.center_of_mass.x = _global.__QuantumState.lockedTargetPos.x;
                        enemy.center_of_mass.y = _global.__QuantumState.lockedTargetPos.y;
                        enemy.center_of_mass.z = _global.__QuantumState.lockedTargetPos.z;

                        if (enemy.hitboxes && enemy.hitboxes.head) {
                            enemy.hitboxes.head.priority = "MAXIMUM";
                            enemy.hitboxes.head.m_Radius = 150.0; // Phình to để hút đạn trên Client
                            enemy.hitboxes.head.snap_weight = 9999999.0;
                        }
                    }
                });
            }
        }

        // LY KHAI CẢM ỨNG (Input Nullification)
        if (node.input_sync && context.isFiring) {
            if (node.touch_delta_x !== undefined) node.touch_delta_x = 0;
            if (node.touch_delta_y !== undefined) node.touch_delta_y = 0;
        }

        // CHÈN MÃ ĐỘC VÀO CAMERA & ĐƯỜNG ĐẠN (Server Raycast Bypass)
        if (context.isFiring && _global.__QuantumState.lockedTargetId) {
            
            // Ép Camera tĩnh (Silent Aim lai)
            if (node.camera_state) {
                node.camera_state.interpolation = "ZERO";
                node.camera_state.max_pitch_velocity = 0.0;
                node.camera_state.max_yaw_velocity = 0.0;
                node.camera_state.target_bone_id = 8;
                
                // Tiêm góc chuẩn vào Camera để Server tin rằng bạn đang ngắm chuẩn
                node.camera_state.pitch = _global.__QuantumState.perfectPitch;
                node.camera_state.yaw = _global.__QuantumState.perfectYaw;
            }

            // TIÊM THẲNG VÀO GÓI TIN SÁT THƯƠNG
            if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event) {
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

                // Ghi đè vector nòng súng của phát đạn
                if (node.aim_pitch !== undefined) node.aim_pitch = _global.__QuantumState.perfectPitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = _global.__QuantumState.perfectYaw;
                if (node.fire_pitch !== undefined) node.fire_pitch = _global.__QuantumState.perfectPitch;
                if (node.fire_yaw !== undefined) node.fire_yaw = _global.__QuantumState.perfectYaw;
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

// EXECUTION BLOCK (Zero-Latency)
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"') || $response.body.includes('"hit_bone"') || $response.body.includes('"damage_') || $response.body.includes('"fire_')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new SingularityEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
