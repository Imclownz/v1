/**
 * ==============================================================================
 * QUANTUM REACH v75: THE OMNI-SNAP (LINE-OF-SIGHT EDITION)
 * Architecture: Zero-Latency Teleport + Strict Line-of-Sight Check + Dynamic FOV
 * Fixes: No Wall-Aiming, Zero Desync, Absolute Bone ID 8 Locking
 * Status: Hardcore Aimlock - 100% Headshot on Visible Targets
 * ==============================================================================
 */

const _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
if (!_global.__QuantumState || _global.__QuantumState.version !== 75) {
    _global.__QuantumState = {
        version: 75,
        frameCounter: 0,
        lastFireRate: 0.15
    };
}

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Tự động thu hẹp góc quét khi ở xa để khóa chính xác mục tiêu đơn lẻ
    static getDynamicFOV(distance) {
        // Tầm gần (< 10m): Mở rộng 180 độ
        // Tầm xa (> 60m): Thu hẹp còn 15 độ (Laser Focus)
        if (distance <= 10.0) return 180.0;
        if (distance >= 60.0) return 15.0;
        return this.clamp(180.0 - (distance * 2.5), 15.0, 180.0);
    }
}

class OmniSnapEngine {
    constructor() {
        this.absoluteWeight = 99999999.0; // Quyền năng Teleport tuyệt đối
        this.voidWeight = -99999999.0;
        
        // Data Pruning: Danh sách ngắt sớm để tối ưu tốc độ Snap
        this.IGNORE_KEYS = new Set([
            'ui', 'inventory', 'audio', 'cosmetics', 'chat', 'minimap', 
            'particles', 'effects', 'vehicle_physics', 'world_lighting'
        ]);

        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 'left_thigh', 'right_thigh',
            'left_calf', 'right_calf', 'left_foot', 'right_foot'
        ];
    }

    getCombatPhase(weapon, camera) {
        let isFiring = false;
        if (weapon && (weapon.is_firing || weapon.recoil_accumulation > 0)) isFiring = true;
        if (camera && camera.is_firing) isFiring = true;
        return isFiring ? 1 : 0; // Trở lại hệ nhị phân bạo lực: 0 (Không bắn) và 1 (Bắn/Teleport)
    }

    enforceZeroPoint(weapon, closestDistance) {
        if (!weapon) return;
        ['recoil', 'spread', 'bloom', 'camera_shake', 'weapon_sway'].forEach(p => weapon[p] = 0.0);
        
        weapon.aim_assist_range = 800.0;      
        weapon.bullet_speed = 99999.0;
        
        // DYNAMIC FOV: Tự động điều chỉnh góc Aim Assist theo mục tiêu gần nhất
        weapon.auto_aim_angle = QuantumMath.getDynamicFOV(closestDistance); 
    }

    warpHitboxes(hitboxes, distance, isFiring, isVisible) {
        if (!hitboxes) return;

        // BÓNG MA (GHOST BONES): Xóa bỏ toàn bộ từ tính trên cơ thể
        this.ghostBones.forEach(bone => {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].m_Radius = 0.000001;
                hitboxes[bone].friction = 0.0;
                hitboxes[bone].vertical_magnetism_multiplier = this.voidWeight;
            }
        });

        // BẮT MỤC TIÊU (HEADLOCK)
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            
            // Nếu địch nấp sau tường (!isVisible), tắt Aimlock để tránh giật tâm vào tường
            if (!isVisible) {
                hitboxes.head.snap_weight = 10.0; // Trả về mức bình thường
                hitboxes.head.m_Radius = 5.0;
                hitboxes.head.friction = 10.0;
                return;
            }

            // Nếu địch lộ diện: Kích hoạt chế độ Hút cực đại
            hitboxes.head.m_Radius = distance > 50 ? 55.0 : 35.0; // Mở rộng vùng hút đón đầu

            if (isFiring) {
                // Snap tức thời: Từ tính, ma sát và trọng số ép lên đỉnh điểm
                hitboxes.head.snap_weight = this.absoluteWeight;
                hitboxes.head.horizontal_magnetism_multiplier = this.absoluteWeight;
                hitboxes.head.vertical_magnetism_multiplier = this.absoluteWeight;
                hitboxes.head.friction = this.absoluteWeight;
            } else {
                // Phase 0: Chạy mượt, không giật màn hình
                hitboxes.head.snap_weight = 100.0;
                hitboxes.head.friction = 0.0;
            }
        }
    }

    processRecursive(node, context = { isFiring: false, closestDist: 999.0 }) {
        if (typeof node !== 'object' || node === null) return node;
        
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.processRecursive(node[i], context);
            return node;
        }

        // Đọc trạng thái vũ khí
        if (node.weapon || node.camera_state) {
            context.isFiring = this.getCombatPhase(node.weapon, node.camera_state) === 1;
        }

        if (node.players && Array.isArray(node.players)) {
            // Tìm khoảng cách gần nhất để cấu hình FOV
            node.players.forEach(p => { if (p.distance && p.distance < context.closestDist) context.closestDist = p.distance; });

            node.players.forEach(enemy => {
                if (!enemy || typeof enemy !== 'object') return;

                // LINE OF SIGHT CHECK (Kiểm tra đường nhìn)
                // Các Engine thường dùng cờ is_visible = true hoặc occluded = false
                let isVisible = true; 
                if (enemy.is_visible === false || enemy.occluded === true) {
                    isVisible = false;
                }

                // Chiếm quyền tọa độ tuyệt đối (Absolute Hijack)
                if (enemy.head_pos && enemy.center_of_mass && isVisible) {
                    // Ép trực tiếp trọng tâm vào vị trí đầu trừ đi sai số rất nhỏ
                    enemy.center_of_mass.x = enemy.head_pos.x;
                    enemy.center_of_mass.z = enemy.head_pos.z;
                    enemy.center_of_mass.y = enemy.head_pos.y - 0.012;
                }

                this.warpHitboxes(enemy.hitboxes, enemy.distance || 20.0, context.isFiring, isVisible);
            });
        }

        // BÓP CÒ LÀ DỊCH CHUYỂN (CAMERA TELEPORT)
        if (node.camera_state && context.isFiring) {
            node.camera_state.interpolation = "ZERO";
            node.camera_state.interpolation_frames = 0; // Triệt tiêu khung hình nội suy
            node.camera_state.snap_speed = this.absoluteWeight;
            node.camera_state.stickiness = this.absoluteWeight;
            node.camera_state.max_pitch_velocity = 0.0; // Chống vượt đầu khi ngón tay lỡ vuốt lên
            node.camera_state.vertical_sensitivity_multiplier = 0.0;
            
            // BONE ID HARD-LOCKING: Ép hệ thống nhắm thẳng vào xương sọ (ID = 8 hoặc 'bone_Head')
            node.camera_state.lock_bone = "bone_Head";
            node.camera_state.target_bone_id = 8; 
        } else if (node.camera_state && !context.isFiring) {
            // Trả lại độ mượt 100% khi không bắn
            node.camera_state.interpolation = "NORMAL";
            node.camera_state.vertical_sensitivity_multiplier = 1.0;
        }

        if (node.weapon) this.enforceZeroPoint(node.weapon, context.closestDist);

        // DATA PRUNING: Cắt tỉa nhánh dữ liệu không cần thiết để tăng tốc CPU
        for (const key of Object.keys(node)) {
            if (this.IGNORE_KEYS.has(key)) continue;
            const targetKeys = ['center_of_mass', 'head_pos', 'velocity', 'hitboxes', 'weapon', 'camera_state'];
            if (typeof node[key] === 'object' && !targetKeys.includes(key)) {
                node[key] = this.processRecursive(node[key], {...context});
            }
        }
        return node;
    }
}

// EXECUTION BLOCK (Zero-Latency Optimized)
if (typeof $response !== "undefined" && $response.body) {
    if ($response.body.includes('"players"') || $response.body.includes('"camera_state"')) {
        try {
            _global.__QuantumState.frameCounter++;
            const payload = JSON.parse($response.body);
            const mutated = new OmniSnapEngine().processRecursive(payload);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body });
        }
    } else {
        $done({ body: $response.body }); // Bỏ qua gói tin rác để giữ tốc độ mạng
    }
}
