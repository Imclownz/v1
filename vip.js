/**
 * ==============================================================================
 * QUANTUM REACH v78: THE SPINAL CORD (BONE ELEVATOR EDITION)
 * Architecture: Passive Chest Centering + Dynamic Y-Axis Elevator + ADS Bypass
 * Fixes: Solves Bad Crosshair Placement, Panic Firing, and CQC Instability
 * Status: BRUTAL EXECUTION - Absolute Control Over User Input
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 78) {
    _global.__QuantumState = {
        version: 78,
        frameCounter: 0,
        currentPing: 0.05,
        history: {} 
    };
}

class QuantumKinematics {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static getSpeed(vel) {
        if (!vel) return 0;
        return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    }

    // THANG MÁY KHUNG XƯƠNG: Tính toán độ lệch trục Y dựa trên số viên đạn
    static getElevatorOffset(shotCount, isAiming) {
        // Nếu đang bật Scope ngắm (ADS), bỏ qua thang máy, teleport thẳng lên sọ
        if (isAiming) return 0.0;
        
        // Hip-fire (Chạm bắn thẳng): Kéo tâm từ ngực lên đầu
        if (shotCount <= 1) return -0.65; // Viên 1: Ghim vào giữa ngực (An toàn tuyệt đối)
        if (shotCount <= 2) return -0.25; // Viên 2: Trượt lên cổ
        return 0.0;                       // Viên 3+: Teleport nát sọ
    }

    static predictElevatorLead(targetId, headPos, targetVel, selfVel, distance, currentTime, shotCount, isAiming) {
        const BULLET_SPEED = 99999.0;
        const GRAVITY = -9.81;
        const flightTime = (distance / BULLET_SPEED) + _global.__QuantumState.currentPing + 0.002;
        
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

        // Lấy tọa độ gốc
        let targetX = headPos.x + (targetVel.x - selfVel.x) * flightTime + 0.5 * accel.x * (flightTime * flightTime);
        let targetZ = headPos.z + (targetVel.z - selfVel.z) * flightTime + 0.5 * accel.z * (flightTime * flightTime);
        let targetY = headPos.y + (targetVel.y - selfVel.y) * flightTime + 0.5 * (accel.y + GRAVITY) * (flightTime * flightTime);

        // Áp dụng Thang máy trục Y
        const yOffset = this.getElevatorOffset(shotCount, isAiming);

        return { x: targetX, y: targetY + yOffset - 0.015, z: targetZ };
    }
}

class BoneElevatorEngine {
    constructor() {
        this.absoluteWeight = 99999999.0;
        this.IGNORE_KEYS = new Set(['ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 'particles', 'effects']);
    }

    findBestTarget(players) {
        if (!players || players.length === 0) return null;
        let bestTarget = null;
        let minDistance = 9999.0;

        for (let enemy of players) {
            if (!enemy || enemy.is_visible === false || enemy.occluded === true) continue;
            if (enemy.distance < minDistance) {
                minDistance = enemy.distance;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    processRecursive(node, context = { isFiring: false, isAiming: false, shotCount: 0, selfVel: {x:0,y:0,z:0}, targetId: null, targetPos: null }) {
        if (typeof node !== 'object' || node === null) return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        if (node.ping !== undefined) _global.__QuantumState.currentPing = node.ping / 1000.0;
        if (node.player_velocity) context.selfVel = node.player_velocity;

        // Đọc trạng thái chiến đấu toàn diện
        if (node.weapon || node.camera_state) {
            context.isFiring = !!(node.weapon?.is_firing || node.weapon?.recoil_accumulation > 0 || node.camera_state?.is_firing);
            context.isAiming = !!(node.camera_state?.is_aiming || node.weapon?.is_aiming);
            context.shotCount = node.weapon?.shots_fired ?? (node.weapon?.recoil_accumulation / 0.015 || 0);
        }

        if (node.players && Array.isArray(node.players)) {
            const bestTarget = this.findBestTarget(node.players);
            const currentTime = Date.now();
            
            node.players.forEach(enemy => {
                if (!enemy.hitboxes) return;

                // PHA 0: ĐỊNH TÂM BỊ ĐỘNG (PASSIVE CENTERING)
                if (!context.isFiring) {
                    // Xóa bỏ lực hút vào đầu để không bị giật camera lên trên khi chạy bộ
                    if (enemy.hitboxes.head) {
                        enemy.hitboxes.head.snap_weight = 10.0;
                        enemy.hitboxes.head.friction = 0.0;
                    }
                    // Tạo lực hút tĩnh cực mượt vào vùng ngực/cột sống
                    const chestBones = ['chest', 'spine', 'spine1', 'spine2'];
                    chestBones.forEach(bone => {
                        if (enemy.hitboxes[bone]) {
                            enemy.hitboxes[bone].priority = "HIGH";
                            enemy.hitboxes[bone].snap_weight = 350.0; 
                            enemy.hitboxes[bone].m_Radius = 30.0;     
                            enemy.hitboxes[bone].friction = 80.0;     // Hỗ trợ ghì tâm nhẹ nhàng
                        }
                    });
                }

                // PHA 1 & 2: THANG MÁY TỬ THẦN
                if (bestTarget && enemy.id === bestTarget.id && context.isFiring) {
                    context.targetId = enemy.id;

                    const interceptPos = QuantumKinematics.predictElevatorLead(
                        enemy.id, enemy.head_pos || enemy.center_of_mass, enemy.velocity || {x:0, y:0, z:0}, 
                        context.selfVel, enemy.distance || 20.0, currentTime, context.shotCount, context.isAiming
                    );
                    
                    context.targetPos = interceptPos;

                    // Gán trọng tâm về điểm Thang máy
                    enemy.center_of_mass.x = interceptPos.x;
                    enemy.center_of_mass.y = interceptPos.y;
                    enemy.center_of_mass.z = interceptPos.z;

                    // Bơm phồng Hitbox Đầu tuyệt đối để hứng đạn
                    if (enemy.hitboxes.head) {
                        enemy.hitboxes.head.priority = "ABSOLUTE";
                        enemy.hitboxes.head.m_Radius = 80.0; // Phình to cực đại
                        enemy.hitboxes.head.snap_weight = this.absoluteWeight;
                    }
                }
            });
        }

        // CƯỠNG BỨC GÓC NHÌN THEO THANG MÁY
        if (node.camera_state) {
            if (context.isFiring && context.targetId && context.targetPos) {
                node.camera_state.forced_target_id = context.targetId; 
                node.camera_state.absolute_lock = true;
                
                // Trượt Bone ID linh hoạt
                node.camera_state.lock_bone = context.shotCount <= 1 && !context.isAiming ? "bone_Spine" : "bone_Head";
                node.camera_state.target_bone_id = context.shotCount <= 1 && !context.isAiming ? 4 : 8; // 4 = Spine, 8 = Head
                
                // Đóng băng ngón tay người chơi, tự động nội suy tọa độ
                node.camera_state.interpolation = "ZERO";
                node.camera_state.interpolation_frames = 0;
                node.camera_state.max_pitch_velocity = 0.0;
                node.camera_state.max_yaw_velocity = 0.0;
                
                node.camera_state.target_x = context.targetPos.x;
                node.camera_state.target_y = context.targetPos.y;
                node.camera_state.target_z = context.targetPos.z;
            } else {
                node.camera_state.absolute_lock = false;
                node.camera_state.forced_target_id = null;
                node.camera_state.interpolation = "NORMAL";
            }
        }

        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state', 'players'].includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new BoneElevatorEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); 
    }
}
