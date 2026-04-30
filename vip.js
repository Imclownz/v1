/**
 * ==============================================================================
 * QUANTUM REACH v87: PERFECT SILENT ENGINE (GOD'S WRATH)
 * Architecture: Decoupled pSilent + Predictive Spline + Micro-Burst Async
 * Fixes: Screen Jitter/Rubber-banding, Missing First Shots, Target Tracking Desync.
 * Status: OMNIPOTENT - Maximum Brutality with 100% Client-Side Smoothness.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 87) {
    _global.__QuantumState = {
        version: 87,
        packetQueueCounter: 0,
        currentPing: 50.0,
        history: {},
        target: { id: null, splinePos: {x:0, y:0, z:0}, distance: 9999.0 },
        internalVector: { pitch: 0.0, yaw: 0.0 }, // Vector ngắm ẩn (pSilent)
        weapon: { type: "HITSCAN", speed: 99999.0 },
        self: { currentPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class AdvancedMathematics {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // PREDICTIVE SPLINE CURVE: Dự đoán quỹ đạo theo đường cong thay vì đường thẳng
    static calculateSplineTrajectory(targetId, headPos, targetVel, distance, currentTime) {
        const GRAVITY = -9.81;
        let flightTime = (_global.__QuantumState.currentPing / 1000.0);
        let dropY = 0;

        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            flightTime += (distance / _global.__QuantumState.weapon.speed);
            dropY = 0.5 * GRAVITY * (flightTime * flightTime);
        }
        
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

        // Nội suy Bezier bậc 2 (Dự đoán đường cong Wukong/Tatsuya dash)
        const splineT = flightTime * 1.2; // Bù trừ thêm 20% độ lướt
        const predictedX = headPos.x + (targetVel.x * splineT) + (0.5 * accel.x * splineT * splineT);
        // Trừ đi 10% bán kính Hitbox để ghim vào LÕI SỌ, bất chấp đạn đầu hay đạn cuối
        const predictedY = (headPos.y - 0.05) + (targetVel.y * splineT) + (0.5 * accel.y * splineT * splineT) - dropY;
        const predictedZ = headPos.z + (targetVel.z * splineT) + (0.5 * accel.z * splineT * splineT);

        return { x: predictedX, y: predictedY, z: predictedZ };
    }

    // Tính toán Vector nội bộ (Không ép lên Camera người chơi)
    static calculateInternalVector(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        return {
            yaw: Math.atan2(dx, dz) * (180.0 / Math.PI),
            pitch: Math.atan2(-dy, distXZ) * (180.0 / Math.PI)
        };
    }
}

class PerfectSilentEngine {
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;

        if (payload.player_pos) _global.__QuantumState.self.currentPos = payload.player_pos;
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        // BỎ QUA HOÀN TOÀN CAMERA_STATE - KHÔNG CAN THIỆP ĐỂ GIỮ FRAME RATE MƯỢT 100%
        // (Không lerp, không ép target_x/y/z, để Client tự do)

        // NHẬN DIỆN VŨ KHÍ 
        if (payload.weapon) {
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
        }

        // QUÉT MỤC TIÊU VÀ TÍNH TOÁN QUỸ ĐẠO SPLINE (CHẠY NGẦM)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTarget = enemy; 
                    }
                }
            }

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                // Toán học ngầm: Dự đoán vị trí đầu trong tương lai
                _global.__QuantumState.target.splinePos = AdvancedMathematics.calculateSplineTrajectory(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                // Vector ngầm (Perfect Silent): Hướng nòng súng thực tế
                const internalVec = AdvancedMathematics.calculateInternalVector(
                    _global.__QuantumState.self.currentPos, 
                    _global.__QuantumState.target.splinePos
                );
                
                _global.__QuantumState.internalVector.pitch = internalVec.pitch;
                _global.__QuantumState.internalVector.yaw = internalVec.yaw;
            }
        }

        // BẢN GIAO HƯỞNG HỦY DIỆT: CHỈ CAN THIỆP VÀO GÓI TIN ĐẠN BAY VÀ SÁT THƯƠNG
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.splinePos) {
                
                // Tráo đổi dữ liệu sát thương: 100% Headshot Lõi Sọ
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // Viên đạn đáp thẳng vào điểm dự đoán cong (Spline)
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.splinePos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.splinePos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.splinePos.z;
                }

                // Ghi đè NÒNG SÚNG VẬT LÝ, không ghi đè Camera
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.internalVector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.internalVector.yaw;
                
                // MICRO-BURST ASYNC: Phân phối thời gian giả lập
                if (payload.client_timestamp !== undefined) {
                    // Tăng bộ đếm để tạo độ trễ vi mô 5ms giữa các viên đạn trong cùng 1 cục batch
                    _global.__QuantumState.packetQueueCounter = (_global.__QuantumState.packetQueueCounter + 1) % 10;
                    const asyncMicroDelay = _global.__QuantumState.packetQueueCounter * 5.0; // 0ms, 5ms, 10ms...
                    
                    // Lội ngược thời gian bằng Ping + Độ trễ giả lập
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45) + asyncMicroDelay;
                }
            }
        }

        // Định tuyến O(1) Fast-Path
        const rootKeys = ['data', 'events', 'payload', 'messages'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key] && (Array.isArray(payload[key]) || typeof payload[key] === 'object')) {
                payload[key] = this.processFastPath(payload[key]);
            }
        }

        return payload;
    }
}

// EXECUTION BLOCK (Zero-Latency Trigger)
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new PerfectSilentEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
