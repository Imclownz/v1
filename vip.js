/**
 * ==============================================================================
 * QUANTUM REACH v83: THE APEX PIPELINE (100% BRUTALITY - EVENT DRIVEN)
 * Architecture: O(1) Direct Path + Harmonic Fire Cycling + Unified Vector Math
 * Fixes: CPU Bottleneck, Math Race Conditions, Spam-Fire Packet Dropping
 * Status: MASTER ARCHITECT - Ultimate Server Domination
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 83) {
    _global.__QuantumState = {
        version: 83,
        currentPing: 50.0,
        history: {},
        lockedTargetId: null,
        finalTargetPos: null,
        finalPitch: 0.0,
        finalYaw: 0.0,
        fireCycle: 1, // Chu kỳ điều hòa 1-2-3 chống Drop đạn
        currentRecoilY: 0.0,
        currentSpreadX: 0.0,
        selfVel: {x:0, y:0, z:0},
        selfPos: null
    };
}

class UnifiedVectorMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán 1 lần duy nhất: Đón đầu Tương đối
    static calculateRelativeLead(targetId, headPos, targetVel, selfVel, distance, currentTime) {
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

        const relVx = targetVel.x - selfVel.x;
        const relVy = targetVel.y - selfVel.y;
        const relVz = targetVel.z - selfVel.z;

        return { 
            x: headPos.x + relVx * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + relVy * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime),
            z: headPos.z + relVz * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    // Tính toán 1 lần duy nhất: Bù trừ Góc Nghịch đảo
    static calculateInverseAngles(fromPos, toPos, recoilY, spreadX) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Tổng hợp lực: Góc hoàn hảo TRỪ đi độ giật súng
        return { 
            pitch: pitch - (recoilY * 1.0), 
            yaw: yaw - (spreadX * 1.0) 
        };
    }
}

class ApexPipelineEngine {
    constructor() {
        this.currentTime = Date.now();
    }

    // ĐỊNH TUYẾN O(1): Xử lý trực tiếp các Object quan trọng thay vì đệ quy mù quáng
    processDirect(payload) {
        if (typeof payload !== 'object' || payload === null) return payload;

        // Nếu là mảng (Batching packets), lặp nhanh qua các phần tử
        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) this.processDirect(payload[i]);
            return payload;
        }

        // ==========================================
        // STAGE 1: ĐỌC TRẠNG THÁI (State Extraction)
        // ==========================================
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;
        if (payload.player_pos) _global.__QuantumState.selfPos = payload.player_pos;
        if (payload.player_velocity) _global.__QuantumState.selfVel = payload.player_velocity;

        let isFiring = false;
        
        // ==========================================
        // STAGE 2: CHU KỲ KHAI HỎA & BÙ TRỪ VŨ KHÍ
        // ==========================================
        if (payload.weapon) {
            isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (isFiring) {
                // Harmonic Fire Cycling (1-2-3 Loop)
                _global.__QuantumState.fireCycle = (_global.__QuantumState.fireCycle % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireCycle; // Đánh lừa AI Server
                
                // Trích xuất độ giật để tạo Ma trận Nghịch đảo
                _global.__QuantumState.currentRecoilY = payload.weapon.recoil_accumulation || payload.weapon.vertical_recoil || 0.0;
                _global.__QuantumState.currentSpreadX = payload.weapon.progressive_spread || payload.weapon.horizontal_recoil || 0.0;
            } else {
                _global.__QuantumState.fireCycle = 0; // Reset khi ngừng bắn
            }
        }
        if (payload.camera_state) isFiring = isFiring || !!payload.camera_state.is_firing;

        // ==========================================
        // STAGE 3: GIẢ MẠO TƯ THẾ (Stance Spoofing)
        // ==========================================
        if (isFiring && (payload.player_state || payload.movement_state || payload.pose !== undefined)) {
            if (payload.stance !== undefined) payload.stance = 1; // 1 = Crouch
            if (payload.pose_id !== undefined) payload.pose_id = "CROUCH";
            if (payload.is_jumping !== undefined) payload.is_jumping = false;
            if (payload.in_air !== undefined) payload.in_air = false;
            if (payload.is_grounded !== undefined) payload.is_grounded = true;
        }

        // ==========================================
        // STAGE 4: TỔNG HỢP VECTOR (Vector Consolidation)
        // ==========================================
        if (isFiring && payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            // Bỏ qua rào cản tầm nhìn (Xuyên Keo/Tường) theo yêu cầu 100% thô bạo
            for (let i = 0; i < payload.players.length; i++) {
                let enemy = payload.players[i];
                if (enemy && enemy.distance < minDistance) {
                    minDistance = enemy.distance;
                    bestTarget = enemy;
                }
            }

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.lockedTargetId = bestTarget.id;
                
                // Toán 1: Lấy tọa độ tương đối
                _global.__QuantumState.finalTargetPos = UnifiedVectorMath.calculateRelativeLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    _global.__QuantumState.selfVel, bestTarget.distance || 20.0, this.currentTime
                );

                if (_global.__QuantumState.selfPos) {
                    // Toán 2: Lấy góc ảo nghịch đảo (Trừ độ giật đi)
                    const angles = UnifiedVectorMath.calculateInverseAngles(
                        _global.__QuantumState.selfPos, 
                        _global.__QuantumState.finalTargetPos,
                        _global.__QuantumState.currentRecoilY,
                        _global.__QuantumState.currentSpreadX
                    );
                    _global.__QuantumState.finalPitch = angles.pitch;
                    _global.__QuantumState.finalYaw = angles.yaw;
                }
            }
        }

        // ==========================================
        // STAGE 5: GHI ĐÈ GÓI TIN CHẾT CHÓC (Forging)
        // ==========================================
        // Xử lý thẳng các mảng events nếu có (Fast Path)
        if (payload.events && Array.isArray(payload.events)) {
            for (let i = 0; i < payload.events.length; i++) {
                this.forgeDamagePacket(payload.events[i]);
            }
        } else {
            this.forgeDamagePacket(payload);
        }

        return payload;
    }

    // Hàm tiện ích: Ép gói tin sát thương MỘT LẦN DUY NHẤT
    forgeDamagePacket(node) {
        if (!node) return;
        if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event || node.type === "hit") {
            if (_global.__QuantumState.lockedTargetId && _global.__QuantumState.finalTargetPos) {
                
                // 1. Gán ID và Xương sọ
                node.target_id = _global.__QuantumState.lockedTargetId;
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.is_headshot !== undefined) node.is_headshot = true;
                
                // 2. Gán Tọa độ đón đầu
                if (node.hit_pos) {
                    node.hit_pos.x = _global.__QuantumState.finalTargetPos.x;
                    node.hit_pos.y = _global.__QuantumState.finalTargetPos.y;
                    node.hit_pos.z = _global.__QuantumState.finalTargetPos.z;
                }

                // 3. Gán Góc Camera Nghịch Đảo
                if (node.camera_pitch !== undefined) node.camera_pitch = _global.__QuantumState.finalPitch;
                if (node.camera_yaw !== undefined) node.camera_yaw = _global.__QuantumState.finalYaw;
                if (node.aim_pitch !== undefined) node.aim_pitch = _global.__QuantumState.finalPitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = _global.__QuantumState.finalYaw;
                
                // 4. Đồng bộ thời gian
                if (node.client_timestamp !== undefined) {
                    node.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
                }
            }
        }
    }
}

// EXECUTION BLOCK (Tốc độ ánh sáng O(1))
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"hit_bone"') || $response.body.includes('"weapon"')) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new ApexPipelineEngine().processDirect(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
