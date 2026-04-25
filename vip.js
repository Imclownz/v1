/**
 * ==============================================================================
 * QUANTUM REACH v62: THE TAP-EXECUTIONER
 * Architecture: Zero-Frame Snap, Hip-Fire Precision, 360-Degree Auto-Aim
 * Optimization: One-Tap Headshot, No-Drag Requirement, Zero Bloom/Spread
 * ==============================================================================
 */

class QuantumPhysics {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Dự đoán tức thời - bỏ qua độ trễ đạn bay
    static predictInstant(targetPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0;
        const timeDelta = (distance / BULLET_SPEED) + 0.001; 
        
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeDelta),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeDelta),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeDelta)
        };
    }
}

class QuantumTapEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    enforceHipFirePrecision(weapon) {
        if (!weapon) return;
        
        // TRIỆT TIÊU TẬN GỐC ĐỘ TẢN ĐẠN KHI BẮN THẲNG (HIP-FIRE)
        const nullifyProps = [
            'recoil', 'spread', 'bloom', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'movement_penalty', 'jump_penalty', 'strafe_penalty'
        ];

        for (let prop of nullifyProps) {
            if (prop in weapon) weapon[prop] = 0.0;
        }

        weapon.aim_assist_range = 999.0; 
        weapon.auto_aim_angle = 360.0; // Bắt mục tiêu mọi hướng khi chạm nút bắn
        weapon.bullet_speed = 99999.0;
    }

    warpHitboxes(hitboxes) {
        if (!hitboxes) return;

        // Ép toàn bộ thân dưới thành bóng ma (không bắt tâm)
        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001;
            }
        }

        // Tạo lực hút tĩnh tại Đầu (không cần ma sát chặn lực Drag)
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.godWeight; 
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= 15.0; // Vừa đủ để bao trọn vùng đầu
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight; // Ưu tiên khóa ngang mạnh để bắt mục tiêu đang chạy
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.godWeight * 0.5;
            hitboxes.neck.priority = "HIGH";
        }
    }

    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const interceptPos = QuantumPhysics.predictInstant(player.head_pos, targetVel, selfVel, dist);

        // Ghim tuyệt đối trọng tâm đạn vào giữa não đối thủ
        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        player.center_of_mass.y = player.head_pos.y - 0.05; // Ổn định tại điểm hoàn hảo nhất của hitbox đầu
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0} }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        if ('weapon' in node) this.enforceHipFirePrecision(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                this.warpHitboxes(enemy.hitboxes);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        // SNAP-CAMERA: Giật tâm tức thời khi chạm
        if ('camera_state' in node) {
            node.camera_state.stickiness = this.godWeight; 
            node.camera_state.interpolation = "ZERO"; // Không trượt mềm, Dịch chuyển tức thời
            node.camera_state.aim_acceleration = 0.0;
            node.camera_state.lock_bone = "bone_Head";
        }

        for (const key of Object.keys(node)) {
            if (typeof node[key] === 'object' && !['center_of_mass', 'head_pos', 'chest_pos', 'velocity'].includes(key)) {
                node[key] = this.processRecursive(node[key], context);
            }
        }

        return node;
    }
}

// ==============================================================================
// SHADOWROCKET EXECUTION
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumTapEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
