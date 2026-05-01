/**
 * ==============================================================================
 * QUANTUM REACH v90: KINETIC APEX (SYNCHRONIZED DOMINATION)
 * Architecture: Telescopic Origin (10m) + Predictive Camera Snap + Chronos Anchor
 * Status: HIGH-STABILITY - Visibly snaps to target, mathematically perfect trajectory.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 90) {
    _global.__QuantumState = {
        version: 90,
        currentMatchId: null,
        currentPing: 50.0,
        history: {},
        target: { id: null, predictedPos: null, distance: 999.0 },
        weapon: { isFiring: false, recoilY: 0, spreadX: 0 },
        self: { pos: {x:0, y:0, z:0}, chronosAnchor: null }
    };
}

class KineticMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // 1. TÍNH TOÁN TỌA ĐỘ ĐÓN ĐẦU (Dùng cho cả Camera và Sát thương)
    static calculateKineticLead(targetId, headPos, targetVel, distance, currentTime) {
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
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

        // Ép trục Y (Ngăn đạn vọt qua đầu khi địch nhảy)
        let predictedY = headPos.y;
        if (targetVel.y < 0) {
            predictedY += (targetVel.y * pingDelay) + (0.5 * accel.y * pingDelay * pingDelay);
        }

        // Hạ điểm ngắm xuống yết hầu để bù trừ giật Server
        predictedY -= 0.15; 

        return { 
            x: headPos.x + targetVel.x * pingDelay + 0.5 * accel.x * (pingDelay * pingDelay),
            y: predictedY,
            z: headPos.z + targetVel.z * pingDelay + 0.5 * accel.z * (pingDelay * pingDelay)
        };
    }

    // 2. TÍNH TOÁN VECTOR KÉO CAMERA (Bù trừ độ giật)
    static calculateCameraVector(fromPos, toPos, recoilY, spreadX) {
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

class KineticEngine {
    cleanseMemory(newMatchId) {
        _global.__QuantumState.currentMatchId = newMatchId;
        _global.__QuantumState.history = {}; 
        _global.__QuantumState.self.chronosAnchor = null;
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

        // NEO CHRONOS[cite: 2]
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }

        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || 0.0;
            }
        }

        // TÌM MỤC TIÊU & XỬ LÝ CAMERA
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
                
                // Tính điểm đón đầu hoàn hảo
                _global.__QuantumState.target.predictedPos = KineticMath.calculateKineticLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                // Tính Vector Camera
                const camVector = KineticMath.calculateCameraVector(
                    activeOrigin, 
                    _global.__QuantumState.target.predictedPos,
                    _global.__QuantumState.weapon.recoilY,
                    _global.__QuantumState.weapon.spreadX
                );

                // ÉP CAMERA SNAP VÀO ĐẦU (Sử dụng camera_state)
                if (payload.camera_state) {
                    payload.camera_state.target_x = _global.__QuantumState.target.predictedPos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.predictedPos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.predictedPos.z;
                    payload.camera_state.interpolation = "LOCKED"; // Khóa cứng vào mục tiêu
                }
                
                if (payload.camera_pitch !== undefined) payload.camera_pitch = camVector.pitch;
                if (payload.camera_yaw !== undefined) payload.camera_yaw = camVector.yaw;
            }
        }

        // XỬ LÝ SÁT THƯƠNG & TELESCOPIC ORIGIN SPOOFING (Dịch chuyển 10m)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.predictedPos) {
                
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                
                // TELESCOPIC ORIGIN SPOOFING (Mở rộng từ v85)
                if (payload.fire_origin !== undefined) {
                    // Tính toán khoảng cách dịch chuyển an toàn (Tối đa 10m, nhưng luôn cách địch 0.5m)
                    const maxSpoof = 10.0;
                    const safetyMargin = 0.5;
                    const spoofDistance = Math.min(_global.__QuantumState.target.distance - safetyMargin, maxSpoof);
                    
                    if (spoofDistance > 0) {
                        // Nội suy điểm xuất phát đạn trên đường thẳng từ người chơi đến kẻ địch
                        const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                        const targetPos = _global.__QuantumState.target.predictedPos;
                        
                        const ratio = spoofDistance / _global.__QuantumState.target.distance;
                        
                        payload.fire_origin.x = activeOrigin.x + (targetPos.x - activeOrigin.x) * ratio;
                        payload.fire_origin.y = activeOrigin.y + (targetPos.y - activeOrigin.y) * ratio;
                        payload.fire_origin.z = activeOrigin.z + (targetPos.z - activeOrigin.z) * ratio;
                    }
                }
                
                // Khai báo vị trí cơ thể ở quá khứ[cite: 2]
                if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                    payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                }

                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__QuantumState.target.predictedPos };
                }

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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"match_id"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new KineticEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
