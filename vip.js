/**
 * ==============================================================================
 * QUANTUM REACH v84: THE ANNIHILATION MATRIX (100% BRUTAL EFFICIENCY)
 * Architecture: Smart Ballistics + Aim Assist Nullification + Ghost Penetration
 * Fixes: Solves Chest-Magnetism, Sniper vs SMG Desync, and Limb-blocking Issues.
 * Status: GOD MODE - Total Client-Server Domination.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 84) {
    _global.__QuantumState = {
        version: 84,
        fireSequence: 0,       
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null },
        vector: { pitch: 0.0, yaw: 0.0 }, 
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0 }, // HITSCAN cho SMG/AR, PROJECTILE cho Sniper
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class AnnihilationMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // ĐỘNG CƠ ĐẠN ĐẠO THÔNG MINH (Smart Ballistics)
    static calculateSmartLead(targetId, headPos, targetVel, distance, currentTime) {
        const GRAVITY = -9.81;
        let flightTime = 0;
        let dropY = 0;

        // Bù trừ Ping nội tại
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;

        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            // Dành cho Sniper (AWM, Kar98k...): Có thời gian bay và rớt đạn
            flightTime = (distance / _global.__QuantumState.weapon.speed) + pingDelay;
            dropY = 0.5 * GRAVITY * (flightTime * flightTime);
        } else {
            // Dành cho SMG/AR/Shotgun: Hitscan, sát thương tức thời, chỉ bù trừ Ping
            flightTime = pingDelay;
            dropY = 0; 
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

        // Trừ Vector tương đối của bản thân
        const relVx = targetVel.x - _global.__QuantumState.self.vel.x;
        const relVy = targetVel.y - _global.__QuantumState.self.vel.y;
        const relVz = targetVel.z - _global.__QuantumState.self.vel.z;

        return { 
            x: headPos.x + relVx * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + relVy * flightTime + 0.5 * accel.y * (flightTime * flightTime) - dropY,
            z: headPos.z + relVz * flightTime + 0.5 * accel.z * (flightTime * flightTime)
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

class MatrixDispatcher {
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

        // Tiêm Tư thế Bóng ma
        const stanceKeys = ['stance', 'pose_id', 'posture'];
        stanceKeys.forEach(k => { if (payload[k] !== undefined) payload[k] = "CROUCH"; });
        if (payload.is_jumping !== undefined) payload.is_jumping = false;

        // NHẬN DIỆN VŨ KHÍ & CHU KỲ KHAI HỎA
        _global.__QuantumState.weapon.isFiring = false;
        
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            
            // Nhận diện loại súng (Smart Ballistic Switch)
            if (payload.weapon.category === "SNIPER" || payload.weapon.id === "AWM" || payload.weapon.id === "KAR98K") {
                _global.__QuantumState.weapon.type = "PROJECTILE";
                _global.__QuantumState.weapon.speed = payload.weapon.bullet_speed || 800.0;
            } else {
                _global.__QuantumState.weapon.type = "HITSCAN";
            }
            
            if (_global.__QuantumState.weapon.isFiring) {
                let recoilY = payload.weapon.recoil_accumulation || payload.weapon.vertical_recoil || 0.0;
                let spreadX = payload.weapon.progressive_spread || payload.weapon.horizontal_recoil || 0.0;

                _global.__QuantumState.fireSequence = (_global.__QuantumState.fireSequence % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireSequence;
                
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.1;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.1;
            } else {
                _global.__QuantumState.fireSequence = 0; 
            }
        }

        // TÍNH TOÁN VECTOR & TRIỆT TIÊU AIM ASSIST GỐC (Zero-Friction)
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                // TRIỆT TIÊU LỰC HÚT VÀO NGỰC CỦA GAME (Aim Assist Nullification)
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                            enemy.hitboxes[part].snap_weight = -9999.0;
                        }
                    });
                }

                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { minDistance = enemy.distance; bestTarget = enemy; }
                }
            }

            if (bestTarget && bestTarget.head_pos && _global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.pos = AnnihilationMath.calculateSmartLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    bestTarget.distance || 20.0, currentTime
                );

                const masterVector = AnnihilationMath.generateInverseMasterVector(
                    _global.__QuantumState.self.pos, 
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

        // XUYÊN THẤU BÓNG MA & ĐỊNH TUYẾN SÁT THƯƠNG (Ghost Penetration)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                
                // Xuyên thấu vi mô (Vô hiệu hóa giảm sát thương qua vật cản)
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                if (payload.wall_bang !== undefined) payload.wall_bang = false; // Lừa máy chủ đây là phát bắn trực tiếp không qua tường
                
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

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new MatrixDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
