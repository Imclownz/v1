/**
 * ==============================================================================
 * QUANTUM REACH v88: EVENT HORIZON (ABSOLUTE AUTOMATION)
 * Architecture: Pure pSilent + Asymmetric Y-Clamp + Pre-emptive Offset + Ghost Burst
 * Fixes: Vertical Overshoot, Desync Mismatch, Recoil Jitter, Target Confusion.
 * Status: GOD TIER - 100% Automated Execution. No Swipe Required.
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
        internalVector: { pitch: 0.0, yaw: 0.0 },
        weapon: { type: "HITSCAN", speed: 99999.0 },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class EventHorizonMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // DỰ ĐOÁN QUỸ ĐẠO VỚI KHÓA TRỤC Y VÀ NGẮM TRỪ HAO
    static calculateExecutionPoint(targetId, headPos, targetVel, distance, currentTime) {
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
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        // 1. GIẢI QUYẾT QUÁN TÍNH VƯỢT QUÁ ĐẦU (Asymmetric Y-Clamp)
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            // Chỉ dự đoán quỹ đạo Y khi địch đang RƠI XUỐNG
            predictedY += (targetVel.y * flightTime) + (0.5 * accel.y * flightTime * flightTime);
        } else {
            // Nếu địch nhảy lên (targetVel.y > 0), ÉP GIA TỐC Y = 0. Không bao giờ đón đầu lên trời.
            predictedY = headPos.y; 
        }

        // 2. NGẮM TRỪ HAO VÀO YẾT HẦU (Pre-emptive Neck Offset)
        // Hạ điểm ngắm xuống 0.15m. Server sẽ tự động cộng độ giật súng đẩy viên đạn nảy lên Lõi Sọ.
        predictedY -= 0.15; 
        predictedY -= dropY; // Trừ hao rớt đạn của Sniper (nếu có)

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

class EventHorizonDispatcher {
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

        // KIẾN TRÚC pSILENT: BỎ QUA HOÀN TOÀN CAMERA. Không can thiệp để giữ FPS mượt 100%.

        if (payload.weapon) {
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
        }

        // TÌM MỤC TIÊU VÀ KHÓA ĐIỂM HÀNH QUYẾT (Chạy ngầm)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    // Xóa hoàn toàn từ tính gốc của Máy chủ
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
                
                // Tính toán điểm hành quyết (Đã giải quyết Quán tính Y)
                _global.__QuantumState.target.executionPos = EventHorizonMath.calculateExecutionPoint(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const silentVec = EventHorizonMath.generateSilentVector(
                    _global.__QuantumState.self.pos, 
                    _global.__QuantumState.target.executionPos
                );
                
                _global.__QuantumState.internalVector.pitch = silentVec.pitch;
                _global.__QuantumState.internalVector.yaw = silentVec.yaw;
            }
        }

        // 3. THỰC THI SÁT THƯƠNG VÀ GHOST BURSTING
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.executionPos) {
                
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // Ghim đạn vào điểm Hành quyết ảo (Yết hầu)
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.executionPos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.executionPos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.executionPos.z;
                }

                // Tiêm Vector ngầm vào nòng súng vật lý
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.internalVector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.internalVector.yaw;
                
                // GHOST BURST: Thao túng Timestamp để nén sát thương
                if (payload.client_timestamp !== undefined) {
                    // Chu kỳ 5 viên đạn, mỗi viên cách nhau đúng 2ms (Micro-delay)
                    _global.__QuantumState.burstCounter = (_global.__QuantumState.burstCounter + 1) % 5;
                    const ghostDelay = _global.__QuantumState.burstCounter * 2.0; 
                    
                    // Lùi thời gian về quá khứ để chống gãy Vector do lướt nhanh
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new EventHorizonDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
