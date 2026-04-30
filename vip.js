/**
 * ==============================================================================
 * QUANTUM REACH v86: THE PHANTOM ORCHESTRA (ESPORTS-TIER INJECTION)
 * Architecture: Elastic Magnetism + ADS Micro-Alignment + Core Projection
 * Fixes: FOV Tracking Failures, Sniper/ADS Snap Rejection, Scope Sway.
 * Status: UNDETECTABLE - Perfect symbiosis with Engine physics and Heuristics.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 86) {
    _global.__QuantumState = {
        version: 86,
        fireSequence: 0,
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, distance: 9999.0 },
        vector: { pitch: 0.0, yaw: 0.0 },
        camera: { currentPitch: 0.0, currentYaw: 0.0, isADS: false, zoomLevel: 1.0 },
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0, recoilY: 0.0, spreadX: 0.0 },
        self: { anchorPos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class PhantomMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán góc nhìn mượt mà (Elastic Smoothing)
    static lerpAngle(start, end, factor) {
        let delta = end - start;
        while (delta < -180.0) delta += 360.0;
        while (delta > 180.0) delta -= 360.0;
        return start + (delta * factor);
    }

    // Tính điểm Đón đầu chiếu thẳng vào lõi Sọ (Core Projection)
    static calculateCoreLead(targetId, headPos, headRadius, targetVel, distance, currentTime) {
        const GRAVITY = -9.81;
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
        let flightTime = pingDelay;
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

        // PHÉP CHIẾU LÕI SỌ: Trừ đi 15% bán kính sọ để ghim vào cuống não
        const coreOffset = headRadius ? (headRadius * 0.15) : 0.05;

        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: (headPos.y - coreOffset) + targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime) - dropY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    // Vi chỉnh Vector cho ADS (Micro-Vector Alignment)
    static calculateElasticVector(fromPos, toPos, recoilY, spreadX, isADS, zoomLevel, currPitch, currYaw) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let targetYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let targetPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Bù trừ giật nghịch đảo
        targetPitch -= recoilY; 
        targetYaw -= spreadX;   

        // CƠ CHẾ RẼ NHÁNH TỪ TÍNH ĐÀN HỒI VS ADS
        if (isADS && zoomLevel > 1.0) {
            // Chế độ Bật Ngắm: Vi chỉnh Vector chia cho hệ số Zoom (Vẩy tâm vi mô)
            const microFactor = 1.0 / zoomLevel; 
            targetPitch = this.lerpAngle(currPitch, targetPitch, microFactor);
            targetYaw = this.lerpAngle(currYaw, targetYaw, microFactor);
        } else {
            // Chế độ Hip-fire: Từ tính Đàn hồi với gia tốc hút mạnh nhưng không gãy góc (T=0.6)
            targetPitch = this.lerpAngle(currPitch, targetPitch, 0.6);
            targetYaw = this.lerpAngle(currYaw, targetYaw, 0.6);
        }

        return { pitch: targetPitch, yaw: targetYaw };
    }
}

class PhantomOrchestrator {
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;

        if (payload.player_pos) {
            _global.__QuantumState.self.anchorPos = { ...payload.player_pos };
        }

        // LỌC ỐNG NGẮM ĐỘC LẬP (Isolated ADS Filter)
        if (payload.camera_state) {
            _global.__QuantumState.camera.currentPitch = payload.camera_state.pitch || 0.0;
            _global.__QuantumState.camera.currentYaw = payload.camera_state.yaw || 0.0;
            _global.__QuantumState.camera.isADS = !!payload.camera_state.is_ads;
            _global.__QuantumState.camera.zoomLevel = payload.camera_state.zoom_level || 1.0;

            if (_global.__QuantumState.camera.isADS) {
                // Đóng băng nhịp thở và rung lắc khi ngắm Sniper
                if (payload.camera_state.sway_amplitude !== undefined) payload.camera_state.sway_amplitude = 0.0;
                if (payload.camera_state.breath_penalty !== undefined) payload.camera_state.breath_penalty = 0.0;
                if (payload.camera_state.sway_speed !== undefined) payload.camera_state.sway_speed = 0.0;
            }
        }

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
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || 0.0;

                _global.__QuantumState.fireSequence = (_global.__QuantumState.fireSequence % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireSequence;
            } else {
                _global.__QuantumState.fireSequence = 0; 
            }
        }

        // TÍNH TOÁN QUỸ ĐẠO & FOV ĐỘNG
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            // FOV Động: Thu hẹp giới hạn tìm kiếm tỷ lệ nghịch với độ xa và ống ngắm
            const baseFOV = 35.0;
            const dynamicFOV = baseFOV / (_global.__QuantumState.camera.zoomLevel);

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    
                    // Xóa Từ Tính Gốc (Zero-Friction)
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

            if (bestTarget && bestTarget.head_pos && _global.__QuantumState.weapon.isFiring) {
                // Kiểm tra Angle FOV (Nếu ngoài vùng FOV Động thì không kích hoạt để chống Anti-Cheat Heuristic)
                const targetYaw = Math.atan2(bestTarget.head_pos.x - _global.__QuantumState.self.anchorPos.x, bestTarget.head_pos.z - _global.__QuantumState.self.anchorPos.z) * (180.0 / Math.PI);
                let yawDelta = Math.abs(_global.__QuantumState.camera.currentYaw - targetYaw);
                if (yawDelta > 180) yawDelta = 360 - yawDelta;

                if (yawDelta <= dynamicFOV) {
                    _global.__QuantumState.target.id = bestTarget.id;
                    _global.__QuantumState.target.distance = minDistance;
                    
                    const headRadius = bestTarget.hitboxes?.head?.m_Radius || 0.2;
                    
                    _global.__QuantumState.target.pos = PhantomMath.calculateCoreLead(
                        bestTarget.id, bestTarget.head_pos, headRadius, bestTarget.velocity || {x:0,y:0,z:0}, 
                        minDistance, currentTime
                    );

                    const elasticVector = PhantomMath.calculateElasticVector(
                        _global.__QuantumState.self.anchorPos, 
                        _global.__QuantumState.target.pos,
                        _global.__QuantumState.weapon.recoilY,
                        _global.__QuantumState.weapon.spreadX,
                        _global.__QuantumState.camera.isADS,
                        _global.__QuantumState.camera.zoomLevel,
                        _global.__QuantumState.camera.currentPitch,
                        _global.__QuantumState.camera.currentYaw
                    );
                    
                    _global.__QuantumState.vector.pitch = elasticVector.pitch;
                    _global.__QuantumState.vector.yaw = elasticVector.yaw;

                    if (payload.camera_state) {
                        payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                        payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                        payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                        payload.camera_state.interpolation = _global.__QuantumState.camera.isADS ? "SMOOTH" : "ZERO";
                    }
                }
            }
        }

        // BẢN GIAO HƯỞNG SÁT THƯƠNG
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // CHỈ sử dụng Origin Spoofing khi KHÔNG Bật Scope và ở cự ly gần
                if (_global.__QuantumState.target.distance < 3.0 && !_global.__QuantumState.camera.isADS) {
                    if (payload.fire_origin) {
                        payload.fire_origin.x = _global.__QuantumState.target.pos.x;
                        payload.fire_origin.y = _global.__QuantumState.target.pos.y;
                        payload.fire_origin.z = _global.__QuantumState.target.pos.z - 0.1;
                    }
                } else {
                    if (payload.fire_origin) {
                        payload.fire_origin.x = _global.__QuantumState.self.anchorPos.x;
                        payload.fire_origin.y = _global.__QuantumState.self.anchorPos.y;
                        payload.fire_origin.z = _global.__QuantumState.self.anchorPos.z;
                    }
                    if (payload.camera_pitch !== undefined) payload.camera_pitch = _global.__QuantumState.vector.pitch;
                    if (payload.camera_yaw !== undefined) payload.camera_yaw = _global.__QuantumState.vector.yaw;
                    if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                    if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new PhantomOrchestrator().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
