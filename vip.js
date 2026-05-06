/**
 * ==============================================================================
 * PROJECT: NEURAL-LINK v100 (THE PUPPET MASTER)
 * Architecture: Kalman Tracking + Spring-Damper Snap + Quantum Barrel
 * Status: APEX - Complete Client Override and Absolute Execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// Khởi tạo Lõi Mạng Thần Kinh
if (!_global.__NeuralState || _global.__NeuralState.version !== 100) {
    _global.__NeuralState = {
        version: 100,
        currentPing: 50.0,
        target: { id: null, pos: null, distance: 9999.0 },
        camera: { pitch: 0.0, yaw: 0.0 }, // Lưu trữ góc nhìn thực tế
        tracker: {}, // Bộ nhớ cho Kalman Filter
        weapon: { isFiring: false, recoilY: 0.0, spreadX: 0.0 },
        self: { pos: {x:0, y:0, z:0} }
    };
}

class NeuralPhysics {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    static lerp(start, end, factor) { return start + (end - start) * factor; }

    // 1. BỘ LỌC KALMAN (Dự đoán Vị trí Tuyệt đối)
    static applyKalmanFilter(targetId, headPos, targetVel, currentTime, ping) {
        const pingDelay = (ping / 1000.0) + 0.016; // Ping + 1 khung hình xử lý
        let accel = { x: 0, y: 0, z: 0 };

        if (_global.__NeuralState.tracker[targetId]) {
            const prev = _global.__NeuralState.tracker[targetId];
            let dt = (currentTime - prev.time) / 1000.0;
            if (dt > 0.01 && dt < 0.2) {
                accel.x = this.clamp((targetVel.x - prev.vel.x) / dt, -40.0, 40.0);
                accel.y = this.clamp((targetVel.y - prev.vel.y) / dt, -40.0, 40.0);
                accel.z = this.clamp((targetVel.z - prev.vel.z) / dt, -40.0, 40.0);
            }
        }
        _global.__NeuralState.tracker[targetId] = { vel: { ...targetVel }, time: currentTime };

        // Hạ trọng tâm 10% bán kính đầu để khóa thẳng vào yết hầu (chống nảy nòng)
        let yOffset = targetVel.y < 0 ? 0 : -0.12; 

        return {
            x: headPos.x + (targetVel.x * pingDelay) + 0.5 * accel.x * (pingDelay * pingDelay),
            y: headPos.y + (targetVel.y * pingDelay) + 0.5 * accel.y * (pingDelay * pingDelay) + yOffset,
            z: headPos.z + (targetVel.z * pingDelay) + 0.5 * accel.z * (pingDelay * pingDelay)
        };
    }

    // 2. VECTOR GÓC NGẮM
    static calculateTargetAngles(fromPos, toPos, recoilY, spreadX) {
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

    // 3. LÒ XO GIẢM CHẤN (Spring-Damper Snap)
    static applySpringDamper(currentAngle, targetAngle, isFiring) {
        // Nếu đang bắn: Kéo nhanh (65% mỗi nhịp). Nếu không bắn: Theo dõi mượt (25% mỗi nhịp)
        const tension = isFiring ? 0.65 : 0.25; 
        
        // Xử lý vòng lặp 360 độ của trục Yaw để chống xoay ngược camera
        let deltaYaw = targetAngle.yaw - currentAngle.yaw;
        if (deltaYaw > 180) deltaYaw -= 360;
        if (deltaYaw < -180) deltaYaw += 360;

        return {
            pitch: currentAngle.pitch + (targetAngle.pitch - currentAngle.pitch) * tension,
            yaw: currentAngle.yaw + deltaYaw * tension
        };
    }
}

class NeuralPuppetMaster {
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.processPayload(payload[i]);
            return payload;
        }

        const currentTime = Date.now();

        // ĐỒNG BỘ MẠNG
        if (payload.ping !== undefined) {
            _global.__NeuralState.currentPing = (_global.__NeuralState.currentPing * 0.7) + (payload.ping * 0.3);
        }

        // ĐỒNG BỘ TỌA ĐỘ VÀ CAMERA CLIENT
        if (payload.player_pos) _global.__NeuralState.self.pos = payload.player_pos;
        if (payload.camera_pitch !== undefined) _global.__NeuralState.camera.pitch = payload.camera_pitch;
        if (payload.camera_yaw !== undefined) _global.__NeuralState.camera.yaw = payload.camera_yaw;
        if (payload.aim_pitch !== undefined) _global.__NeuralState.camera.pitch = payload.aim_pitch;
        if (payload.aim_yaw !== undefined) _global.__NeuralState.camera.yaw = payload.aim_yaw;

        // ĐỌC THÔNG SỐ VŨ KHÍ
        _global.__NeuralState.weapon.isFiring = false;
        if (payload.weapon) {
            _global.__NeuralState.weapon.isFiring = !!(payload.weapon.is_firing || payload.weapon.recoil_accumulation > 0);
            if (_global.__NeuralState.weapon.isFiring) {
                _global.__NeuralState.weapon.recoilY = payload.weapon.recoil_accumulation || 0.0;
                _global.__NeuralState.weapon.spreadX = payload.weapon.progressive_spread || 0.0;
                
                // Nén độ giật ảo trên màn hình
                if (payload.weapon.recoil_accumulation) payload.weapon.recoil_accumulation *= 0.05;
                if (payload.weapon.progressive_spread) payload.weapon.progressive_spread *= 0.05;
            }
        }

        // TÌM KIẾM VÀ KHÓA MỤC TIÊU BẰNG KALMAN FILTER
        if (payload.players && Array.isArray(payload.players)) {
            let bestTarget = null;
            let minDistance = 9999.0;

            for (let i = 0; i < payload.players.length; i++) {
                const enemy = payload.players[i];
                
                // Tắt từ tính rác, ép từ tính cực đại vào Lõi sọ
                if (enemy.hitboxes) {
                    const bodyParts = ['chest', 'spine', 'pelvis', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'neck'];
                    bodyParts.forEach(part => {
                        if (enemy.hitboxes[part]) {
                            enemy.hitboxes[part].priority = "IGNORE";
                            enemy.hitboxes[part].friction = 0.0;
                            enemy.hitboxes[part].magnetism = 0.0;
                        }
                    });
                    if (enemy.hitboxes['head']) {
                        enemy.hitboxes['head'].priority = "ABSOLUTE";
                        enemy.hitboxes['head'].magnetism = 999.0;
                        enemy.hitboxes['head'].friction = 99.0;
                    }
                }

                if (enemy.is_visible !== false && enemy.occluded !== true && enemy.distance < minDistance) { 
                    minDistance = enemy.distance; 
                    bestTarget = enemy; 
                }
            }

            // KÍCH HOẠT CAMERA OVERRIDE
            if (bestTarget && bestTarget.head_pos) {
                _global.__NeuralState.target.id = bestTarget.id;
                _global.__NeuralState.target.distance = minDistance;
                
                // Dự đoán vị trí tương lai bằng Kalman
                _global.__NeuralState.target.pos = NeuralPhysics.applyKalmanFilter(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    currentTime, _global.__NeuralState.currentPing
                );

                // Tính toán Vector ngắm
                const targetAngles = NeuralPhysics.calculateTargetAngles(
                    _global.__NeuralState.self.pos, 
                    _global.__NeuralState.target.pos,
                    _global.__NeuralState.weapon.recoilY,
                    _global.__NeuralState.weapon.spreadX
                );

                // Nếu đang bắn hoặc ngắm: Ép màn hình kéo tâm siêu mượt (Spring-Damper)
                if (_global.__NeuralState.weapon.isFiring || payload.is_aiming) {
                    const smoothAngles = NeuralPhysics.applySpringDamper(
                        _global.__NeuralState.camera, 
                        targetAngles, 
                        _global.__NeuralState.weapon.isFiring
                    );

                    // CƯỠNG ĐOẠT THẨM QUYỀN MÀN HÌNH (Client-Override)
                    if (payload.camera_pitch !== undefined) payload.camera_pitch = smoothAngles.pitch;
                    if (payload.camera_yaw !== undefined) payload.camera_yaw = smoothAngles.yaw;
                    if (payload.aim_pitch !== undefined) payload.aim_pitch = smoothAngles.pitch;
                    if (payload.aim_yaw !== undefined) payload.aim_yaw = smoothAngles.yaw;
                    
                    // Cập nhật lại bộ nhớ camera
                    _global.__NeuralState.camera.pitch = smoothAngles.pitch;
                    _global.__NeuralState.camera.yaw = smoothAngles.yaw;

                    if (payload.camera_state) {
                        payload.camera_state.interpolation = "SMOOTH"; // Báo Server đây là vuốt tự nhiên
                    }
                }
            }
        }

        // BƯỚC CUỐI: QUANTUM BARREL VÀ HÀNH QUYẾT
        if (payload.damage_report || payload.hit_event || payload.bullet_hit || payload.fire_event) {
            if (_global.__NeuralState.target.id && _global.__NeuralState.target.pos) {
                
                // Cưỡng chế Sát thương Đầu
                payload.target_id = _global.__NeuralState.target.id;
                payload.hit_bone = 8;
                payload.is_headshot = true;
                if (payload.ignore_armor !== undefined) payload.ignore_armor = true;

                // QUANTUM BARREL (Bắn Xuyên Không Gian)
                // Kéo nòng súng vào nằm ngay trong Box Đầu kẻ địch
                if (payload.fire_origin !== undefined) {
                    const safetyMargin = 0.3; // Đạn sinh ra cách trán địch 30cm
                    if (_global.__NeuralState.target.distance > safetyMargin) {
                        const origin = _global.__NeuralState.self.pos;
                        const target = _global.__NeuralState.target.pos; 
                        const ratio = (_global.__NeuralState.target.distance - safetyMargin) / _global.__NeuralState.target.distance;
                        
                        payload.fire_origin.x = origin.x + (target.x - origin.x) * ratio;
                        payload.fire_origin.y = origin.y + (target.y - origin.y) * ratio;
                        payload.fire_origin.z = origin.z + (target.z - origin.z) * ratio;
                    } else {
                        payload.fire_origin = { ..._global.__NeuralState.target.pos };
                    }
                }

                if (payload.hit_pos) {
                    payload.hit_pos = { ..._global.__NeuralState.target.pos };
                }
            }
        }

        // Định tuyến quy đệ quy tốc độ cao
        const rootKeys = ['data', 'events', 'payload', 'messages'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key] && (Array.isArray(payload[key]) || typeof payload[key] === 'object')) {
                payload[key] = this.processPayload(payload[key]);
            }
        }

        return payload;
    }
}

// BỘ KÍCH HOẠT XUYÊN MẠNG
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.indexOf('"players"') !== -1 || $response.body.indexOf('"hit_bone"') !== -1 || $response.body.indexOf('"weapon"') !== -1) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = new NeuralPuppetMaster().processPayload(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
