/**
 * ==============================================================================
 * QUANTUM REACH v89: THE PHOENIX PROTOCOL (IMMORTAL STATE)
 * Architecture: Session Annihilation + Dynamic Ping Calib + Auto-Scale Neck Offset
 * Fixes: Memory Ghosting, Late-game Inaccuracy, Time-Sync Drift, Hitbox Variances.
 * Status: IMMORTAL - 100% Automated, self-cleaning, and adaptive network execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// KHỞI TẠO HOẶC NÂNG CẤP PHIÊN BẢN (Không giữ lại rác bộ nhớ cũ)
if (!_global.__QuantumState || _global.__QuantumState.version !== 89) {
    _global.__QuantumState = {
        version: 89,
        currentMatchId: null,
        burstCounter: 0,
        currentPing: 50.0,
        history: {}, // Lịch sử tọa độ (Sẽ bị reset mỗi trận)
        target: { id: null, executionPos: {x:0, y:0, z:0}, distance: 9999.0 },
        internalVector: { pitch: 0.0, yaw: 0.0 },
        weapon: { type: "HITSCAN", speed: 99999.0 },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class PhoenixMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // DỰ ĐOÁN QUỸ ĐẠO VỚI KHÓA TRỤC Y VÀ AUTO-SCALING NECK OFFSET
    static calculateExecutionPoint(targetId, headPos, headRadius, targetVel, distance, currentTime) {
        let flightTime = (_global.__QuantumState.currentPing / 1000.0);
        let dropY = 0;

        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            const GRAVITY = -9.81;
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
        // Lưu lịch sử tọa độ mới
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        // 1. Asymmetric Y-Clamp (Chống đạn vọt qua đầu)
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += (targetVel.y * flightTime) + (0.5 * accel.y * flightTime * flightTime);
        }

        // 2. TỰ ĐỘNG CO GIÃN ĐIỂM NGẮM YẾT HẦU (Auto-Scale Neck Offset)
        // Thay vì trừ cứng 0.15m, hệ thống tính toán dựa trên bán kính đầu thực tế.
        // Hạ xuống 85% bán kính đầu để luôn chạm đúng vào Yết hầu bất kể nhân vật nào.
        const dynamicNeckOffset = headRadius * 0.85; 
        predictedY -= dynamicNeckOffset; 
        predictedY -= dropY; 

        const predictedX = headPos.x + (targetVel.x * flightTime) + (0.5 * accel.x * flightTime * flightTime);
        const predictedZ = headPos.z + (targetVel.z * flightTime) + (0.5 * accel.z * flightTime * flightTime);

        return { x: predictedX, y: predictedY, z: predictedZ };
    }

    static generateSilentVector(fromPos, toPos) {
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

class PhoenixDispatcher {
    // GIAO THỨC TẨY NÃO (Session Annihilation)
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.history = {}; // Quét sạch rác tọa độ
        _global.__QuantumState.burstCounter = 0; // Reset nhịp đạn
        _global.__QuantumState.target = { id: null, executionPos: {x:0, y:0, z:0}, distance: 9999.0 };
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();

        // ĐỒNG BỘ PING THỜI GIAN THỰC (Dynamic Ping Calibration)
        if (payload.ping !== undefined) {
            // Làm mượt độ nhiễu Ping để tránh giật cục khi lùi thời gian
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        // KIỂM TRA TRẬN ĐẤU MỚI (Trigger Tẩy Não)
        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            this.cleanseMemory(payload.match_id);
        }
        if (payload.game_state === "SPAWN_ISLAND" || payload.game_state === "STARTING") {
            this.cleanseMemory(_global.__QuantumState.currentMatchId);
        }

        if (payload.player_pos) _global.__QuantumState.self.pos = payload.player_pos;
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        // KIẾN TRÚC pSILENT: Hoàn toàn không đụng vào camera_state

        if (payload.weapon) {
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
        }

        // TÌM MỤC TIÊU & TÍNH TOÁN (Chạy ngầm)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.hitboxes && enemy.hitboxes.chest) {
                        enemy.hitboxes.chest.priority = "IGNORE";
                        enemy.hitboxes.chest.magnetism = 0.0;
                    }
                    if (enemy.distance < minDistance) { 
                        minDistance = enemy.distance; 
                        bestTarget = enemy; 
                    }
                }
            }

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                // Lấy bán kính đầu động để tính yết hầu
                const headRadius = bestTarget.hitboxes?.head?.radius || 0.18;
                
                _global.__QuantumState.target.executionPos = PhoenixMath.calculateExecutionPoint(
                    bestTarget.id, bestTarget.head_pos, headRadius, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const silentVec = PhoenixMath.generateSilentVector(
                    _global.__QuantumState.self.pos, 
                    _global.__QuantumState.target.executionPos
                );
                
                _global.__QuantumState.internalVector.pitch = silentVec.pitch;
                _global.__QuantumState.internalVector.yaw = silentVec.yaw;
            }
        }

        // 3. THỰC THI SÁT THƯƠNG & NÉN GÓI TIN ĐỘNG (Dynamic Ghost Bursting)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.executionPos) {
                
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // Đóng đinh đạn vào tọa độ Yết hầu
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.executionPos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.executionPos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.executionPos.z;
                }

                // Tiêm Vector ngầm
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.internalVector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.internalVector.yaw;
                
                if (payload.client_timestamp !== undefined) {
                    _global.__QuantumState.burstCounter = (_global.__QuantumState.burstCounter + 1) % 5;
                    const ghostDelay = _global.__QuantumState.burstCounter * 2.0; 
                    
                    // Lùi thời gian cực kỳ chính xác nhờ Ping đã được làm mượt
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45) + ghostDelay;
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"match_id"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new PhoenixDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
