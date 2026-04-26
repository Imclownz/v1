/**
 * ==============================================================================
 * QUANTUM REACH v60.5: THE GOD CODE (Y-AXIS FREEZE EDITION)
 * Architecture: Absolute Coordinate Hijacking + Y-Axis Mechanical Lock
 * Optimization: Unrestricted X-Axis Tracking, Zero Vertical Overshoot
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Dự đoán tức thời (God Mode) - Bỏ qua độ trễ đạn bay
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

class QuantumFreezeEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        
        // Hóa bóng ma toàn bộ phần thân dưới để tâm súng không bị cản lực
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    // 1. HỎA LỰC ZERO-POINT: Xóa bỏ mọi yếu tố cản trở đường đạn
    enforceZeroPoint(weapon) {
        if (!weapon) return;
        
        const nullifyProps = [
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty', 'strafe_penalty',
            'weapon_sway', 'recoil_recovery_rate'
        ];

        for (let i = 0; i < nullifyProps.length; i++) {
            if (nullifyProps[i] in weapon) weapon[nullifyProps[i]] = 0.0;
        }

        weapon.aim_assist_range = 600.0; 
        weapon.auto_aim_angle = 360.0; 
        weapon.bullet_speed = 99999.0; 
        if ('range_damage_falloff' in weapon) weapon.range_damage_falloff = 0.0; 
    }

    // 2. HITBOX MANIPULATION: Phễu từ tính và Bóng ma
    warpHitboxes(hitboxes, distance) {
        if (!hitboxes) return;

        // Triệt tiêu ma sát và từ tính vùng thân
        for (let i = 0; i < this.ghostBones.length; i++) {
            const bone = this.ghostBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
            }
        }

        // Tạo lực hút tĩnh cực đại tại Đầu
        if (hitboxes.head) {
            let auraMultiplier = distance < 20.0 ? 25.0 : (distance > 50.0 ? 50.0 : 35.0);

            hitboxes.head.snap_weight = this.godWeight; 
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= auraMultiplier; 
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight; // Cho phép trượt ngang thoải mái
            // Lưu ý: Không dùng vertical_magnetism khổng lồ ở đây nữa, vì ta sẽ khóa nó ở Camera State
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.godWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
        }
    }

    // 3. HIJACK TRỌNG TÂM: Neo cứng đạn vào giữa sọ
    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const interceptPos = QuantumMath.predictInstant(player.head_pos, targetVel, selfVel, dist);

        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        // TRẦN TUYỆT ĐỐI TẠI TẦNG DỮ LIỆU
        const absoluteCeiling = player.head_pos.y - 0.02; 
        player.center_of_mass.y = QuantumMath.clamp(interceptPos.y, player.chest_pos ? player.chest_pos.y + 0.3 : absoluteCeiling - 0.1, absoluteCeiling);
    }

    // 4. CHỐT CHẶN CƠ HỌC: ĐÓNG BĂNG TRỤC Y
    applyYAxisFreeze(cameraState) {
        if (!cameraState) return;
        
        cameraState.stickiness = this.godWeight; 
        cameraState.lock_bone = "bone_Head";
        cameraState.interpolation = "ZERO";

        // TẮT HOÀN TOÀN TÍN HIỆU VUỐT DỌC CỦA NGƯỜI CHƠI
        cameraState.vertical_sensitivity_multiplier = 0.0; 
        
        // TRIỆT TIÊU GIA TỐC VÀ QUÁN TÍNH TRỤC Y
        cameraState.max_pitch_velocity = 0.0; 
        cameraState.pitch_damping = this.godWeight; 
        
        // Giữ nguyên trục X (Yaw) để người chơi vẫn có thể lia tâm ngang theo kẻ địch đang chạy
        cameraState.horizontal_sensitivity_multiplier = 1.0; 
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
        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let i = 0; i < node.players.length; i++) {
                const enemy = node.players[i];
                const dist = enemy.distance || 15.0;
                
                this.warpHitboxes(enemy.hitboxes, dist);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        // Kích hoạt chốt chặn Camera ở mọi node tìm thấy
        if ('camera_state' in node) {
            this.applyYAxisFreeze(node.camera_state);
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
        const Engine = new QuantumFreezeEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
