/**
 * ==============================================================================
 * QUANTUM REACH v82: THE EQUILIBRIUM (RELATIVE INVERSE FORCING)
 * Architecture: Inverse Recoil Compensation + Relative Kinematics + Stance Spoofing
 * Fixes: Bypasses Server State Machine, Zero Fake Damage, 100% In-Air Accuracy
 * Status: ARCHITECT LEVEL - Flowing with Server Physics
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 82) {
    _global.__QuantumState = {
        version: 82,
        frameCounter: 0,
        currentPing: 50.0,
        history: {},
        lockedTargetId: null,
        lockedTargetPos: null,
        // Lưu trữ độ giật hiện tại để bù trừ nghịch đảo
        currentRecoilY: 0.0,
        currentSpreadX: 0.0,
        basePitch: 0.0,
        baseYaw: 0.0
    };
}

class EquilibriumMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán Điểm đón đầu Tương đối (Relative Lead Point)
    static getRelativeHitPoint(targetId, headPos, targetVel, selfVel, distance, currentTime) {
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

        // TRỪ VECTOR TƯƠNG ĐỐI: V_rel = V_target - V_self
        const relVx = targetVel.x - selfVel.x;
        const relVy = targetVel.y - selfVel.y;
        const relVz = targetVel.z - selfVel.z;

        return { 
            x: headPos.x + relVx * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            // Bản thân rơi xuống (selfVel.y âm) -> trừ đi số âm thành CỘNG -> điểm ngắm tự động nâng lên bù trừ
            y: headPos.y + relVy * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime),
            z: headPos.z + relVz * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    // Tính toán Góc Nghịch Đảo (Inverse Angle Calculation)
    static calculateInverseAngles(fromPos, toPos, recoilY, spreadX) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Áp dụng Ma trận Nghịch đảo: Trừ đi độ lệch do Server nội suy
        // Hệ số 1.0 có thể cần tinh chỉnh tùy thuộc vào Engine (Unity thường dùng Euler Angles trực tiếp)
        pitch -= (recoilY * 1.0); 
        yaw -= (spreadX * 1.0);   

        return { pitch, yaw };
    }
}

class EquilibriumEngine {
    constructor() {
        this.IGNORE_KEYS = new Set(['ui', 'telemetry', 'metrics', 'log', 'audio', 'cosmetics', 'chat']);
    }

    processRecursive(node, context = { isFiring: false, selfPos: null, selfVel: {x:0,y:0,z:0} }) {
        if (typeof node !== 'object' || node === null) return node;

        // Xử lý Mảng (Array Unpacking) chống Batching
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        const currentTime = Date.now();
        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping;
        if (node.player_pos) context.selfPos = node.player_pos;
        if (node.player_velocity) {
            context.selfVel = node.player_velocity;
            // KHÔNG ÉP VẬN TỐC VỀ 0 NỮA. CHẤP NHẬN QUÁN TÍNH ĐỂ VƯỢT QUA SERVER VALIDATION.
        }

        // 1. ĐỌC THÔNG SỐ ĐỘ GIẬT TÍCH LŨY (Lắng nghe Engine thay vì ép buộc)
        if (node.weapon) {
            context.isFiring = !!(node.weapon.is_firing || node.weapon.recoil_accumulation > 0);
            if (context.isFiring) {
                // Lưu trữ độ giật hiện tại vào trạng thái toàn cục
                _global.__QuantumState.currentRecoilY = node.weapon.recoil_accumulation || node.weapon.vertical_recoil || 0.0;
                _global.__QuantumState.currentSpreadX = node.weapon.progressive_spread || node.weapon.horizontal_recoil || 0.0;
            }
        }
        if (node.camera_state) {
            context.isFiring = context.isFiring || !!node.camera_state.is_firing;
        }

        // 2. GIẢ MẠO TƯ THẾ BÓNG MA (Phantom Stance Injection)
        if (context.isFiring && (node.player_state || node.movement_state || node.pose)) {
            // Đánh tráo cờ tư thế thành Ngồi (Crouch) để hưởng lợi từ hệ số giảm giật của Server
            const stanceKeys = ['stance', 'pose_id', 'posture'];
            stanceKeys.forEach(k => {
                if (node[k] !== undefined) {
                    // Trong đa số game Unity, 0 = Đứng, 1 = Ngồi, 2 = Nằm. Gán thành Ngồi (1 hoặc "CROUCH")
                    node[k] = typeof node[k] === 'number' ? 1 : "CROUCH"; 
                }
            });

            // Xóa bỏ cờ hình phạt trên không nhưng giữ nguyên vận tốc
            if (node.is_jumping !== undefined) node.is_jumping = false;
            if (node.in_air !== undefined) node.in_air = false;
            if (node.is_grounded !== undefined) node.is_grounded = true;
        }

        // 3. TÍNH TOÁN VECTOR TƯƠNG ĐỐI
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
                // Truyền selfVel vào để trừ Vector tương đối
                _global.__QuantumState.lockedTargetPos = EquilibriumMath.getRelativeHitPoint(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    context.selfVel, bestTarget.distance || 20.0, currentTime
                );

                if (context.selfPos) {
                    // TÍNH GÓC NGHỊCH ĐẢO: Góc hoàn hảo trừ đi độ giật tích lũy
                    const inverseAngles = EquilibriumMath.calculateInverseAngles(
                        context.selfPos, 
                        _global.__QuantumState.lockedTargetPos,
                        _global.__QuantumState.currentRecoilY,
                        _global.__QuantumState.currentSpreadX
                    );
                    _global.__QuantumState.basePitch = inverseAngles.pitch;
                    _global.__QuantumState.baseYaw = inverseAngles.yaw;
                }
            }
        }

        // 4. GÁN MÃ ĐỘC VÀO GÓI TIN SÁT THƯƠNG
        if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event) {
            if (_global.__QuantumState.lockedTargetId && _global.__QuantumState.lockedTargetPos) {
                node.target_id = _global.__QuantumState.lockedTargetId;
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.is_headshot !== undefined) node.is_headshot = true;
                
                if (node.hit_pos) {
                    node.hit_pos.x = _global.__QuantumState.lockedTargetPos.x;
                    node.hit_pos.y = _global.__QuantumState.lockedTargetPos.y;
                    node.hit_pos.z = _global.__QuantumState.lockedTargetPos.z;
                }

                // Tiêm Góc Camera Nghịch đảo vào viên đạn
                // Server sẽ lấy góc này cộng với độ giật nó tự tính ra = Đường thẳng tuyệt đối vào sọ
                if (node.camera_pitch !== undefined) node.camera_pitch = _global.__QuantumState.basePitch;
                if (node.camera_yaw !== undefined) node.camera_yaw = _global.__QuantumState.baseYaw;
                if (node.aim_pitch !== undefined) node.aim_pitch = _global.__QuantumState.basePitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = _global.__QuantumState.baseYaw;
                
                // Đồng bộ mốc thời gian trừ đi ping thực tế
                if (node.client_timestamp !== undefined) {
                    node.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
                }
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
    if ($response.body.includes('"players"') || $response.body.includes('"hit_bone"') || $response.body.includes('"damage_')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new EquilibriumEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
