/**
 * ==============================================================================
 * QUANTUM REACH v90: PHOENIX CHRONOS (ULTIMATE STABILITY)
 * Architecture: Origin Spoofing + Chronos Anchor + pSilent + Session Cleansing
 * Fixes: Solves Camera Jitter/Rubber-banding & Cross-session Memory Contamination.
 * Status: GOD TIER - Immortal Stability, Zero Recoil Jitter.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// KHỞI TẠO & CẬP NHẬT PHIÊN BẢN (Loại bỏ rác bộ nhớ)
if (!_global.__QuantumState || _global.__QuantumState.version !== 90) {
    _global.__QuantumState = {
        version: 90,
        currentMatchId: null, // Quản lý vòng đời trận đấu
        fireSequence: 0,       
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, distance: 999.0 },
        internalVector: { pitch: 0.0, yaw: 0.0 }, // Thay thế camera vector
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0 },
        self: { 
            pos: {x:0, y:0, z:0}, 
            vel: {x:0, y:0, z:0},
            chronosAnchor: null 
        }
    };
}

class AdvancedChronosMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    static calculateSmartLead(targetId, headPos, headRadius, targetVel, distance, currentTime) {
        const GRAVITY = -9.81;
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
        let flightTime = pingDelay;
        let dropY = 0;

        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            flightTime = (distance / _global.__QuantumState.weapon.speed) + pingDelay;
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

        // KHÓA TRỤC Y BẤT ĐỐI XỨNG & NGẮM YẾT HẦU
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime);
        }
        // Hạ xuống yết hầu để Máy chủ tự cộng độ giật nảy lên
        predictedY -= (headRadius * 0.85);
        predictedY -= dropY;

        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: predictedY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

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

class PhoenixChronosEngine {
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.history = {}; 
        _global.__QuantumState.self.chronosAnchor = null;
        _global.__QuantumState.target = { id: null, pos: null, distance: 999.0 };
    }

    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        
        // CẬP NHẬT PING ĐỘNG
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

        // 1. THIẾT LẬP CHRONOS ANCHOR
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        const stanceKeys = ['stance', 'pose_id', 'posture'];
        stanceKeys.forEach(k => { if (payload[k] !== undefined) payload[k] = "CROUCH"; });
        if (payload.is_jumping !== undefined) payload.is_jumping = false;
        if (payload.in_air !== undefined) payload.in_air = false;

        // BỎ QUA HOÀN TOÀN TÁC ĐỘNG VÀO payload.camera_state ĐỂ GIỮ MƯỢT KHUNG HÌNH

        // 2. NHẬN DIỆN VŨ KHÍ
        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
            
            if (_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.fireSequence = (_global.__QuantumState.fireSequence % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireSequence;
                
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.1;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.1;
            } else {
                _global.__QuantumState.fireSequence = 0; 
            }
        }

        // 3. XỬ LÝ MỤC TIÊU & TÍNH TOÁN NGẦM
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.hitboxes && enemy.hitboxes.chest) {
                    enemy.hitboxes.chest.priority = "IGNORE";
                    enemy.hitboxes.chest.friction = 0.0;
                    enemy.hitboxes.chest.magnetism = 0.0;
                }
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

                _global.__QuantumState.target.pos = AdvancedChronosMath.calculateSmartLead(
                    bestTarget.id, bestTarget.head_pos, headRadius, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                const silentVector = AdvancedChronosMath.generateSilentVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    payload.weapon?.recoil_accumulation || 0,
                    payload.weapon?.progressive_spread || 0
                );
                
                _global.__QuantumState.internalVector.pitch = silentVector.pitch;
                _global.__QuantumState.internalVector.yaw = silentVector.yaw;
            }
        }

        // 4. THỰC THI SÁT THƯƠNG (Áp dụng pSilent và Origin Spoofing)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // ORIGIN SPOOFING: Cận chiến < 3.0 mét
                if (_global.__QuantumState.target.distance < 3.0) {
                    if (payload.fire_origin !== undefined) {
                        payload.fire_origin.x = _global.__QuantumState.target.pos.x + 0.1;
                        payload.fire_origin.y = _global.__QuantumState.target.pos.y;
                        payload.fire_origin.z = _global.__QuantumState.target.pos.z + 0.1;
                    }
                } else {
                    if (payload.fire_origin !== undefined && _global.__QuantumState.self.chronosAnchor) {
                        payload.fire_origin = { ..._global.__QuantumState.self.chronosAnchor };
                    }
                }

                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // Tiêm Vector ngầm thay vì can thiệp Camera
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.internalVector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.internalVector.yaw;
                
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
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

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new PhoenixChronosEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
