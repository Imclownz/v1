/**
 * ==============================================================================
 * QUANTUM REACH v90: SPATIAL SINGULARITY (ABSOLUTE pSILENT + HITBOX TELEPORT)
 * Architecture: Space-Bending + Chronos Anchor + Session Annihilation
 * Fixes: Bypasses Angular Snap Rejection, Camera Deadzones, and Hit-Reg Failures.
 * Status: GOD TIER - The screen shoots the floor, the server registers the brain.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

if (!_global.__QuantumState || _global.__QuantumState.version !== 90) {
    _global.__QuantumState = {
        version: 90,
        currentMatchId: null,
        burstCounter: 0,       
        currentPing: 50.0,
        history: {}, 
        target: { id: null, pos: null, distance: 9999.0 },
        internalVector: { pitch: 0.0, yaw: 0.0 }, // Vector ngầm, không tác động lên màn hình
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0 },
        self: { 
            pos: {x:0, y:0, z:0}, 
            vel: {x:0, y:0, z:0},
            chronosAnchor: null 
        }
    };
}

class SingularityMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // DỰ ĐOÁN QUỸ ĐẠO BẤT ĐỐI XỨNG (Cắt bỏ gia tốc nhảy lên)
    static calculateSingularityLead(targetId, headPos, headRadius, targetVel, distance, currentTime) {
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
        let flightTime = pingDelay;
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

        // KHÓA TRỤC Y: Nếu địch nhảy lên, ép gia tốc Y = 0 để đạn không vọt qua đầu
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += (targetVel.y * flightTime) + (0.5 * accel.y * flightTime * flightTime);
        }

        // TỰ ĐỘNG NGẮM YẾT HẦU: Lợi dụng độ giật Server để nảy đạn vào lõi não
        const neckOffset = (headRadius || 0.18) * 0.85; 
        predictedY -= neckOffset; 
        predictedY -= dropY;

        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: predictedY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    // TOÁN HỌC VECTOR NGẦM (Không gửi cho Camera)
    static generateSilentVector(fromPos, toPos, recoilY, spreadX) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        pitch -= recoilY; 
        yaw -= spreadX;   

        return { pitch, yaw };
    }
}

class SingularityEngine {
    // GIAO THỨC TẨY NÃO: Dọn rác bộ nhớ sau mỗi trận
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.history = {}; 
        _global.__QuantumState.burstCounter = 0;
        _global.__QuantumState.self.chronosAnchor = null;
        _global.__QuantumState.target = { id: null, pos: null, distance: 9999.0 };
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        
        // ĐỒNG BỘ PING ĐỘNG
        if (payload.ping !== undefined) {
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        // KÍCH HOẠT TẨY NÃO KHI VÀO TRẬN MỚI
        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            this.cleanseMemory(payload.match_id);
        }
        if (payload.game_state === "SPAWN_ISLAND" || payload.game_state === "STARTING") {
            this.cleanseMemory(_global.__QuantumState.currentMatchId);
        }

        // CHRONOS ANCHOR: Khóa neo tĩnh
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
        }

        // TÌM MỤC TIÊU (Bỏ qua rào cản từ tính)
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

            if (bestTarget && bestTarget.head_pos && _global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                const headRadius = bestTarget.hitboxes?.head?.radius || 0.18;

                // Tính toán vị trí Não bộ thực sự
                _global.__QuantumState.target.pos = SingularityMath.calculateSingularityLead(
                    bestTarget.id, bestTarget.head_pos, headRadius, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                // Tính toán Vector ngầm
                const silentVector = SingularityMath.generateSilentVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    payload.weapon?.recoil_accumulation || 0,
                    payload.weapon?.progressive_spread || 0
                );
                
                _global.__QuantumState.internalVector.pitch = silentVector.pitch;
                _global.__QuantumState.internalVector.yaw = silentVector.yaw;

                // QUAN TRỌNG: KHÔNG ĐƯỢC CHẠM VÀO CAMERA_STATE Ở ĐÂY.
                // Màn hình người chơi giữ nguyên vị trí bắn (dù là bắn xuống đất).
            }
        }

        // HITBOX TELEPORTATION & DAMAGE COMPRESSION
        // Bắt lấy mọi gói tin nổ súng (kể cả bắn trượt ra ngoài)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                
                // 1. Cưỡng chế mục tiêu (Ép gói tin bắn trượt thành bắn trúng)
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // 2. Dịch chuyển Hitbox: Khai báo điểm đập của viên đạn chính là Lõi Não
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // 3. Omni-Origin Spoofing: Kéo nòng súng vật lý đặt sát trán địch
                if (payload.fire_origin !== undefined) {
                    payload.fire_origin.x = _global.__QuantumState.target.pos.x;
                    payload.fire_origin.y = _global.__QuantumState.target.pos.y;
                    payload.fire_origin.z = _global.__QuantumState.target.pos.z + 0.05;
                }
                
                // 4. Chronos Anchor: Giữ cơ thể ở quá khứ[cite: 2]
                if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                }

                // 5. Absolute pSilent: Ghi đè Vector Vật lý, Bỏ qua Vector Màn hình
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.internalVector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.internalVector.yaw;
                
                // 6. Micro-Burst: Nén gói tin, chống rớt đạn
                if (payload.client_timestamp !== undefined) {
                    _global.__QuantumState.burstCounter = (_global.__QuantumState.burstCounter + 1) % 5;
                    const ghostDelay = _global.__QuantumState.burstCounter * 2.0; 
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

// KHỐI THỰC THI O(1)
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"match_id"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new SingularityEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
