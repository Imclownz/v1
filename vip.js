/**
 * ==============================================================================
 * QUANTUM REACH v88: ABSOLUTE ZERO (THE FINAL SINGULARITY)
 * Architecture: Pure pSilent + Pre-emptive Offset + Y-Axis Clamp + Timestamp Burst
 * Fixes: Server-side Recoil Overshoot, Wukong/Jump Desync, Screen Stuttering.
 * Status: GOD MODE - 100% Automated Execution. No human input required.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 88) {
    _global.__QuantumState = {
        version: 88,
        burstCounter: 0,
        currentPing: 50.0,
        history: {},
        target: { id: null, executionPos: {x:0, y:0, z:0}, distance: 9999.0 },
        stealthVector: { pitch: 0.0, yaw: 0.0 }, // Vector ngầm không hiện lên màn hình
        weapon: { type: "HITSCAN", speed: 99999.0, recoilY: 0.0 },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class AbsoluteMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // 1. DỰ ĐOÁN QUỸ ĐẠO VỚI KHÓA TRỤC Y BẤT ĐỐI XỨNG
    static calculateExecutionLead(targetId, headPos, targetVel, distance, currentTime) {
        let flightTime = (_global.__QuantumState.currentPing / 1000.0);
        let dropY = 0;

        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            flightTime += (distance / _global.__QuantumState.weapon.speed);
            dropY = 0.5 * -9.81 * (flightTime * flightTime);
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

        // KHÓA TRỤC Y: Nếu địch nhảy lên (V_y > 0), ép V_y và Accel_y về 0 để tránh đón đầu lên trời.
        const safeVy = targetVel.y > 0 ? 0.0 : targetVel.y;
        const safeAccY = targetVel.y > 0 ? 0.0 : accel.y;

        const predictedX = headPos.x + (targetVel.x * flightTime) + (0.5 * accel.x * flightTime * flightTime);
        const predictedZ = headPos.z + (targetVel.z * flightTime) + (0.5 * accel.z * flightTime * flightTime);
        
        // 2. NGẮM TRỪ HAO (PRE-EMPTIVE OFFSET): Hạ điểm ngắm xuống Yết Hầu/Cổ
        // Tính toán độ giật dự kiến của Server và chìm tọa độ Y xuống đúng bằng khoảng đó (Khoảng 0.15 - 0.2m)
        const neckOffset = 0.18 + (_global.__QuantumState.weapon.recoilY * 0.02);
        const predictedY = (headPos.y - neckOffset) + (safeVy * flightTime) + (0.5 * safeAccY * flightTime * flightTime) - dropY;

        return { x: predictedX, y: predictedY, z: predictedZ };
    }

    static calculateStealthVector(fromPos, toPos) {
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

class AbsoluteZeroEngine {
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;
        if (payload.player_pos) _global.__QuantumState.self.pos = payload.player_pos;
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        // PURE pSILENT: Hoàn toàn không can thiệp vào payload.camera_state. Màn hình Client giữ nguyên 100% tự nhiên.

        if (payload.weapon) {
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
            _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
        }

        // TÌM KIẾM MỤC TIÊU (CHẠY NGẦM)
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
                
                // Toán học ngầm: Tính điểm hành quyết (Execution Pos) bao gồm Khóa trục Y và Ngắm Yết Hầu
                _global.__QuantumState.target.executionPos = AbsoluteMath.calculateExecutionLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const stealthVec = AbsoluteMath.calculateStealthVector(
                    _global.__QuantumState.self.pos, 
                    _global.__QuantumState.target.executionPos
                );
                
                _global.__QuantumState.stealthVector.pitch = stealthVec.pitch;
                _global.__QuantumState.stealthVector.yaw = stealthVec.yaw;
            }
        }

        // 3. THỰC THI SÁT THƯƠNG VÀ NÉN THỜI GIAN BẤT ĐỒNG BỘ
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.executionPos) {
                
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // Gắn điểm chạm vào Yết hầu (Server sẽ nảy nó lên đầu do Recoil)
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.executionPos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.executionPos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.executionPos.z;
                }

                // Ghi đè Nòng súng vật lý bằng Vector Tàng hình (pSilent)
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.stealthVector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.stealthVector.yaw;
                
                // TIMESTAMP BURSTING: Gom sát thương thành cụm (One-tap Effect)
                if (payload.client_timestamp !== undefined) {
                    _global.__QuantumState.burstCounter = (_global.__QuantumState.burstCounter + 1) % 5;
                    // Tạo một chuỗi đạn bay cách nhau cực ngắn (2ms) trong quá khứ để tránh gãy Vector
                    const microCompression = _global.__QuantumState.burstCounter * 2.0; 
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45) + microCompression;
                }
            }
        }

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

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new AbsoluteZeroEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
