/**
 * ==============================================================================
 * TARGETING & LOCK-HEAD SYSTEM v50.3 (ABSOLUTE CEILING)
 * Architecture: Anti-Overshoot Clamping + Infinite Vertical Magnetism
 * Status: Maximum Overdrive. Hard-lock Head. Zero Y-Axis Escape.
 * ==============================================================================
 */

class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static predictIntercept(targetPos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 99999.0; 
        const timeOffset = (distance / BULLET_SPEED) + (pingMs / 1000.0) + 0.01;
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeOffset),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeOffset),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeOffset)
        };
    }
}

class QuantumReachEngine {
    constructor() {
        this.voidWeight = -999999.0; 
        this.singularityWeight = 999999.0;
        
        this.limbAndTorsoBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    enforceZeroNormalization(weapon) {
        if (!weapon) return;
        
        const nullifyProps = [
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty', 'strafe_penalty'
        ];

        for (let i = 0; i < nullifyProps.length; i++) {
            if (nullifyProps[i] in weapon) weapon[nullifyProps[i]] = 0.0;
        }

        weapon.aim_assist_range = 999999.0;
        weapon.auto_aim_angle = 360.0;
        weapon.bullet_speed = 999999.0;
    }

    manipulateHitboxes(hitboxes, distance) {
        if (!hitboxes) return;

        // Triệt tiêu hoàn toàn vùng dưới để chống kẹt tâm
        for (let i = 0; i < this.limbAndTorsoBones.length; i++) {
            const bone = this.limbAndTorsoBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                hitboxes[bone].vertical_magnetism_multiplier = 0.0; 
                hitboxes[bone].horizontal_magnetism_multiplier = 0.0;
            }
        }

        // BONG BÓNG TỪ TÍNH CHỐNG VƯỢT ĐẦU
        if (hitboxes.head) {
            // Khi địch ở xa (>50m), phóng to hitbox gấp 45 lần để bù trừ cho việc vuốt trượt pixel
            let headMultiplier = distance < 20.0 ? 20.0 : (distance > 50.0 ? 45.0 : 25.0);

            hitboxes.head.snap_weight = this.singularityWeight; 
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= headMultiplier; 
            
            // Khóa chết trục dọc: Ép từ tính chiều dọc lên cực đại để bắt dính mọi lực vuốt quá tay
            hitboxes.head.vertical_magnetism_multiplier = 999999.0; 
            hitboxes.head.friction = 999999.0; // Tạo "bức tường" ma sát ngay tại đỉnh đầu để chặn Crosshair lại
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.singularityWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.friction = 999999.0; // Chặn tâm rớt xuống
            hitboxes.neck.vertical_magnetism_multiplier = 999999.0;
        }
    }

    injectQuantumIntercept(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const predictedPos = AdvancedMath.predictIntercept(player.head_pos, targetVel, selfVel, dist, ping);

        player.center_of_mass.x = predictedPos.x;
        player.center_of_mass.z = predictedPos.z;
        
        // TRẦN GIỚI HẠN TUYỆT ĐỐI (ABSOLUTE Y-CLAMPING)
        // Neo trọng tâm vĩnh viễn vào giữa khuôn mặt (thấp hơn đỉnh đầu một chút)
        const absoluteCeiling = player.head_pos.y - 0.02; 
        
        // Bất kể bạn vuốt mạnh đến đâu, tọa độ đích của đạn không bao giờ được phép lớn hơn Absolute Ceiling
        player.center_of_mass.y = AdvancedMath.clamp(predictedPos.y, player.chest_pos.y + 0.2, absoluteCeiling);
    }

    process(data) {
        if (!data || typeof data !== 'object') return data;

        if (data.weapon) {
            this.enforceZeroNormalization(data.weapon);
        }

        if (Array.isArray(data.players)) {
            const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
            const pingMs = data.ping || 20;

            for (let i = 0; i < data.players.length; i++) {
                const enemy = data.players[i];
                const dist = enemy.distance || 15.0;
                
                this.manipulateHitboxes(enemy.hitboxes, dist);
                this.injectQuantumIntercept(enemy, selfVel, pingMs);
            }

            // PHONG TỎA GIA TỐC CAMERA (CAMERA LOCKDOWN)
            if (data.players.length > 0 && data.camera_state) {
                data.camera_state.stickiness = 999999.0; // Dán chặt vào mục tiêu
                data.camera_state.interpolation = "ZERO";
                data.camera_state.aim_acceleration = 0.0;
                data.camera_state.max_pitch_velocity = 0.0; // Cắt hoàn toàn quán tính vuốt lên (Pitch) khi đã lock
                data.camera_state.lock_bone = "bone_Head";
            }
        }

        return data;
    }
}

// ==============================================================================
// EXECUTION BLOCK
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumReachEngine();
        const mutatedPayload = Engine.process(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body });
    }
}
