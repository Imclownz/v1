/**
 * ==============================================================================
 * TARGETING & LOCK-HEAD SYSTEM v50.2 (APEX PREDATOR)
 * Architecture: Vacuum Tunneling (Zero Friction) + Center of Mass Hijacking
 * Status: Maximum Overdrive. Absolute Bypass of Torso/Limbs.
 * ==============================================================================
 */

class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static predictIntercept(targetPos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 99999.0; // Đẩy tốc độ đạn lên mức tối đa
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
        // Đẩy thông số lên ngưỡng tối đa an toàn của Unity (999,999.0)
        this.voidWeight = -999999.0; 
        this.singularityWeight = 999999.0;
        
        // Mở rộng danh sách xương cần triệt tiêu (bao gồm cả tay và chân)
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

        if ('aim_assist_range' in weapon) weapon.aim_assist_range = 999999.0;
        if ('auto_aim_angle' in weapon) weapon.auto_aim_angle = 360.0;
        if ('bullet_speed' in weapon) weapon.bullet_speed = 999999.0;
    }

    manipulateHitboxes(hitboxes, distance) {
        if (!hitboxes) return;

        // PHƯƠNG ÁN 3: Triệt tiêu hoàn toàn ma sát và từ tính vùng thân/chi
        for (let i = 0; i < this.limbAndTorsoBones.length; i++) {
            const bone = this.limbAndTorsoBones[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight; // Đẩy lùi Crosshair
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; // Biến hitbox thành điểm vi mô
                hitboxes[bone].friction = 0.0; // Triệt tiêu ma sát (Không bị khựng tâm)
                hitboxes[bone].vertical_magnetism_multiplier = 0.0; 
                hitboxes[bone].horizontal_magnetism_multiplier = 0.0;
            }
        }

        // Ép xung vùng Đầu (Bong bóng Hitbox)
        if (hitboxes.head) {
            let headMultiplier = distance < 20.0 ? 18.0 : (distance > 50.0 ? 5.0 : 10.0);

            hitboxes.head.snap_weight = this.singularityWeight; // Lực hút hố đen
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= headMultiplier; // Phóng to vùng nhận diện Headshot
            hitboxes.head.vertical_magnetism_multiplier = 35.0; // Tăng tốc độ hút dọc (Drag)
            hitboxes.head.friction = 0.0; // Trượt thẳng vào giữa tâm đầu
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.singularityWeight * 0.6;
            hitboxes.neck.priority = "HIGH";
            hitboxes.neck.friction = 0.0;
            hitboxes.neck.vertical_magnetism_multiplier = 15.0;
        }
    }

    injectQuantumIntercept(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        const predictedPos = AdvancedMath.predictIntercept(player.head_pos, targetVel, selfVel, dist, ping);

        // PHƯƠNG ÁN 4: Dịch chuyển Trọng tâm tuyệt đối (Center of Mass Hijacking)
        // Loại bỏ hoàn toàn sự phụ thuộc vào chest_pos. Cắm thẳng Trọng tâm vào Đầu.
        player.center_of_mass.x = predictedPos.x;
        player.center_of_mass.z = predictedPos.z;
        
        // Neo Trọng tâm ngay dưới đỉnh đầu một chút để đảm bảo Aim Assist luôn dính Headshot
        // Bất chấp khoảng cách, đạn luôn hướng về tọa độ này.
        player.center_of_mass.y = player.head_pos.y - 0.05; 
        
        // Giới hạn trần an toàn
        player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.head_pos.y - 0.2, player.head_pos.y + 0.1);
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

            if (data.players.length > 0 && data.camera_state) {
                // Khóa cứng màn hình Camera vào xương Đầu
                data.camera_state.stickiness = 1.0;
                data.camera_state.interpolation = "ZERO";
                data.camera_state.aim_acceleration = 0.0;
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
