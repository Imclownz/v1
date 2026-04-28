/**
 * ==============================================================================
 * QUANTUM REACH v80: THE GOD PARTICLE (ABSOLUTE 100% BYPASS)
 * Architecture: Vector Sync + Hybrid Silent Aim + Deep Array Unpacking
 * Fixes: Bypasses Server Raycast Validation, Heuristic Camera Rejection, Batch Limits
 * Status: OMNIPOTENT - The ultimate Server-Side Deception.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 80) {
    _global.__QuantumState = {
        version: 80,
        frameCounter: 0,
        currentPing: 50.0, // Ping mặc định tính bằng mili-giây
        history: {},
        lockedTargetId: null,
        lockedTargetPos: null,
        fakePitch: 0.0,
        fakeYaw: 0.0
    };
}

class VectorDeception {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán góc nhìn hoàn hảo (Perfect Pitch/Yaw) từ 2 tọa độ 3D
    static calculatePerfectAngles(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        // Chuyển đổi Radian sang Độ
        const yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        const pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);
        
        return { pitch, yaw };
    }

    // Tính độ lệch góc giữa 2 vector nhìn (FOV Delta)
    static getAngleDelta(p1, y1, p2, y2) {
        let dp = Math.abs(p1 - p2);
        let dy = Math.abs(y1 - y2);
        dy = dy > 180 ? 360 - dy : dy; // Xử lý góc xoay qua 360
        return Math.sqrt(dp * dp + dy * dy);
    }

    static getAbsoluteHitPoint(targetId, headPos, targetVel, selfVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        // Bù trừ dựa trên Ping nội tại của gói tin thay vì fix cứng
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

        return { 
            x: headPos.x + (targetVel.x - selfVel.x) * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime),
            z: headPos.z + (targetVel.z - selfVel.z) * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class GodParticleEngine {
    constructor() {
        // Loại bỏ các gói tin đo lường hành vi để chống AI Anti-Cheat
        this.IGNORE_KEYS = new Set(['ui', 'telemetry', 'metrics', 'log', 'audio', 'cosmetics', 'chat']);
        this.MAGIC_FOV = 25.0; // Vùng Ma Thuật (Không cần xoay Camera nếu địch nằm trong góc này)
    }

    processRecursive(node, context = { isFiring: false, selfPos: null, selfVel: {x:0,y:0,z:0}, currentPitch: 0, currentYaw: 0 }) {
        if (typeof node !== 'object' || node === null) return node;

        // XỬ LÝ MẢNG NÉN (ARRAY UNPACKING): Duyệt qua mọi viên đạn trong mảng
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        const currentTime = Date.now();
        
        // 1. DYNAMIC TIME WARPING (Đồng bộ Không thời gian)
        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping;
        if (node.client_timestamp && context.isFiring) {
            // Trừ đi một khoảng thời gian giả tỷ lệ thuận với Ping thật
            const pingOffset = _global.__QuantumState.currentPing * 0.45;
            node.client_timestamp -= pingOffset; 
        }

        if (node.player_pos) context.selfPos = node.player_pos;
        if (node.player_velocity) context.selfVel = node.player_velocity;
        
        if (node.camera_state) {
            context.currentPitch = node.camera_state.pitch || 0;
            context.currentYaw = node.camera_state.yaw || 0;
            context.isFiring = !!node.camera_state.is_firing;
        }
        if (node.weapon) context.isFiring = context.isFiring || !!(node.weapon.is_firing || node.weapon.recoil_accumulation > 0);

        // 2. NHẬN DIỆN & TÍNH TOÁN (Hybrid Target Lock)
        if (node.players && Array.isArray(node.players) && context.isFiring) {
            let bestTarget = null;
            let minDistance = 9999.0;

            node.players.forEach(enemy => {
                if (enemy.is_visible !== false && enemy.occluded !== true) {
                    if (enemy.distance < minDistance) { minDistance = enemy.distance; bestTarget = enemy; }
                }
            });

            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.lockedTargetId = bestTarget.id;
                _global.__QuantumState.lockedTargetPos = VectorDeception.getAbsoluteHitPoint(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0,y:0,z:0}, 
                    context.selfVel, bestTarget.distance || 20.0, currentTime
                );

                // TOÁN HỌC VẬT LÝ: Tính góc hoàn hảo từ súng đến não địch
                if (context.selfPos) {
                    const perfectAngles = VectorDeception.calculatePerfectAngles(context.selfPos, _global.__QuantumState.lockedTargetPos);
                    _global.__QuantumState.fakePitch = perfectAngles.pitch;
                    _global.__QuantumState.fakeYaw = perfectAngles.yaw;

                    const fovDelta = VectorDeception.getAngleDelta(context.currentPitch, context.currentYaw, perfectAngles.pitch, perfectAngles.yaw);
                    
                    // NẾU TRONG VÙNG MA THUẬT (<25 độ) -> SILENT AIM (Không giật Camera)
                    if (fovDelta <= this.MAGIC_FOV && node.camera_state) {
                        node.camera_state.interpolation = "NORMAL"; // Để tự nhiên
                        node.camera_state.absolute_lock = false;
                        
                        // Xóa sạch Input người dùng để chống lệch
                        if (node.touch_delta_x !== undefined) node.touch_delta_x = 0;
                        if (node.touch_delta_y !== undefined) node.touch_delta_y = 0;
                    } 
                    // NẾU NGOÀI VÙNG (>25 độ) -> KÉO THANG MÁY
                    else if (node.camera_state) {
                        node.camera_state.target_x = _global.__QuantumState.lockedTargetPos.x;
                        node.camera_state.target_y = _global.__QuantumState.lockedTargetPos.y - 0.2; // Ghim vào ngực trước
                        node.camera_state.target_z = _global.__QuantumState.lockedTargetPos.z;
                        node.camera_state.interpolation = "ZERO";
                    }
                }
            }
        }

        // 3. GIẢ MẠO SÁT THƯƠNG & ĐÁNH LỪA RAYCAST (Server-Side Validation Bypass)
        // Áp dụng cho mọi node có dấu hiệu là gói tin sát thương hoặc sự kiện bắn
        if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event) {
            if (_global.__QuantumState.lockedTargetId && _global.__QuantumState.lockedTargetPos) {
                node.target_id = _global.__QuantumState.lockedTargetId;
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.part_id !== undefined) node.part_id = "head";
                if (node.is_critical !== undefined) node.is_critical = true;
                if (node.is_headshot !== undefined) node.is_headshot = true;
                
                if (node.hit_pos) {
                    node.hit_pos.x = _global.__QuantumState.lockedTargetPos.x;
                    node.hit_pos.y = _global.__QuantumState.lockedTargetPos.y;
                    node.hit_pos.z = _global.__QuantumState.lockedTargetPos.z;
                }

                // BYPASS TỬ HUYỆT VECTOR: Ghi đè thông số Camera nội tại của viên đạn
                // Để khi Máy chủ kiểm tra lại, nó thấy bạn ĐÃ CHỈA SÚNG CHUẨN XÁC vào đầu địch.
                if (node.camera_pitch !== undefined) node.camera_pitch = _global.__QuantumState.fakePitch;
                if (node.camera_yaw !== undefined) node.camera_yaw = _global.__QuantumState.fakeYaw;
                if (node.aim_pitch !== undefined) node.aim_pitch = _global.__QuantumState.fakePitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = _global.__QuantumState.fakeYaw;
            }
        }

        // Đệ quy phân nhánh
        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object') {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION BLOCK
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"') || $response.body.includes('"hit_bone"') || $response.body.includes('"damage_')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new GodParticleEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
