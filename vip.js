/**
 * ==============================================================================
 * QUANTUM REACH v88: THE VELVET GLOVE (HUMAN-ALGORITHM SYNERGY)
 * Architecture: Intent Synergy + ABS Braking + Dynamic Hitbox Expansion
 * Fixes: Target Confusion, Over-swiping, Anti-Cheat Heuristic Flags
 * Status: APEX PREDATOR - 100% Brutality cloaked in Human Mechanics.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 88) {
    _global.__QuantumState = {
        version: 88,
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: {x:0, y:0, z:0}, fov: 999.0 },
        camera: { pitch: 0.0, yaw: 0.0, isADS: false, zoom: 1.0 },
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0 },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} },
        
        // Ngưỡng cấu hình Bàn Tay Bọc Nhung
        config: {
            absThreshold: 8.0,      // Phanh ABS dính tâm nếu cách đầu < 8 độ
            funnelThreshold: 20.0,  // Phễu hút đạn nếu cách đầu < 20 độ
            coreOffsetRatio: 0.15   // Bắn vào lõi cuống não (trừ 15% bán kính)
        }
    };
}

class VelvetMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán góc lệch FOV (Dựa vào hướng nhìn hiện tại của Camera người chơi)
    static calculateFOV(camPitch, camYaw, targetPitch, targetYaw) {
        let yawDelta = Math.abs(camYaw - targetYaw);
        if (yawDelta > 180) yawDelta = 360 - yawDelta;
        let pitchDelta = Math.abs(camPitch - targetPitch);
        return Math.sqrt((yawDelta * yawDelta) + (pitchDelta * pitchDelta));
    }

    // Tính toán Vector Tuyệt đối
    static calculateAbsoluteVector(fromPos, toPos) {
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

    // Dự đoán Quỹ đạo & Lõi Sọ (Core Projection)
    static calculateCoreLead(targetId, headPos, targetVel, distance, headRadius, currentTime) {
        const GRAVITY = -9.81;
        let flightTime = (_global.__QuantumState.currentPing / 1000.0);
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
                // Khóa Trục Y Bất Đối Xứng (Ngăn đạn vọt qua đầu khi địch nhảy)
                if (accel.y > 0) accel.y = 0; 
            }
        }
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        const coreOffset = headRadius ? (headRadius * _global.__QuantumState.config.coreOffsetRatio) : 0.05;

        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: (headPos.y - coreOffset) + targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime) - dropY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class VelvetOrchestrator {
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

        // CẬP NHẬT GÓC NHÌN NGƯỜI CHƠI (Để phân tích ý định vuốt)
        if (payload.camera_state) {
            if (payload.camera_state.pitch !== undefined) _global.__QuantumState.camera.pitch = payload.camera_state.pitch;
            if (payload.camera_state.yaw !== undefined) _global.__QuantumState.camera.yaw = payload.camera_state.yaw;
            if (payload.camera_state.is_ads !== undefined) _global.__QuantumState.camera.isADS = payload.camera_state.is_ads;
            if (payload.camera_state.zoom_level !== undefined) _global.__QuantumState.camera.zoom = payload.camera_state.zoom_level;
        }

        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
        }

        // BƯỚC 1: LỰA CHỌN MỤC TIÊU THEO Ý ĐỊNH NGƯỜI CHƠI (INTENT SYNERGY)
        let hasValidTarget = false;
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minFOV = 999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                if (enemy.is_visible !== false && enemy.occluded !== true && enemy.head_pos) {
                    
                    const tempVector = VelvetMath.calculateAbsoluteVector(_global.__QuantumState.self.pos, enemy.head_pos);
                    const fovToEnemy = VelvetMath.calculateFOV(
                        _global.__QuantumState.camera.pitch, 
                        _global.__QuantumState.camera.yaw, 
                        tempVector.pitch, 
                        tempVector.yaw
                    );

                    // Chỉ chọn mục tiêu GẦN TÂM SÚNG NHẤT thay vì gần khoảng cách nhất
                    if (fovToEnemy < minFOV) {
                        minFOV = fovToEnemy;
                        bestTarget = enemy;
                    }
                }
            }

            if (bestTarget) {
                hasValidTarget = true;
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.fov = minFOV;
                const headRadius = bestTarget.hitboxes?.head?.m_Radius || 0.2;
                
                _global.__QuantumState.target.pos = VelvetMath.calculateCoreLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    bestTarget.distance || 20.0, headRadius, currentTime
                );
            }
        }

        // BƯỚC 2: KÍCH HOẠT PHANH ABS (CHỐNG VƯỢT TRỚN KHI VUỐT TAY)
        if (hasValidTarget && payload.camera_state) {
            const dynamicAbsThreshold = _global.__QuantumState.config.absThreshold / _global.__QuantumState.camera.zoom;
            
            // Nếu ngón tay bạn đã vuốt đưa tâm súng vào Vùng Chết (VD: < 8 độ)
            if (_global.__QuantumState.target.fov <= dynamicAbsThreshold) {
                const perfectVector = VelvetMath.calculateAbsoluteVector(_global.__QuantumState.self.pos, _global.__QuantumState.target.pos);
                
                // KÍCH HOẠT PHANH: Khóa chết góc Camera trong gói tin gửi lên Server
                // Server sẽ nhận được góc ngắm Hoàn Hảo, dù quán tính tay của bạn vẫn đang vuốt ra ngoài
                payload.camera_state.pitch = perfectVector.pitch;
                payload.camera_state.yaw = perfectVector.yaw;
                if (payload.camera_state.interpolation !== undefined) payload.camera_state.interpolation = "LOCKED";
            }
        }

        // BƯỚC 3: MỞ RỘNG PHỄU HỨNG ĐẠN (DYNAMIC HITBOX EXPANSION)
        if (hasValidTarget && (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event)) {
            const dynamicFunnel = _global.__QuantumState.config.funnelThreshold / _global.__QuantumState.camera.zoom;
            
            // Nếu bạn nổ súng và mục tiêu nằm trong Phễu (VD: < 20 độ)
            if (_global.__QuantumState.target.fov <= dynamicFunnel) {
                
                // Cưỡng chế mọi viên đạn bay vào Lõi Sọ
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // Gắn Vector ẩn cho viên đạn để chống giằng co
                const internalVec = VelvetMath.calculateAbsoluteVector(
                    payload.fire_origin || _global.__QuantumState.self.pos, 
                    _global.__QuantumState.target.pos
                );
                
                if (payload.aim_pitch !== undefined) payload.aim_pitch = internalVec.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = internalVec.yaw;
            }
        }

        // Định tuyến O(1) Fast-Path
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
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"camera_state"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new VelvetOrchestrator().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
