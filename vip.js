/**
 * ==============================================================================
 * QUANTUM REACH v77: THE KINEMATIC DILATION
 * Architecture: 2nd-Order Kinematic Prediction + Dynamic Hitbox Dilation
 * Fixes: Solves Zig-Zag Evasion, High-Speed Target Missing, Desync Compensation
 * Status: OMNI-SNAP ACTIVATED - Absolute Mathematical Lock
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 77) {
    _global.__QuantumState = {
        version: 77,
        frameCounter: 0,
        currentPing: 0.05,
        history: {} // Lưu trữ { vel, time } để tính gia tốc
    };
}

class QuantumKinematics {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Tính toán tốc độ vô hướng (Magnitude of Velocity Vector)
    static getSpeed(vel) {
        if (!vel) return 0;
        return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    }

    // GIẢI PHÁP 2: Hitbox Dilation (Giãn nở theo động năng)
    static getDilatedRadius(baseRadius, vel) {
        const speed = this.getSpeed(vel);
        const dilationFactor = 2.5; // Hệ số giãn nở
        const maxDilation = 35.0;   // Giới hạn chống phình quá to gây lỗi
        
        // Bơm phồng bán kính dựa trên tốc độ di chuyển
        let dilation = speed * dilationFactor;
        dilation = this.clamp(dilation, 0, maxDilation);
        
        return baseRadius + dilation;
    }

    // GIẢI PHÁP 1: Chuyển động bậc 2 (Gia tốc + Vận tốc)
    static predictKinematicLead(targetId, headPos, targetVel, selfVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + _global.__QuantumState.currentPing + 0.002;
        
        let accel = { x: 0, y: 0, z: 0 };

        // Lấy lịch sử để tính Gia tốc (Acceleration)
        if (_global.__QuantumState.history[targetId]) {
            const prev = _global.__QuantumState.history[targetId];
            let dt = (currentTime - prev.time) / 1000.0; // Đổi ms sang giây
            
            // Lọc các dt bất thường (Lag spike) để tránh gia tốc vọt lên vô cực
            if (dt > 0.01 && dt < 0.2) { 
                accel.x = (targetVel.x - prev.vel.x) / dt;
                accel.y = (targetVel.y - prev.vel.y) / dt;
                accel.z = (targetVel.z - prev.vel.z) / dt;

                // Giới hạn gia tốc tối đa để chống lỗi vật lý
                const maxAccel = 50.0; 
                accel.x = this.clamp(accel.x, -maxAccel, maxAccel);
                accel.y = this.clamp(accel.y, -maxAccel, maxAccel);
                accel.z = this.clamp(accel.z, -maxAccel, maxAccel);
            }
        }

        // Cập nhật lịch sử mới
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        // P_target = P0 + V*t + 0.5*A*t^2 (Thêm trọng lực cho trục Y)
        return {
            x: headPos.x + (targetVel.x - selfVel.x) * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime) - 0.012,
            z: headPos.z + (targetVel.z - selfVel.z) * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class KinematicApexEngine {
    constructor() {
        this.absoluteWeight = 99999999.0;
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 'particles', 'effects']);
        this.ghostBones = ['root', 'spine', 'spine1', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
    }

    findBestTarget(players) {
        if (!players || players.length === 0) return null;
        let bestTarget = null;
        let minDistance = 9999.0;

        for (let enemy of players) {
            if (!enemy || enemy.is_visible === false || enemy.occluded === true) continue;
            if (enemy.distance < minDistance) {
                minDistance = enemy.distance;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    processRecursive(node, context = { isFiring: false, selfVel: {x:0,y:0,z:0}, targetId: null, targetPos: null }) {
        if (typeof node !== 'object' || node === null) return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping / 1000.0;
        if (node.player_velocity) context.selfVel = node.player_velocity;

        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
        }

        if (node.players && Array.isArray(node.players)) {
            const bestTarget = this.findBestTarget(node.players);
            const currentTime = Date.now();
            
            if (bestTarget && context.isFiring) {
                context.targetId = bestTarget.id;

                node.players.forEach(enemy => {
                    this.ghostBones.forEach(bone => {
                        if (enemy.hitboxes && enemy.hitboxes[bone]) {
                            enemy.hitboxes[bone].priority = "IGNORE";
                            enemy.hitboxes[bone].snap_weight = -999999.0;
                            enemy.hitboxes[bone].m_Radius = 0.0;
                        }
                    });

                    if (enemy.id === context.targetId && enemy.head_pos) {
                        // Gọi hàm dự đoán động học bậc 2
                        const interceptPos = QuantumKinematics.predictKinematicLead(
                            enemy.id, enemy.head_pos, enemy.velocity || {x:0, y:0, z:0}, 
                            context.selfVel, enemy.distance || 20.0, currentTime
                        );
                        
                        context.targetPos = interceptPos;

                        enemy.center_of_mass.x = interceptPos.x;
                        enemy.center_of_mass.y = interceptPos.y;
                        enemy.center_of_mass.z = interceptPos.z;

                        if (enemy.hitboxes && enemy.hitboxes.head) {
                            enemy.hitboxes.head.priority = "ABSOLUTE";
                            
                            // Bơm phồng Hitbox dựa trên tốc độ di chuyển
                            const baseRadius = enemy.distance > 50 ? 55.0 : 35.0;
                            enemy.hitboxes.head.m_Radius = QuantumKinematics.getDilatedRadius(baseRadius, enemy.velocity);
                        }
                    }
                });
            }
        }

        // ÉP TỌA ĐỘ TRỰC TIẾP LÊN CAMERA
        if (node.camera_state) {
            if (context.isFiring && context.targetId && context.targetPos) {
                node.camera_state.forced_target_id = context.targetId; 
                node.camera_state.absolute_lock = true;
                node.camera_state.lock_bone = "bone_Head";
                node.camera_state.target_bone_id = 8;
                
                node.camera_state.interpolation = "ZERO";
                node.camera_state.interpolation_frames = 0;
                node.camera_state.max_pitch_velocity = 0.0;
                node.camera_state.max_yaw_velocity = 0.0;
                
                node.camera_state.target_x = context.targetPos.x;
                node.camera_state.target_y = context.targetPos.y;
                node.camera_state.target_z = context.targetPos.z;
            } else {
                node.camera_state.absolute_lock = false;
                node.camera_state.forced_target_id = null;
                node.camera_state.interpolation = "NORMAL";
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state', 'players'].includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new KinematicApexEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
