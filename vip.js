/**
 * ==============================================================================
 * QUANTUM REACH v65: THE AERIAL DOMINATOR
 * Architecture: Tri-Phase State Machine + Airborne Repulsion Shield + Gravity Bias
 * Optimization: Anti-Jump-Shot, Dynamic Y-Axis Correction, Deep Ghosting
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * BÙ TRỪ GIA TỐC TRỌNG LỰC (GRAVITY BIAS)
     * Tính toán quỹ đạo nhảy dựa trên vận tốc trục Y.
     */
    static predictAirborne(targetPos, targetVel, selfVel, distance) {
        const BULLET_SPEED = 99999.0;
        const timeDelta = (distance / BULLET_SPEED) + 0.001; 
        
        let predictedY = targetPos.y + ((targetVel.y - selfVel.y) * timeDelta);

        // Phát hiện trạng thái bay (Airborne): Nếu vận tốc Y lớn (đang nhảy lên hoặc rơi xuống)
        if (Math.abs(targetVel.y) > 0.5) {
            // Thêm một hằng số bù trừ (Bias) hướng lên trên để đón đầu quỹ đạo nhảy
            // Công thức nội suy: Y_target = Y_base + (V_y * t) + Bias
            const gravityBias = targetVel.y > 0 ? 0.05 : 0.02; 
            predictedY += gravityBias;
        }

        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeDelta),
            y: predictedY,
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeDelta)
        };
    }
}

class AerialDominatorEngine {
    constructor() {
        this.godWeight = 999999.0;
        this.voidWeight = -999999.0;
        this.balanceWeight = 150.0; 
        
        this.ghostBones = [
            'root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 
            'left_arm', 'right_arm', 'left_leg', 'right_leg', 
            'left_shoulder', 'right_shoulder', 'left_thigh', 'right_thigh', 
            'left_calf', 'right_calf', 'left_foot', 'right_foot', 'left_hand', 'right_hand'
        ];
    }

    getCombatPhase(weapon, camera) {
        let isFiring = false;
        let shotCount = 0;

        if (weapon) {
            if (weapon.is_firing || weapon.recoil_accumulation > 0) isFiring = true;
            if (weapon.shots_fired !== undefined) {
                shotCount = weapon.shots_fired;
            } else if (weapon.recoil_accumulation !== undefined) {
                shotCount = weapon.recoil_accumulation / 0.02; 
            }
        }
        
        if (camera && camera.is_firing) isFiring = true;

        if (!isFiring) return 0;       
        if (shotCount <= 2.5) return 1; 
        return 2;                      
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

    warpHitboxes(hitboxes, distance, phase, targetVel) {
        if (!hitboxes) return;

        // Xác định xem kẻ địch có đang nhảy không (Vận tốc Y đáng kể)
        const isAirborne = Math.abs(targetVel.y) > 0.5;

        // LƯỚI ĐẨY KHÔNG TRUNG (AIRBORNE REPULSION SHIELD)
        for (let bone of this.ghostBones) {
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.voidWeight;
                hitboxes[bone].priority = "IGNORE";
                hitboxes[bone].m_Radius = 0.00001; 
                hitboxes[bone].friction = 0.0; 
                
                // Nếu địch đang nhảy, nhân lực đẩy từ tính của thân dưới lên gấp 10 lần
                const currentRepulsion = isAirborne ? (this.voidWeight * 10.0) : this.voidWeight;
                hitboxes[bone].vertical_magnetism_multiplier = currentRepulsion; 
            }
        }

        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            // Khi địch nhảy, vùng đầu khó ngắm hơn, ta phóng to hitbox đầu thêm một chút
            hitboxes.head.m_Radius = distance > 50.0 ? 30.0 : (isAirborne ? 25.0 : 18.0); 
            hitboxes.head.horizontal_magnetism_multiplier = this.godWeight; 
            
            if (phase === 0 || phase === 1) {
                hitboxes.head.snap_weight = this.godWeight; 
                hitboxes.head.vertical_magnetism_multiplier = this.godWeight;
                hitboxes.head.friction = this.godWeight;
            } else if (phase === 2) {
                hitboxes.head.snap_weight = this.balanceWeight; 
                hitboxes.head.vertical_magnetism_multiplier = 40.0; 
                hitboxes.head.friction = 80.0; 
            }
        }

        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = (phase === 2) ? this.balanceWeight * 0.5 : this.godWeight * 0.8;
            hitboxes.neck.priority = "HIGH";
        }
    }

    hijackCoordinate(player, selfVel) {
        if (!player || !player.head_pos || !player.center_of_mass) return;

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        
        // Sử dụng hàm dự đoán không gian mới
        const interceptPos = QuantumMath.predictAirborne(player.head_pos, targetVel, selfVel, dist);

        player.center_of_mass.x = interceptPos.x;
        player.center_of_mass.z = interceptPos.z;
        
        // NEO XƯƠNG TUYỆT ĐỐI (ABSOLUTE BONE ANCHORING)
        // Bỏ qua hoàn toàn dữ liệu ngực/bụng khi địch nhảy, chỉ tính từ đỉnh đầu trở xuống
        const absoluteCeiling = player.head_pos.y - 0.02; 
        
        // Nếu địch nhảy (targetVel.y lớn), siết chặt trần giới hạn hơn nữa để chống tụt tâm
        const floorLimit = Math.abs(targetVel.y) > 0.5 ? absoluteCeiling - 0.08 : absoluteCeiling - 0.15;
        
        player.center_of_mass.y = QuantumMath.clamp(interceptPos.y, floorLimit, absoluteCeiling);
    }

    processRecursive(node, context = { selfVel: {x:0, y:0, z:0}, phase: 0 }) {
        if (typeof node !== 'object' || node === null) return node;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = this.processRecursive(node[i], context);
            }
            return node;
        }

        if ('player_velocity' in node) context.selfVel = node.player_velocity;
        
        const currentPhase = this.getCombatPhase(node.weapon, node.camera_state);
        if (currentPhase > context.phase) context.phase = currentPhase; 

        if ('weapon' in node) this.enforceZeroPoint(node.weapon);

        if ('players' in node && Array.isArray(node.players)) {
            for (let enemy of node.players) {
                const targetVel = enemy.velocity || { x: 0, y: 0, z: 0 };
                this.warpHitboxes(enemy.hitboxes, enemy.distance || 15.0, context.phase, targetVel);
                this.hijackCoordinate(enemy, context.selfVel);
            }
        }

        if ('camera_state' in node) {
            node.camera_state.interpolation = "ZERO";
            
            if (context.phase === 1) {
                node.camera_state.vertical_sensitivity_multiplier = 0.0;
                node.camera_state.max_pitch_velocity = 0.0;
            } else if (context.phase === 2) {
                node.camera_state.vertical_sensitivity_multiplier = 0.4;
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
        const Engine = new AerialDominatorEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body }); 
    }
}
