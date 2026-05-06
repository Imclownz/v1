/**
 * ==============================================================================
 * QUANTUM REACH v85: THE SINGULARITY (100% ABSOLUTE SYNCHRONIZATION)
 * Architecture: Chronos Anchor + Origin Spoofing + Smart Ballistics + Vector Sync
 * Fixes: CQC Snap Rejection, Kinematic Desync, Hitbox Clipping, Packet Dropping
 * Status: SINGULARITY - Total manipulation of Time, Space, and Engine Physics.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 85) {
    _global.__QuantumState = {
        version: 85,
        fireSequence: 0,
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, distance: 9999.0 },
        vector: { pitch: 0.0, yaw: 0.0 },
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0, recoilY: 0.0, spreadX: 0.0 },
        self: { 
            currentPos: {x:0, y:0, z:0}, 
            anchorPos: {x:0, y:0, z:0}, // Khóa Neo Thời Không (T-1)
            vel: {x:0, y:0, z:0} 
        }
    };
}

class SingularityMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán Điểm Đón Đầu với Khóa Neo Thời Không
    static calculateSingularityLead(targetId, headPos, targetVel, distance, currentTime) {
        const GRAVITY = -9.81;
        let flightTime = 0;
        let dropY = 0;
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;

        // Phân loại Đạn Đạo Thông Minh
        if (_global.__QuantumState.weapon.type === "PROJECTILE") {
            flightTime = (distance / _global.__QuantumState.weapon.speed) + pingDelay;
            dropY = 0.5 * GRAVITY * (flightTime * flightTime);
        } else {
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

        // Vector tương đối: Không dùng currentVel, dùng vận tốc từ Anchor = 0
        return { 
            x: headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime) - dropY,
            z: headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    static calculateInverseVector(fromPos, toPos, recoilY, spreadX) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Trừ Vector Nghịch Đảo
        pitch -= recoilY; 
        yaw -= spreadX;   

        return { pitch, yaw };
    }
}

class SingularityDispatcher {
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processFastPath(payload[i]);
            return payload;
        }

        const currentTime = Date.now();
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;

        // BƯỚC 1: CẬP NHẬT CHRONOS ANCHOR (NEO THỜI KHÔNG)
        if (payload.player_pos) {
            // Lưu tọa độ hiện tại làm Anchor cho khung hình tiếp theo (T-1)
            _global.__QuantumState.self.anchorPos = { ..._global.__QuantumState.self.currentPos };
            _global.__QuantumState.self.currentPos = payload.player_pos;
        }
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        // BƯỚC 2: QUẢN LÝ VŨ KHÍ & CHU KỲ HARMONIC
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
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || payload.weapon.vertical_recoil || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || payload.weapon.horizontal_recoil || 0.0;

                _global.__QuantumState.fireSequence = (_global.__QuantumState.fireSequence % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireSequence;
                
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.1;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.1;
            } else {
                _global.__QuantumState.fireSequence = 0; 
            }
        }

        // BƯỚC 3: XÓA AIM ASSIST VÀ TÍNH TOÁN QUỸ ĐẠO
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                // Zero-Friction: Xóa từ tính của game gốc
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].snap_weight = -9999.0;
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
                _global.__QuantumState.target.pos = SingularityMath.calculateSingularityLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );

                // Tính toán Vector tổng dựa trên Anchor Pos (Điểm tĩnh quá khứ)
                const masterVector = SingularityMath.calculateInverseVector(
                    _global.__QuantumState.self.anchorPos, 
                    _global.__QuantumState.target.pos,
                    _global.__QuantumState.weapon.recoilY,
                    _global.__QuantumState.weapon.spreadX
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                if (payload.camera_state && minDistance > 3.0) {
                    payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                    payload.camera_state.interpolation = "ZERO";
                }
            }
        }

        // BƯỚC 4: THE SINGULARITY EVENT (KHỞI TẠO ĐIỂM KỲ DỊ)
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                
                // Ghost Penetration (Xuyên vật cản/tay chân)
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // Tọa độ mục tiêu
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // KIỂM SOÁT ĐIỂM GỐC BẮN ĐẠN (ORIGIN SPOOFING & CHRONOS ANCHOR)
                if (_global.__QuantumState.target.distance < 3.0) {
                    // CQC (Giao tranh cực gần): Dịch chuyển nòng súng tới sát trán kẻ địch (cách 0.1m)
                    if (payload.fire_origin) {
                        payload.fire_origin.x = _global.__QuantumState.target.pos.x;
                        payload.fire_origin.y = _global.__QuantumState.target.pos.y;
                        payload.fire_origin.z = _global.__QuantumState.target.pos.z - 0.1; // Điểm kỳ dị
                    }
                    // Bỏ qua góc ngắm, vì súng đang kề sát não địch
                } else {
                    // Tầm trung/xa: Ép nòng súng về điểm Neo Thời Không (Tĩnh)
                    if (payload.fire_origin) {
                        payload.fire_origin.x = _global.__QuantumState.self.anchorPos.x;
                        payload.fire_origin.y = _global.__QuantumState.self.anchorPos.y;
                        payload.fire_origin.z = _global.__QuantumState.self.anchorPos.z;
                    }
                    // Truyền góc ngắm nghịch đảo
                    if (payload.camera_pitch !== undefined) payload.camera_pitch = _global.__QuantumState.vector.pitch;
                    if (payload.camera_yaw !== undefined) payload.camera_yaw = _global.__QuantumState.vector.yaw;
                    if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                    if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
                }
                
                // Đồng bộ mốc thời gian trừ đi ping thực tế
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
                }
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

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1 || $response.body.indexOf('"fire_origin"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new SingularityDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
