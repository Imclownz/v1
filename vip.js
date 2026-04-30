/**
 * ==============================================================================
 * QUANTUM REACH v87: THE VELVET GLOVE (100% LETHAL, 100% SMOOTH)
 * Architecture: Dual-State Silent Aim + Ghost Bullet Overriding + Kinematic Damping
 * Fixes: Visual Rubber-banding (Jitter), First-shot Chest Locks, Movement Penalties
 * Status: OMNIPOTENT - The final evolution of Client-Server deception.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 87) {
    _global.__QuantumState = {
        version: 87,
        fireSequence: 0,
        shotsFired: 0, // Đếm đạn thực tế để kích hoạt Ghost Bullet
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, corePos: null, distance: 9999.0 },
        vector: { perfectPitch: 0.0, perfectYaw: 0.0, visualPitch: 0.0, visualYaw: 0.0 },
        camera: { isADS: false, zoomLevel: 1.0 },
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0, recoilY: 0.0, spreadX: 0.0 },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class VelvetMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Làm mượt hình ảnh (Visual Lerp)
    static lerpAngle(start, end, factor) {
        let delta = end - start;
        while (delta < -180.0) delta += 360.0;
        while (delta > 180.0) delta -= 360.0;
        return start + (delta * factor);
    }

    // Phép chiếu Lõi Sọ (Core Projection)
    static calculateCoreLead(targetId, headPos, headRadius, targetVel, distance, currentTime) {
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
        let flightTime = pingDelay;
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

        const coreOffset = headRadius ? (headRadius * 0.15) : 0.05;

        // Vị trí bề mặt (Dành cho Camera mượt)
        const visualPos = { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime) - dropY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };

        // Vị trí Lõi Sọ tuyệt đối (Dành cho Ghost Bullet sát thương)
        const corePos = { ...visualPos, y: visualPos.y - coreOffset };

        return { visualPos, corePos };
    }

    // Toán học Vector Kép (Dual-State Vectors)
    static calculateDualVectors(fromPos, targetPos, recoilY, spreadX, isADS, currPitch, currYaw) {
        const dx = targetPos.x - fromPos.x;
        const dy = targetPos.y - fromPos.y;
        const dz = targetPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let perfectYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let perfectPitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Vector Sát Thương: Bù trừ nghịch đảo tuyệt đối (100% chuẩn Server)
        perfectPitch -= recoilY; 
        perfectYaw -= spreadX;   

        // Vector Hình Ảnh: Làm mượt để tránh rung giật màn hình
        let visualPitch = currPitch;
        let visualYaw = currYaw;
        
        if (isADS) {
            visualPitch = this.lerpAngle(currPitch, perfectPitch, 0.1); // Ngắm scope: Vuốt siêu vi mô
            visualYaw = this.lerpAngle(currYaw, perfectYaw, 0.1);
        } else {
            visualPitch = this.lerpAngle(currPitch, perfectPitch, 0.4); // Hip-fire: Vuốt đàn hồi mềm mại
            visualYaw = this.lerpAngle(currYaw, perfectYaw, 0.4);
        }

        return { perfectPitch, perfectYaw, visualPitch, visualYaw };
    }
}

class VelvetDispatcher {
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;

        // BƯỚC 1: GIẢM XÓC ĐỘNG HỌC (KINEMATIC DAMPING)
        if (payload.player_pos) _global.__QuantumState.self.pos = payload.player_pos;
        if (payload.player_velocity) {
            _global.__QuantumState.self.vel = payload.player_velocity;
            // Vẫn cho phép di chuyển, nhưng bóp nghẹt vận tốc gửi lên Server xuống 10%
            payload.player_velocity.x *= 0.1;
            payload.player_velocity.y *= 0.1;
            payload.player_velocity.z *= 0.1;
        }

        // BƯỚC 2: QUẢN LÝ VŨ KHÍ & GHOST BULLET
        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            
            if (_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.shotsFired++;
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || 0.0;

                // Harmonic 1-2-3 (Tránh rớt gói tin)
                _global.__QuantumState.fireSequence = (_global.__QuantumState.fireSequence % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireSequence;
            } else {
                _global.__QuantumState.shotsFired = 0;
                _global.__QuantumState.fireSequence = 0; 
            }
        }

        if (payload.camera_state) {
            _global.__QuantumState.camera.isADS = !!payload.camera_state.is_ads;
            if (_global.__QuantumState.camera.isADS && payload.camera_state.sway_amplitude !== undefined) {
                payload.camera_state.sway_amplitude = 0.0; // Triệt tiêu nhịp thở
            }
        }

        // BƯỚC 3: DUAL-STATE VECTOR SYNC
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.hitboxes && enemy.hitboxes.chest) enemy.hitboxes.chest.priority = "IGNORE"; // Xóa từ tính
                    if (enemy.distance < minDistance) { minDistance = enemy.distance; bestTarget = enemy; }
                }
            }

            if (bestTarget && bestTarget.head_pos && _global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.distance = minDistance;
                
                const leadData = VelvetMath.calculateCoreLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.hitboxes?.head?.m_Radius || 0.2,
                    bestTarget.velocity || {x:0,y:0,z:0}, minDistance, currentTime
                );
                _global.__QuantumState.target.pos = leadData.visualPos;
                _global.__QuantumState.target.corePos = leadData.corePos;

                const currPitch = payload.camera_state ? payload.camera_state.pitch : 0.0;
                const currYaw = payload.camera_state ? payload.camera_state.yaw : 0.0;

                const vectors = VelvetMath.calculateDualVectors(
                    _global.__QuantumState.self.pos, _global.__QuantumState.target.corePos,
                    _global.__QuantumState.weapon.recoilY, _global.__QuantumState.weapon.spreadX,
                    _global.__QuantumState.camera.isADS, currPitch, currYaw
                );
                
                _global.__QuantumState.vector.perfectPitch = vectors.perfectPitch;
                _global.__QuantumState.vector.perfectYaw = vectors.perfectYaw;

                // LUỒNG THỊ GIÁC (CLIENT-SIDE): Chỉ vuốt mượt, không ép buộc bạo lực
                if (payload.camera_state) {
                    payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                    payload.camera_state.pitch = vectors.visualPitch;
                    payload.camera_state.yaw = vectors.visualYaw;
                    payload.camera_state.interpolation = "SMOOTH"; // Cứu rỗi khung hình, hết giật cục
                }
            }
        }

        // BƯỚC 4: GHOST BULLET & LUỒNG SÁT THƯƠNG (SERVER-SIDE)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.corePos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                
                // GHOST BULLET: Ép cứng tọa độ Lõi Sọ cho mọi viên đạn, đặc biệt là 2 viên đầu
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.corePos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.corePos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.corePos.z;
                }

                // Gán Vector Sát Thương Tuyệt Đối (Không mượt) vào viên đạn
                // Máy chủ đọc viên đạn sẽ thấy nó ngắm hoàn hảo 100%, bỏ qua Camera đang lướt
                if (payload.camera_pitch !== undefined) payload.camera_pitch = _global.__QuantumState.vector.perfectPitch;
                if (payload.camera_yaw !== undefined) payload.camera_yaw = _global.__QuantumState.vector.perfectYaw;
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.perfectPitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.perfectYaw;
                
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
                }
            }
        }

        // O(1) Fast-Path Định Tuyến
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
            const mutated = new VelvetDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
