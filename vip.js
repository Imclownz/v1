/**
 * ==============================================================================
 * QUANTUM REACH v74: THE SEAMLESS APEX
 * Architecture: 3D Kalman Filter, Linear Interpolation (Lerp), Ping Compensation
 * Fixes: Zero Transition Shock, Continuous Hitbox Scaling, Absolute Lag-Compensation
 * Status: Fluid Humanized Apex - Seamless Execution
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version < 74) {
    _global.__QuantumState = {
        version: 74,
        frameCounter: 0,
        kalmanState: {}, // Trạng thái bộ lọc Kalman cho từng ID
        lastUpdate: {},
        lastFireRate: 0.12,
        currentPing: 0.05 // Mặc định 50ms
    };
}

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static lerp(start, end, t) {
        return start + (end - start) * this.clamp(t, 0, 1);
    }

    // 1. HÀM TÍNH BÁN KÍNH LIÊN TỤC (Continuous Scaling)
    // Bán kính giảm dần theo đường cong hàm mũ khi khoảng cách tăng, không bị giật bậc.
    static getContinuousRadius(distance, isAirborne) {
        const baseRadius = 20.0;
        const maxBonus = 25.0;
        // Bán kính = 20 + 25 * e^(-distance / 40)
        let radius = baseRadius + maxBonus * Math.exp(-distance / 40.0);
        return isAirborne ? radius * 1.25 : radius;
    }

    // 2. LỌC KALMAN 3D ĐƠN GIẢN HÓA (Kalman Filter)
    static filterKalman(targetId, measuredVel) {
        const Q = 0.05; // Nhiễu quá trình (Sự lắt léo của kẻ địch)
        const R = 0.5;  // Nhiễu đo lường (Độ trễ/sai số của gói tin)

        if (!_global.__QuantumState.kalmanState[targetId]) {
            _global.__QuantumState.kalmanState[targetId] = {
                est: { x: measuredVel.x, y: measuredVel.y, z: measuredVel.z },
                err: { x: 1, y: 1, z: 1 }
            };
        }

        let state = _global.__QuantumState.kalmanState[targetId];

        const updateAxis = (axis, measure) => {
            // Dự đoán (Prediction)
            let p_err = state.err[axis] + Q;
            // Cập nhật (Update)
            let K = p_err / (p_err + R); // Kalman Gain
            state.est[axis] = state.est[axis] + K * (measure - state.est[axis]);
            state.err[axis] = (1 - K) * p_err;
            return state.est[axis];
        };

        return {
            x: updateAxis('x', measuredVel.x),
            y: updateAxis('y', measuredVel.y),
            z: updateAxis('z', measuredVel.z)
        };
    }

    // 3. DỰ ĐOÁN PARABOL TÍCH HỢP PING (Latency Compensation)
    static predictSeamless(targetId, targetPos, targetVel, selfVel, distance, isAirborne) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81; 
        
        // CỘNG DỒN PING VÀO THỜI GIAN ĐẠN BAY
        const pingSeconds = _global.__QuantumState.currentPing;
        const flightTime = (distance / BULLET_SPEED) + pingSeconds + 0.001; 
        
        // Khung hình dự đoán tuyến tính theo thời gian bay
        const frames = Math.max(3, Math.min(10, Math.round(distance / 10.0)));
        const dt = flightTime / frames;

        // Lấy vận tốc đã được lọc Kalman
        const kalmanVel = this.filterKalman(targetId, targetVel);

        let pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
        let currentVy = kalmanVel.y;

        for (let i = 0; i < frames; i++) {
            pos.x += (kalmanVel.x - selfVel.x) * dt;
            pos.z += (kalmanVel.z - selfVel.z) * dt;
            pos.y += (currentVy - selfVel.y) * dt + 0.5 * GRAVITY * dt * dt;
            currentVy += GRAVITY * dt;
        }

        // Nhịp thở sinh học siêu nhỏ
        const frame = _global.__QuantumState.frameCounter;
        pos.x += Math.sin(frame * 0.05) * 0.008;
        pos.z += Math.cos(frame * 0.04) * 0.006;

        return pos;
    }
}

class SeamlessApexEngine {
    constructor() {
        this.baseGodWeight = 9500.0;        
        this.baseBalanceWeight = 250.0;
        this.voidWeight = -12000.0;
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 'particles']);
        this.ghostBones = ['root', 'spine', 'pelvis', 'hips', 'arm', 'leg', 'shoulder', 'foot', 'hand', 'neck', 'jaw', 'spine1', 'chest'];
    }

    getShotCount(weapon) {
        return weapon?.shots_fired ?? (weapon?.recoil_accumulation / 0.015 || 0);
    }

    enforceZeroPoint(weapon) {
        if (!weapon) return;
        ['recoil', 'spread', 'bloom', 'camera_shake', 'weapon_sway'].forEach(p => weapon[p] = 0.0);
        weapon.aim_assist_range = 600.0;      
        weapon.auto_aim_angle = 180.0;        
        weapon.bullet_speed = 99999.0;
    }

    // 4. TRỘN TRỌNG SỐ (Weight Blending)
    warpHitboxes(hitboxes, distance, isFiring, shotCount, isAirborne) {
        if (!hitboxes) return;

        this.ghostBones.forEach(bone => {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].m_Radius = 0.000001;
                hitboxes[bone].friction = 0.0;
                hitboxes[bone].vertical_magnetism_multiplier = this.voidWeight * 0.8;
            }
        });

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            
            // Bán kính giãn nở liên tục theo hàm toán học
            hitboxes.head.m_Radius = QuantumMath.getContinuousRadius(distance, isAirborne);

            if (isFiring) {
                // LERP CHUYỂN PHA: Tính tỷ lệ t (từ 0 đến 1) dựa trên số đạn đã bắn
                // Viên 0-2: t = 0 (God Mode). Từ viên thứ 3 đến viên thứ 8: t tăng dần lên 1 (Smooth Mode).
                const transitionFactor = QuantumMath.clamp((shotCount - 2.0) / 6.0, 0.0, 1.0);
                
                // Nội suy mượt mà các chỉ số
                const currentWeight = QuantumMath.lerp(this.baseGodWeight, this.baseBalanceWeight, transitionFactor);
                const currentFriction = QuantumMath.lerp(150.0, 220.0, transitionFactor);
                const currentVmag = QuantumMath.lerp(this.baseGodWeight * 0.9, 120.0, transitionFactor);

                hitboxes.head.snap_weight = currentWeight;
                hitboxes.head.horizontal_magnetism_multiplier = currentWeight * 0.85; 
                hitboxes.head.vertical_magnetism_multiplier = isAirborne ? currentVmag * 1.2 : currentVmag;
                hitboxes.head.friction = currentFriction; 
            } else {
                // Phase 0: Chạy mượt
                hitboxes.head.snap_weight = this.baseBalanceWeight * 0.5;
                hitboxes.head.horizontal_magnetism_multiplier = 80.0;
                hitboxes.head.vertical_magnetism_multiplier = 50.0;
                hitboxes.head.friction = 20.0;
            }
        }
    }

    cleanupMemory() {
        const now = Date.now();
        if (now - _global.__QuantumState.lastCleanup < 5000) return;
        _global.__QuantumState.lastCleanup = now;

        Object.keys(_global.__QuantumState.lastUpdate).forEach(id => {
            if (now - _global.__QuantumState.lastUpdate[id] > 5000) {
                delete _global.__QuantumState.kalmanState[id];
                delete _global.__QuantumState.lastUpdate[id];
            }
        });
    }

    processRecursive(node, context = { selfVel: {x:0,y:0,z:0}, isFiring: false, shotCount: 0 }) {
        if (typeof node !== 'object' || node === null) return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping / 1000.0; // Đọc Ping
        if (node.player_velocity) context.selfVel = node.player_velocity;
        
        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
            context.shotCount = this.getShotCount(node.weapon);
            this.enforceZeroPoint(node.weapon);
        }

        if (node.players && Array.isArray(node.players)) {
            this.cleanupMemory();
            const now = Date.now();

            node.players.forEach(enemy => {
                const id = enemy.id || enemy.uid || 'unknown';
                const isAirborne = Math.abs(enemy.velocity?.y || 0) > 1.15;

                _global.__QuantumState.lastUpdate[id] = now;

                const interceptPos = QuantumMath.predictSeamless(
                    id,
                    enemy.head_pos || enemy.center_of_mass,
                    enemy.velocity || {x:0,y:0,z:0},
                    context.selfVel,
                    enemy.distance || 25.0,
                    isAirborne
                );

                enemy.center_of_mass.x = interceptPos.x;
                enemy.center_of_mass.z = interceptPos.z;
                enemy.center_of_mass.y = interceptPos.y - 0.015;

                this.warpHitboxes(enemy.hitboxes, enemy.distance || 25.0, context.isFiring, context.shotCount, isAirborne);
            });
        }

        // LERP CAMERA INTERPOLATION
        if (node.camera_state && context.isFiring) {
            const t = QuantumMath.clamp((context.shotCount - 2.0) / 6.0, 0.0, 1.0);
            
            if (t < 0.2) {
                // Đầu chuỗi: Snap tuyệt đối
                node.camera_state.interpolation = "ZERO";
                node.camera_state.vertical_sensitivity_multiplier = 0.0; 
                node.camera_state.max_pitch_velocity = 0.0;
            } else {
                // Xả dần độ nhạy (Lerp từ 0.0 lên 0.65)
                node.camera_state.interpolation = "SMOOTH";
                node.camera_state.vertical_sensitivity_multiplier = QuantumMath.lerp(0.0, 0.65, t);
            }
            node.camera_state.lock_bone = "bone_Head";
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            const skipKeys = ['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state'];
            if (typeof node[key] === 'object' && !skipKeys.includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new SeamlessApexEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body });
    }
}
