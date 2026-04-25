/**
 * ==============================================================================
 * QUANTUM SINGULARITY v66.6 (THE UNLEASHED)
 * Target: Absolute Server Domination
 * Logic: Data-Level Reality Warping & Instant Convergence
 * WARNING: NO NATURAL BEHAVIOR. PURE BRUTE FORCE.
 * ==============================================================================
 */

class SingularityMath {
    // Ép xung tốc độ xử lý: Sử dụng toán học nhị phân và hằng số cực đại
    static INTERCEPT_CONSTANT = 999999.0;
    
    static calculateHeadshotVector(head, velocity, ping) {
        // Tốc độ đạn gần như tức thời, triệt tiêu mọi sai số di chuyển
        const bulletSpeed = 999999.0; 
        const t = (ping / 1000.0) + 0.0001; 
        return {
            x: head.x + (velocity.x * t),
            y: head.y + (velocity.y * t),
            z: head.z + (velocity.z * t)
        };
    }
}

class SingularityEngine {
    constructor() {
        // Ngưỡng năng lượng cực đại: 999,999.0 (Giới hạn thực của Unity Float32)
        this.MAX_FORCE = 999999.0;
        this.NEGATIVE_VOID = -999999.0;

        this.totalErasureKeys = [
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 'recoil_accumulation',
            'recoil_multiplier', 'horizontal_recoil', 'vertical_recoil', 'bloom',
            'movement_penalty', 'jump_penalty', 'strafe_penalty', 'weapon_sway',
            'shake_amplitude', 'recoil_recovery_rate', 'max_spread'
        ];

        this.ignoredSectors = ['root', 'pelvis', 'spine', 'chest', 'arm', 'leg', 'shoulder', 'thigh', 'calf', 'foot', 'hand'];
    }

    warpReality(node, context = { vS: {x:0, y:0, z:0}, ping: 1 }) {
        if (!node || typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = this.warpReality(node[i], context);
            return node;
        }

        // Cập nhật ngữ cảnh siêu tốc
        if (node.ping) context.ping = 1; // Ép Ping về 1ms giả lập trong tính toán
        if (node.player_velocity) context.vS = node.player_velocity;

        // 1. VÔ HIỆU HÓA VẬT LÝ VŨ KHÍ (WEAPON ERASURE)
        for (const key of this.totalErasureKeys) {
            if (node[key] !== undefined) node[key] = 0.0;
        }
        if (node.bullet_speed) node.bullet_speed = this.MAX_FORCE;
        if (node.aim_assist_range) node.aim_assist_range = this.MAX_FORCE;

        // 2. THAO TÚNG HITBOX: TẠO HỐ ĐEN TỪ TÍNH (HITBOX BLACK HOLE)
        for (const key in node) {
            const part = node[key];
            if (part && typeof part === 'object' && part.snap_weight !== undefined) {
                part.friction = 0.0;
                
                // Đẩy lùi Crosshair khỏi mọi vùng không phải đầu
                if (this.ignoredSectors.some(s => key.includes(s))) {
                    part.snap_weight = this.NEGATIVE_VOID;
                    part.m_Radius = 0.0;
                    part.priority = "NULL";
                } 
                // Cực đại hóa vùng Đầu
                else if (key === 'head') {
                    part.snap_weight = this.MAX_FORCE;
                    part.priority = "CRITICAL";
                    part.m_Radius = 150.0; // Phóng đại Hitbox đầu lên mức không tưởng
                    part.vertical_magnetism_multiplier = this.MAX_FORCE;
                    part.horizontal_magnetism_multiplier = this.MAX_FORCE;
                }
            }
        }

        // 3. CHIẾM QUYỀN TRỌNG TÂM (CENTER OF MASS HIJACK)
        if (node.center_of_mass && node.head_pos) {
            const vT = node.velocity || {x:0, y:0, z:0};
            const target = SingularityMath.calculateHeadshotVector(node.head_pos, vT, context.ping);
            
            // Khóa chết tọa độ Trọng tâm vào Đầu mục tiêu, bỏ qua mọi logic khác
            node.center_of_mass.x = target.x;
            node.center_of_mass.y = target.y;
            node.center_of_mass.z = target.z;
        }

        // 4. KHÓA CỨNG CAMERA (HARD-STUCK CAMERA)
        if (node.camera_state) {
            node.camera_state.stickiness = 1.0;
            node.camera_state.interpolation = "INSTANT";
            node.camera_state.aim_acceleration = this.MAX_FORCE;
            node.camera_state.max_pitch_velocity = this.MAX_FORCE;
            node.camera_state.lock_bone = "bone_Head";
        }

        // Duyệt sâu toàn diện
        for (const key in node) {
            if (typeof node[key] === 'object' && key !== 'center_of_mass') {
                this.warpReality(node[key], context);
            }
        }

        return node;
    }
}

// KHỞI CHẠY ĐIỂM KỲ DỊ
if (typeof $response !== "undefined" && $response.body) {
    try {
        let root = JSON.parse($response.body);
        const Singularity = new SingularityEngine();
        root = Singularity.warpReality(root);
        $done({ body: JSON.stringify(root) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
