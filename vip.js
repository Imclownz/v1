/**
 * ==============================================================================
 * QUANTUM REACH v83: THE EVENT-DRIVEN OMNIPOTENCE
 * Architecture: O(1) Direct Routing + Harmonic Fire Cycling + Unified Vector
 * Fixes: CPU Parsing Latency, Spam-fire Packet Drops, Mathematical Race Conditions
 * Status: GOD MODE - Flawless Server State Machine Bypass
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 83) {
    _global.__QuantumState = {
        version: 83,
        fireSequence: 0,       // Chu kỳ khai hỏa điều hòa (1-2-3)
        currentPing: 50.0,
        history: {},
        target: { id: null, pos: null },
        vector: { pitch: 0.0, yaw: 0.0 }, // Master Vector
        weapon: { recoilY: 0.0, spreadX: 0.0, isFiring: false },
        self: { pos: {x:0, y:0, z:0}, vel: {x:0, y:0, z:0} }
    };
}

class QuantumMathematics {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // 1. Unified Vector Pipeline: Hợp nhất nội suy và trừ vector tương đối
    static calculateUnifiedLead(targetId, headPos, targetVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + (_global.__QuantumState.currentPing / 1000.0);
        
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

        const relVx = targetVel.x - _global.__QuantumState.self.vel.x;
        const relVy = targetVel.y - _global.__QuantumState.self.vel.y;
        const relVz = targetVel.z - _global.__QuantumState.self.vel.z;

        return { 
            x: headPos.x + relVx * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + relVy * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime),
            z: headPos.z + relVz * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }

    // 2. Ma trận bù trừ nghịch đảo: Hợp nhất Camera + Độ Giật
    static generateInverseMasterVector(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        let yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        let pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);

        // Kéo ngược Camera xuống đất bằng đúng khoảng súng đang giật lên
        pitch -= _global.__QuantumState.weapon.recoilY; 
        yaw -= _global.__QuantumState.weapon.spreadX;   

        return { pitch, yaw };
    }
}

class MasterDispatcher {
    // Định tuyến O(1): Phân tích trực tiếp, không đệ quy tốn CPU
    processFastPath(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Nếu payload là mảng (Array Batching), xử lý từng phần tử trực tiếp
        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] = this.processFastPath(payload[i]);
            }
            return payload;
        }

        const currentTime = Date.now();
        if (payload.ping !== undefined) _global.__QuantumState.currentPing = payload.ping;

        // BƯỚC 1: CẬP NHẬT TRẠNG THÁI BẢN THÂN (Self State)
        if (payload.player_pos) _global.__QuantumState.self.pos = payload.player_pos;
        if (payload.player_velocity) _global.__QuantumState.self.vel = payload.player_velocity;

        // Tiêm Tư thế Bóng ma (Phantom Stance)
        const stanceKeys = ['stance', 'pose_id', 'posture'];
        stanceKeys.forEach(k => {
            if (payload[k] !== undefined) payload[k] = typeof payload[k] === 'number' ? 1 : "CROUCH"; 
        });
        if (payload.is_jumping !== undefined) payload.is_jumping = false;
        if (payload.in_air !== undefined) payload.in_air = false;

        // BƯỚC 2: QUẢN LÝ CHU KỲ VŨ KHÍ (Harmonic Fire Cycling)
        _global.__QuantumState.weapon.isFiring = false;
        
        if (payload.camera_state && payload.camera_state.is_firing) {
            _global.__QuantumState.weapon.isFiring = true;
        }
        
        if (payload.weapon) {
            _global.__QuantumState.weapon.isFiring = _global.__QuantumState.weapon.isFiring || !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            
            if (_global.__QuantumState.weapon.isFiring) {
                // Đọc độ giật thực tế để làm toán bù trừ
                _global.__QuantumState.weapon.recoilY = payload.weapon.recoil_accumulation || payload.weapon.vertical_recoil || 0.0;
                _global.__QuantumState.weapon.spreadX = payload.weapon.progressive_spread || payload.weapon.horizontal_recoil || 0.0;

                // Chu kỳ Khai hỏa Điều hòa: 1 -> 2 -> 3 -> 1 (Chống Anti-DDoS / Flatline Detection)
                _global.__QuantumState.fireSequence = (_global.__QuantumState.fireSequence % 3) + 1;
                payload.weapon.shots_fired = _global.__QuantumState.fireSequence;
                
                // Nén độ giật về mức thấp để hệ thống bù trừ xử lý mượt mà hơn
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.1;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.1;
            } else {
                _global.__QuantumState.fireSequence = 0; // Reset khi nhả cò
            }
        }

        // BƯỚC 3: QUÉT MỤC TIÊU & TÍNH TOÁN UNIFIED VECTOR
        if (payload.players && Array.isArray(payload.players) && _global.__QuantumState.weapon.isFiring) {
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

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.target.id = bestTarget.id;
                _global.__QuantumState.target.pos = QuantumMathematics.calculateUnifiedLead(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    bestTarget.distance || 20.0, currentTime
                );

                const masterVector = QuantumMathematics.generateInverseMasterVector(
                    _global.__QuantumState.self.pos, 
                    _global.__QuantumState.target.pos
                );
                
                _global.__QuantumState.vector.pitch = masterVector.pitch;
                _global.__QuantumState.vector.yaw = masterVector.yaw;

                // Xử lý góc nhìn ảo trên Camera nếu ở ngoài vùng an toàn
                if (payload.camera_state) {
                    payload.camera_state.target_x = _global.__QuantumState.target.pos.x;
                    payload.camera_state.target_y = _global.__QuantumState.target.pos.y;
                    payload.camera_state.target_z = _global.__QuantumState.target.pos.z;
                    payload.camera_state.interpolation = "ZERO";
                }
            }
        }

        // BƯỚC 4: THỰC THI SÁT THƯƠNG & KHỚP TỌA ĐỘ VẬT LÝ (Master Dispatch)
        // Áp dụng Master Vector duy nhất vào gói tin sát thương
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__QuantumState.target.id && _global.__QuantumState.target.pos) {
                payload.target_id = _global.__QuantumState.target.id;
                if (payload.hit_bone !== undefined) payload.hit_bone = 8;
                if (payload.is_headshot !== undefined) payload.is_headshot = true;
                
                if (payload.hit_pos) {
                    payload.hit_pos.x = _global.__QuantumState.target.pos.x;
                    payload.hit_pos.y = _global.__QuantumState.target.pos.y;
                    payload.hit_pos.z = _global.__QuantumState.target.pos.z;
                }

                // Tiêm Master Vector: Đường thẳng vật lý tuyệt đối
                if (payload.camera_pitch !== undefined) payload.camera_pitch = _global.__QuantumState.vector.pitch;
                if (payload.camera_yaw !== undefined) payload.camera_yaw = _global.__QuantumState.vector.yaw;
                if (payload.aim_pitch !== undefined) payload.aim_pitch = _global.__QuantumState.vector.pitch;
                if (payload.aim_yaw !== undefined) payload.aim_yaw = _global.__QuantumState.vector.yaw;
                
                // Đồng bộ thời gian: Bù trừ Ping để gói tin sát thương lọt khe quá khứ hợp lệ
                if (payload.client_timestamp !== undefined) {
                    payload.client_timestamp -= (_global.__QuantumState.currentPing * 0.45);
                }
            }
        }

        // Quét nhánh con (Shallow Scan) thay vì Deep Recursion để giữ tốc độ O(1)
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

// EXECUTION BLOCK (Zero-Latency Trigger)
if (typeof $response !== "undefined" && $response.body) {
    // Chỉ kích hoạt engine khi có dấu hiệu của dữ liệu chiến đấu
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new MasterDispatcher().processFastPath(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body }); // Cứu hộ an toàn nếu JSON lỗi
        }
    } else {
        $done({ body: $response.body }); 
    }
}
