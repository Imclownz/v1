/**
 * ==============================================================================
 * QUANTUM REACH v63: THE EQUILIBRIUM (DYNAMIC MAGNETISM)
 * Architecture: Two-Phase Bipartite Trigger + Ghost Body + Absolute Ceiling
 * Optimization: Adaptive Vertical Drag, Anti-Body Gravity, Smooth Tracking
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

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

class EquilibriumEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        
        // Trọng lượng cân bằng (Equilibrium Weight) - Đủ để giữ tâm ở đầu, không đủ để làm khựng Camera
        this.balanceWeight = 150.0; 
        
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    // Kiểm tra trạng thái xả đạn (Pha 1 hay Pha 2)
    checkCombatState(weapon, camera) {
        let isActiveCombat = false;
        // Nếu súng đang có độ giật tích lũy, đang xả đạn, hoặc camera đang ở trạng thái ngắm bắn/khóa mục tiêu
        if (weapon && (weapon.recoil_accumulation > 0.01 || weapon.shots_fired > 0 || weapon.is_firing)) {
            isActiveCombat = true;
        }
        if (camera && (camera.is_firing || camera.is_aiming)) {
            isActiveCombat = true;
        }
        return isActiveCombat;
    }

    enforceZeroPoint(weapon) {
        if (!weapon) return;
        
        const nullifyProps = [
            'recoil', 'spread', 'bloom', 'camera_shake', 'progressive_spread', 
            'recoil_multiplier', 'horizontal_recoil', 'vertical_recoil', 
            'movement_penalty', 'jump_penalty', 'weapon_sway'
        ];

        for (let prop of nullifyProps) {
            if (prop in weapon) weapon[prop] = 0.0;
        }

        weapon.aim_assist_range = 600.0; 
        weapon.auto_aim_angle = 360.0; 
        weapon.bullet_speed = 99999.0; 
    }

    // THUẬT TOÁN TỪ TÍNH ĐỘNG (DYNAMIC MAGNETISM)
    warpHitboxes(hitboxes, distance, isCombatActive) {
        if (!hitboxes) return;

        // 1. LỰC ĐẨY THÂN THỂ (ANTI-BODY GRAVITY)
        // Luôn giữ ở mức Âm Vô Cực để đảm bảo dù lực hút ở đầu có giảm, tâm súng tuyệt đối KHÔNG BAO GIỜ rớt xuống ngực.
        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                hitboxes[bone].vertical_magnetism_multiplier = this.voidWeight; // Đẩy ngược tâm súng lên trên
            }
        }

        // 2. KÍCH HOẠT 2 PHA TẠI VÙNG ĐẦU
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius = distance > 50.0 ? 25.0 : 15.0; 
            
            if (!isCombatActive) {
                // PHA 1: BẮT MỤC TIÊU (ACQUISITION)
                // Khi chưa bắn trúng, kéo tâm lên đầu với lực Thần Thánh.
                hitboxes.head.snap_weight = this.godWeight; 
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight;
                hitboxes.head.friction = this.godWeight;
            } else {
                // PHA 2: DUY TRÌ CÂN BẰNG (EQUILIBRIUM HOLD) - Ý tưởng của bạn
                // Khi viên đạn đầu tiên đã nổ/tâm đã dính, hạ lực dọc xuống mức Cân bằng.
                // Lực này đủ mạnh để chống lại lực rơi tự nhiên, nhưng đủ mềm để không gây văng tâm khi tay bạn vẫn đang vuốt.
                hitboxes.head.snap_weight = this.balanceWeight; 
                hitboxes.head.vertical_magnetism_multiplier = 50.0; // Giảm lực đẩy dọc
                hitboxes.head.friction = 100.0; // Mở khóa ma sát để camera trượt mượt mà
            }

            // Từ tính ngang luôn ở mức tối đa để tracking kẻ địch di chuyển ngang
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight; 
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = isCombatActive ? this.balanceWeight * 0.5 : this.godWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
        }
    }

    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        const interceptPos = QuantumMath.predictInstant(player.head_pos, targetVel, selfVel, dist);

        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        // TRẦN TUYỆT ĐỐI CỦA V60: Vẫn giữ nguyên để làm chốt chặn cuối cùng.
        const absoluteCeiling = player.head_pos.y - 0.02; 
        player.center_of_mass.y = QuantumMath.clamp(interceptPos.y, absoluteCeiling - 0.15, absoluteCeiling);
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, isCombat: false }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        // Đọc trạng thái chiến đấu
        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        context.isCombat = context.isCombat || this.checkCombatState(node.weapon, node.camera_state);

        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                this.warpHitboxes(enemy.hitboxes, enemy.distance || 15.0, context.isCombat);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        if ('camera_state' in node) {
            node.camera_state.interpolation = "ZERO";
            
            if (context.isCombat) {
                // Pha 2: Mở lại một chút độ nhạy dọc để tay bạn có thể điều chỉnh vi mô, không bị khóa cứng đơ
                node.camera_state.vertical_sensitivity_multiplier = 0.5;
            } else {
                // Pha 1: Khóa chặt Y để chống văng khi vừa chạm đầu
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
            }
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
// EXECUTION BLOCK
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new EquilibriumEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
