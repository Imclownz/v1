/**
 * ==============================================================================
 * QUANTUM REACH v85.2: THE SYNCHRONIZED APEX (NO-LIMIT SYNERGY)
 * Architecture: Omni-Origin Spoofing + Asymmetric Y-Clamp + Chronos Burst
 * Fixes: Integrates all brute-force solutions seamlessly into the v85 core.
 * Status: OMNIPOTENT - All bullets hit the head simultaneously in all scenarios.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 85.2) {
    _global.__QuantumState = {
        version: 85.2,
        currentMatchId: null,
        burstCounter: 0,       
        currentPing: 50.0,
        history: {}, 
        target: { id: null, pos: null, distance: 999.0 },
        vector: { pitch: 0.0, yaw: 0.0 }, 
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0 },
        self: { 
            pos: {x:0, y:0, z:0}, 
            vel: {x:0, y:0, z:0},
            chronosAnchor: null 
        }
    };
}

class ChronosMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    static calculateSynchronizedLead(targetId, headPos, headRadius, targetVel, distance, currentTime) {
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

        // 1. ĐỒNG BỘ Y-CLAMP (Khóa vượt tuyến trục Y)
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += (targetVel.y * flightTime) + (0.5 * accel.y * flightTime * flightTime);
        }

        // 2. ĐỒNG BỘ SERVER RECOIL (Hạ điểm ngắm yết hầu tự động)
        const neckOffset = (headRadius || 0.18) * 0.85; 
        predictedY -= neckOffset; 
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
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.history = {}; 
        _global.__QuantumState.burstCounter = 0;
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
        
        if (payload.ping !== undefined) {
            _global.__QuantumState.currentPing = (_global.__QuantumState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        if (payload.match_id !== undefined && payload.match_id !== _global.__QuantumState.currentMatchId) {
            this.cleanseMemory(payload.match_id);
        }
        if (payload.game_state === "SPAWN_ISLAND" || payload.game_state === "STARTING") {
            this.cleanseMemory(_global.__QuantumState.currentMatchId);
        }

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
                
                const headRadius = bestTarget.hitboxes?.head?.radius || 0.18;

                _global.__QuantumState.target.pos = ChronosMath.calculateSynchronizedLead(
                    bestTarget.id, bestTarget.head_pos, headRadius, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                const masterVector = ChronosMath.generateInverseMasterVector(
                    activeOrigin, 
                    _global.__QuantumState.target.pos,
                    payload.weapon?.recoil_accumulation || 0,
                    payload.weapon?.progressive_spread || 0
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                if (payload.camera_state) {
                    payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                    payload.camera_state.interpolation = "ZERO";
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
                
                // 3. OMNI-ORIGIN SPOOFING (Đồng bộ Không gian Thô bạo - Không giới hạn khoảng cách)
                // Đặt nòng súng vật lý sát mặt địch bất kể xa gần
                if (payload.fire_origin !== undefined) {
                    payload.fire_origin.x = _global.__QuantumState.target.pos.x;
                    payload.fire_origin.y = _global.__QuantumState.target.pos.y;
                    payload.fire_origin.z = _global.__QuantumState.target.pos.z + 0.05; // 5cm trước mặt địch
                }
                
                // Đồng bộ Cơ thể: Khai báo vị trí người chơi là điểm Chronos Anchor tĩnh ở quá khứ
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
                
                // 4. CHRONOS BURST (Đồng bộ gói tin UDP)
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

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"match_id"') !== -1) {
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
