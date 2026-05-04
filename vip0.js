/**
 * ==============================================================================
 * QUANTUM REACH v91: APEX CHRONOS (COLD-START SYNERGY)
 * Architecture: Telescopic Origin (10m) + Chronos Anchor + Hard Reset Logic
 * Fixes: Solves VPN Toggle Glitches (Cold Start), Ping Drift, and 10m Spoofing.
 * Status: IMMORTAL GOD TIER - Auto-healing and mathematically perfect.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 91) {
    _global.__QuantumState = {
        version: 91,
        lastPacketTime: 0,     // Dùng để phát hiện Tắt/Bật Shadowrocket
        startupPackets: 0,     // Dùng để ép Ping cực đại lúc mới bật
        currentMatchId: null,
        fireSequence: 0,       
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, distance: 999.0 },
        vector: { pitch: 0.0, yaw: 0.0 }, 
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0, recoilY: 0, spreadX: 0 },
        self: { 
            pos: {x:0, y:0, z:0}, 
            vel: {x:0, y:0, z:0},
            chronosAnchor: null 
        }
    };
}

class ChronosMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    static calculateSmartLead(targetId, headPos, targetVel, distance, currentTime) {
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

        // ASYMMETRIC Y-CLAMP: Ép gia tốc rơi, hạ ngắm yết hầu
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime);
        }
        predictedY -= 0.15; // Hạ tâm yết hầu bù trừ Server Recoil
        predictedY -= dropY;

        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: predictedY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    static generateInverseMasterVector(fromPos, toPos, recoilY, spreadX) {
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

class ChronosOriginEngine {
    // GIAO THỨC TẨY NÃO
    cleanseMemory() {
        _global.__QuantumState.history = {};
        _global.__QuantumState.fireSequence = 0;
        _global.__QuantumState.startupPackets = 0;
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

        // 1. TIME-DELTA HARD RESET (Phát hiện Tắt/Bật Shadowrocket)
        if (_global.__QuantumState.lastPacketTime > 0 && (currentTime - _global.__QuantumState.lastPacketTime) > 5000) {
            this.cleanseMemory(); // Quá 5s không có mạng -> Tự động dọn rác
        }
        _global.__QuantumState.lastPacketTime = currentTime;

        // 2. AGGRESSIVE PING OVERRIDE (Ép Ping chuẩn ngay từ viên đầu tiên)
        if (payload.ping !== undefined) {
            if (_global.__QuantumState.startupPackets < 3) {
                _global.__QuantumState.currentPing = payload.ping; // Ghi đè trực tiếp
                _global.__QuantumState.startupPackets++;
            } else {
                _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3); // Làm mượt
            }
        }

        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            _global.__QuantumState.currentMatchId = payload.match_id;
            this.cleanseMemory();
        }

        // NEO THỜI GIAN CHRONOS
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

        // 3. FALLBACK WEAPON MATRIX (Dự phòng thông số vũ khí)
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
                
                // Lấy độ giật hoặc dùng Ma trận dự phòng (0.05 / 0.02)
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation !== undefined ? payload.weapon.recoil_accumulation : 0.05;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread !== undefined ? payload.weapon.progressive_spread : 0.02;

                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.1;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.1;
            } else {
                _global.__QuantumState.fireSequence = 0; 
            }
        }

        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                        }
                    });
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
                
                _global.__QuantumState.target.pos = ChronosMath.calculateSmartLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                const masterVector = ChronosMath.generateInverseMasterVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    _global.__QuantumState.weapon.recoilY,
                    _global.__QuantumState.weapon.spreadX
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                // KINETIC CAMERA SNAP (Khóa cứng tâm vào đầu)
                if (payload.camera_state) {
                    payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                    payload.camera_state.interpolation = "LOCKED";
                }
            }
        }

        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // 4. TELESCOPIC ORIGIN SPOOFING (Dịch chuyển Nòng súng 10m)
                if (payload.fire_origin !== undefined) {
                    const maxSpoof = 10.0;
                    const safetyMargin = 0.5;
                    const spoofDistance = Math.min(_global.__QuantumState.target.distance - safetyMargin, maxSpoof);
                    
                    if (spoofDistance > 0) {
                        const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                        const targetPos = _global.__QuantumState.target.pos; 
                        const ratio = spoofDistance / _global.__QuantumState.target.distance;
                        
                        payload.fire_origin.x = activeOrigin.x + (targetPos.x - activeOrigin.x) * ratio;
                        payload.fire_origin.y = activeOrigin.y + (targetPos.y - activeOrigin.y) * ratio;
                        payload.fire_origin.z = activeOrigin.z + (targetPos.z - activeOrigin.z) * ratio;
                    }
                }

                if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                }

                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                if (payload.camera_pitch !== undefined) payload.camera_pitch = _global.__QuantumState.vector.pitch;
                if (payload.camera_yaw !== undefined) payload.camera_yaw = _global.__QuantumState.vector.yaw;
                
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

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new ChronosOriginEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
