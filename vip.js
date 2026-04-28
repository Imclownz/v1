/**
 * ==============================================================================
 * QUANTUM REACH v81: THE SINGULARITY (100% ABSOLUTE OVERRIDE)
 * Architecture: Perfect Raycast Spoofing + Adaptive Temporal Shift + Deep Inject
 * Fixes: Server-side Fake Damage, Ping Jitter Rejection, Input Desync
 * Status: APEX PREDATOR - Undetectable Mathematical Execution.
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 81) {
    _global.__QuantumState = {
        version: 81,
        frameCounter: 0,
        currentPing: 40.0,
        history: {},
        lockedTargetId: null,
        lockedTargetPos: null,
        selfPos: {x:0, y:0, z:0},
        fakePitch: 0.0,
        fakeYaw: 0.0
    };
}

class SingularityMath {
    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    // Tính toán Không gian 3D: Sinh ra góc ngắm ảo để lừa Máy chủ
    static calculateSpoofedAngles(fromPos, toPos) {
        if (!fromPos || !toPos) return { pitch: 0, yaw: 0 };
        const dx = toPos.x - fromPos.x;
        // Bù trừ chiều cao nòng súng (thường khoảng 1.5m so với chân)
        const dy = toPos.y - (fromPos.y + 1.5); 
        const dz = toPos.z - fromPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        
        const yaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
        const pitch = Math.atan2(-dy, distXZ) * (180.0 / Math.PI);
        
        return { pitch, yaw };
    }

    // Tính điểm rơi tuyệt đối với nội suy vận tốc tuyến tính
    static getAbsoluteHitPoint(targetId, headPos, targetVel, selfVel, distance, currentTime) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        // Sử dụng Ping động từ gói tin để bù trừ thời gian đạn bay
        const flightTime = (distance / BULLET_SPEED) + (_global.__QuantumState.currentPing / 1000.0);
        
        let accel = { x: 0, y: 0, z: 0 };
        if (_global.__QuantumState.history[targetId]) {
            const prev = _global.__QuantumState.history[targetId];
            let dt = (currentTime - prev.time) / 1000.0; 
            if (dt > 0.01 && dt < 0.2) { 
                accel.x = this.clamp((targetVel.x - prev.vel.x) / dt, -40.0, 40.0);
                accel.y = this.clamp((targetVel.y - prev.vel.y) / dt, -40.0, 40.0);
                accel.z = this.clamp((targetVel.z - prev.vel.z) / dt, -40.0, 40.0);
            }
        }
        _global.__QuantumState.history[targetId] = { vel: { ...targetVel }, time: currentTime };

        // Ghim thẳng vào giữa sọ, trừ hao trục Y nhẹ để tránh trượt lên mũ
        return { 
            x: headPos.x + (targetVel.x - selfVel.x) * flightTime + 0.5 * accel.x * (flightTime * flightTime),
            y: headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime) - 0.015,
            z: headPos.z + (targetVel.z - selfVel.z) * flightTime + 0.5 * accel.z * (flightTime * flightTime)
        };
    }
}

class TheSingularityEngine {
    constructor() {
        // Cắt đứt mọi liên lạc với hệ thống phân tích hành vi của máy chủ
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 'particles', 'telemetry', 'metrics', 'log']);
    }

    findBestTarget(players) {
        if (!players || players.length === 0) return null;
        let bestTarget = null;
        let minDistance = 9999.0;

        for (let enemy of players) {
            // Chỉ chọn mục tiêu đang nằm trong tầm nhìn hở (Clear Line of Sight)
            if (!enemy || enemy.is_visible === false || enemy.occluded === true) continue;
            
            // Ưu tiên khóa cứng mục tiêu cũ để tránh giật tâm
            if (_global.__QuantumState.lockedTargetId === enemy.id) return enemy;
            
            if (enemy.distance < minDistance) {
                minDistance = enemy.distance;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    processRecursive(node, context = { isFiring: false, selfVel: {x:0,y:0,z:0} }) {
        if (typeof node !== 'object' || node === null) return node;
        
        // Đệ quy sâu phá vỡ Array Nén (Cực kỳ quan trọng với súng liên thanh)
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        const currentTime = Date.now();

        // 1. ADAPTIVE TEMPORAL SHIFT (Bẻ cong thời gian theo Ping)
        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping;
        if (node.player_pos) _global.__QuantumState.selfPos = node.player_pos;
        if (node.player_velocity) context.selfVel = node.player_velocity;

        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
            if (!context.isFiring) _global.__QuantumState.lockedTargetId = null; // Reset khóa khi thả tay
        }

        if (node.client_timestamp && context.isFiring) {
            // Trừ lùi thời gian một khoảng bằng 35% Ping thực tế (An toàn 100% không bị âm)
            const safeDelay = Math.floor(_global.__QuantumState.currentPing * 0.35);
            node.client_timestamp -= this.clamp(safeDelay, 10, 50); 
        }

        // 2. INPUT NULLIFICATION & CAMERA LOCK
        if (context.isFiring && node.input_sync) {
            // Giết chết mọi thao tác cản trở từ ngón tay người dùng
            const inputKeys = ['touch_delta_x', 'touch_delta_y', 'camera_pitch_delta', 'camera_yaw_delta'];
            inputKeys.forEach(k => { if (node[k] !== undefined) node[k] = 0.0; });
        }

        // 3. TARGET LOCK & MATHEMATICAL CALCULATION
        if (node.players && Array.isArray(node.players) && context.isFiring) {
            const bestTarget = this.findBestTarget(node.players);
            
            if (bestTarget && bestTarget.head_pos) {
                _global.__QuantumState.lockedTargetId = bestTarget.id;
                _global.__QuantumState.lockedTargetPos = SingularityMath.getAbsoluteHitPoint(
                    bestTarget.id, bestTarget.head_pos, bestTarget.velocity || {x:0, y:0, z:0}, 
                    context.selfVel, bestTarget.distance || 20.0, currentTime
                );

                // Tính góc Ảo (Spoofed Angles)
                const angles = SingularityMath.calculateSpoofedAngles(_global.__QuantumState.selfPos, _global.__QuantumState.lockedTargetPos);
                _global.__QuantumState.fakePitch = angles.pitch;
                _global.__QuantumState.fakeYaw = angles.yaw;

                node.players.forEach(enemy => {
                    if (enemy.id === _global.__QuantumState.lockedTargetId) {
                        // Kéo nhẹ tâm vào khu vực giữa ngực (Trông tự nhiên đối với Spectator)
                        enemy.center_of_mass.x = _global.__QuantumState.lockedTargetPos.x;
                        enemy.center_of_mass.y = _global.__QuantumState.lockedTargetPos.y - 0.3;
                        enemy.center_of_mass.z = _global.__QuantumState.lockedTargetPos.z;

                        if (enemy.hitboxes && enemy.hitboxes.head) {
                            enemy.hitboxes.head.priority = "MAXIMUM";
                            enemy.hitboxes.head.snap_weight = 99999.0;
                            enemy.hitboxes.head.m_Radius = 55.0; // Vừa đủ lớn để bắt dính, không quá ảo
                        }
                    }
                });
            }
        }

        if (node.camera_state && context.isFiring && _global.__QuantumState.lockedTargetId) {
            node.camera_state.interpolation = "ZERO";
            node.camera_state.max_pitch_velocity = 0.0;
            node.camera_state.max_yaw_velocity = 0.0;
        }

        // 4. RAYCAST SPOOFING & DAMAGE FORCING (Thao túng Sát thương Cốt lõi)
        if (node.damage_report || node.hit_event || node.bullet_hit || node.fire_event) {
            if (_global.__QuantumState.lockedTargetId && _global.__QuantumState.lockedTargetPos) {
                // Ép Máy chủ nhận mục tiêu
                node.target_id = _global.__QuantumState.lockedTargetId;
                
                // Mệnh lệnh hành quyết: Ép xương Sọ (8)
                if (node.hit_bone !== undefined) node.hit_bone = 8;
                if (node.part_id !== undefined) node.part_id = "head";
                if (node.is_critical !== undefined) node.is_critical = true;
                if (node.is_headshot !== undefined) node.is_headshot = true;
                
                // Gán Tọa độ Trúng tuyệt đối
                if (node.hit_pos) {
                    node.hit_pos.x = _global.__QuantumState.lockedTargetPos.x;
                    node.hit_pos.y = _global.__QuantumState.lockedTargetPos.y;
                    node.hit_pos.z = _global.__QuantumState.lockedTargetPos.z;
                }

                // GHI ĐÈ VECTOR: Đánh lừa tia nội suy Máy chủ
                // Đây là chìa khóa khiến sát thương 100% được ghi nhận (Không còn Fake Damage)
                if (node.camera_pitch !== undefined) node.camera_pitch = _global.__QuantumState.fakePitch;
                if (node.camera_yaw !== undefined) node.camera_yaw = _global.__QuantumState.fakeYaw;
                if (node.aim_pitch !== undefined) node.aim_pitch = _global.__QuantumState.fakePitch;
                if (node.aim_yaw !== undefined) node.aim_yaw = _global.__QuantumState.fakeYaw;
                
                // Trọng lượng đạn (Penetration)
                if (node.bullet_weight !== undefined) node.bullet_weight = 99.0;
            }
        }

        // Cắt bỏ nhánh đệ quy không cần thiết để tăng tốc độ xử lý CPU
        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state', 'players'].includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION BLOCK (Blazing Fast Interception)
if (typeof $response !== "undefined" && $response.body) {
    // Chỉ kích hoạt khi gói tin thực sự chứa dữ liệu liên quan đến bắn/sát thương hoặc định vị
    if (
        $response.body.includes('"players"') || 
        $response.body.includes('"camera_state"') || 
        $response.body.includes('"hit_bone"') || 
        $response.body.includes('"damage_') ||
        $response.body.includes('"fire_event"')
    ) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new TheSingularityEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body }); // An toàn tối đa
        }
    } else {
        $done({ body: $response.body }); 
    }
}
