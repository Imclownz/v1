/**
 * ==============================================================================
 * QUANTUM REACH v85: HYBRID REGEDIT (THE PERFECT BALANCE)
 * Architecture: Chronos Anchor + Neck-Bridge Magnetism + FOV Safety + Hit Override
 * Fixes: Solves Chest-stickiness (Magnetism Conflict) and 180-degree Snap Rejection.
 * Status: GOD TIER - Blending C++ internal logic with Proxy manipulation.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 85.1) {
    _global.__QuantumState = {
        version: 85.1,
        fireSequence: 0,       
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null, neckPos: null, distance: 999.0, inFOV: false },
        vector: { pitch: 0.0, yaw: 0.0 }, 
        weapon: { isFiring: false, type: "HITSCAN", speed: 99999.0, recoilY: 0, spreadX: 0 },
        self: { 
            pos: {x:0, y:0, z:0}, 
            chronosAnchor: null 
        }
    };
}

class HybridMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán góc xem địch có ở trước mặt không (FOV Check)
    static checkFOV(camYaw, targetYaw, maxFOV = 45.0) {
        if (camYaw === undefined || targetYaw === undefined) return true;
        let delta = Math.abs(camYaw - targetYaw);
        if (delta > 180) delta = 360 - delta;
        return delta <= maxFOV;
    }

    // Tính toán đón đầu nhưng hướng vào Yết hầu (Neck-Bridge)
    static calculateHumanizedLead(targetId, headPos, targetVel, distance, currentTime) {
        const pingDelay = _global.__QuantumState.currentPing / 1000.0;
        let flightTime = pingDelay;
        
        let accel = { x: 0, y: 0, z: 0 };
        if (_global.__QuantumState.history[targetId]) {
            const prev = _global.__QuantumState.history[targetId];
            let dt = (currentTime - prev.time) / 1000.0; 
            if (dt > 0.01 && dt < 0.2) { 
                accel.x = this.clamp((targetVel.x - prev.vel.x) / dt, -30.0, 30.0);
                accel.y = this.clamp((targetVel.y - prev.vel.y) / dt, -30.0, 30.0);
                accel.z = this.clamp((targetVel.z - prev.vel.z) / dt, -30.0, 30.0);
            }
        }
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        const predictedX = headPos.x + targetVel.x * flightTime + 0.5 * accel.x * (flightTime * flightTime);
        const predictedZ = headPos.z + targetVel.z * flightTime + 0.5 * accel.z * (flightTime * flightTime);
        
        let predictedY = headPos.y + targetVel.y * flightTime + 0.5 * accel.y * (flightTime * flightTime);

        return {
            headCore: { x: predictedX, y: predictedY, z: predictedZ }, // Tọa độ sọ thật (để ép sát thương)
            neckBridge: { x: predictedX, y: predictedY - 0.25, z: predictedZ } // Tọa độ yết hầu (để kéo Camera mượt)
        };
    }

    static generateVector(fromPos, toPos, recoilY, spreadX) {
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

class HybridEngine {
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

        // NEO CHRONOS (Bảo toàn vị trí quá khứ để chống rớt mạng)
        if (payload.player_pos) {
            _global.__QuantumState.self.pos = payload.player_pos;
            if (!_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.self.chronosAnchor = { ...payload.player_pos };
            }
        }

        // ĐỌC THÔNG SỐ VŨ KHÍ (Lấy độ giật)
        _global.__QuantumState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (_global.__QuantumState.weapon.isFiring) {
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || 0.0;
                
                // Ép xóa độ giật ảo trên Client (Học từ Regedit)
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.05;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.05;
            }
        }

        // XỬ LÝ MỤC TIÊU
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                // Bẻ gãy từ tính vùng Bụng/Chân, Chuyển từ tính lên Đầu/Cổ
                if (enemy.hitboxes) {
                    const disableParts = ['spine', 'pelvis', 'left_leg', 'right_leg'];
                    disableParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                        }
                    });
                    if (enemy.hitboxes['head']) enemy.hitboxes['head'].magnetism = 99.0;
                    if (enemy.hitboxes['neck']) enemy.hitboxes['neck'].magnetism = 50.0;
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
                
                const leadData = HybridMath.calculateHumanizedLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    minDistance, currentTime
                );
                
                _global.__QuantumState.target.pos = leadData.headCore;
                _global.__QuantumState.target.neckPos = leadData.neckBridge;

                const activeOrigin = _global.__QuantumState.self.chronosAnchor || _global.__QuantumState.self.pos;
                
                // Vector Camera (Nhắm vào Cổ)
                const camVector = HybridMath.generateVector(activeOrigin, leadData.neckBridge, _global.__QuantumState.weapon.recoilY, _global.__QuantumState.weapon.spreadX);
                // Vector Đạn (Nhắm vào Sọ)
                const bulletVector = HybridMath.generateVector(activeOrigin, leadData.headCore, _global.__QuantumState.weapon.recoilY, _global.__QuantumState.weapon.spreadX);

                _global.__QuantumState.vector.pitch = bulletVector.pitch;
                _global.__QuantumState.vector.yaw = bulletVector.yaw;

                // Kiểm tra FOV
                _global.__QuantumState.target.inFOV = HybridMath.checkFOV(payload.camera_yaw, camVector.yaw, 45.0);

                // CAMERA SNAP MƯỢT MÀ VÀO CỔ (Chỉ khi địch ở trước mặt)
                if (payload.camera_state && _global.__QuantumState.target.inFOV) {
                    payload.camera_state.target_x = leadData.neckBridge.x;
                    payload.camera_state.target_y = leadData.neckBridge.y;
                    payload.camera_state.target_z = leadData.neckBridge.z;
                    // BỎ QUÊN interpolation = "ZERO". Dùng SMOOTH để Game không bắt lỗi
                    payload.camera_state.interpolation = "SMOOTH"; 
                }
            }
        }

        // CƯỠNG CHẾ SÁT THƯƠNG ĐẦU & NÒNG SÚNG
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                
                // Lõi Regedit: Đạn bắn trúng đâu cũng bị bẻ thành Đầu
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                if (payload.penetration_ratio !== undefined) payload.penetration_ratio = 1.0;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;
                
                // ORIGIN SPOOFING (Dịch chuyển súng 3 mét thần thánh của v85 gốc)
                if (_global.__QuantumState.target.distance < 3.0) {
                    if (payload.fire_origin !== undefined) {
                        payload.fire_origin = { 
                            x: _global.__QuantumState.target.pos.x + 0.1, 
                            y: _global.__QuantumState.target.pos.y, 
                            z: _global.__QuantumState.target.pos.z + 0.1 
                        };
                    }
                    if (payload.attacker_pos !== undefined) {
                        payload.attacker_pos = { ...payload.fire_origin };
                    }
                } else {
                    if (payload.fire_origin !== undefined && _global.__QuantumState.self.chronosAnchor) {
                        payload.fire_origin = { ..._global.__QuantumState.self.chronosAnchor };
                    }
                    if (payload.attacker_pos !== undefined && _global.__QuantumState.self.chronosAnchor) {
                        payload.attacker_pos = { ..._global.__QuantumState.self.chronosAnchor };
                    }
                }

                // Điểm chạm và Vector đạn luôn hướng vào Sọ
                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__QuantumState.target.pos };
                }

                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
                
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
            const mutated = new HybridEngine().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
